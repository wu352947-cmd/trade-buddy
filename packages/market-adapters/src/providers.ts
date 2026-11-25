import type {
  BarsResponse,
  DataProvenance,
  Interval,
  NormalizedBar,
  SymbolMeta,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";

import { DEFAULT_SYMBOL_ID, getSymbolById, SYMBOL_CATALOG } from "./catalog";
import { computeQuoteFromDailyBars, resampleDailyBars } from "./resample";

import usAapl1d from "../data/samples/US_AAPL_1D.json";
import usAapl60m from "../data/samples/US_AAPL_60m.json";
import usMsft1d from "../data/samples/US_MSFT_1D.json";
import usTsla1d from "../data/samples/US_TSLA_1D.json";
import usAmzn1d from "../data/samples/US_AMZN_1D.json";
import cn600519 from "../data/samples/CN_600519_1D.json";
import cn000001 from "../data/samples/CN_000001_1D.json";
import cn600036 from "../data/samples/CN_600036_1D.json";
import hk00700 from "../data/samples/HK_00700_1D.json";
import hk09988 from "../data/samples/HK_09988_1D.json";
import hk03690 from "../data/samples/HK_03690_1D.json";
import idxQqq1d from "../data/samples/IDX_QQQ_1D.json";
import idxQqq60m from "../data/samples/IDX_QQQ_60m.json";
import idxVti1d from "../data/samples/IDX_VTI_1D.json";
import idxSp5001d from "../data/samples/IDX_SP500_1D.json";

interface SampleFile {
  meta: {
    symbolId: string;
    interval: string;
    source: string;
    dateRange: string;
    count: number;
  };
  bars: NormalizedBar[];
}

const DAILY_SAMPLES: Record<string, SampleFile> = {
  "US:AAPL": usAapl1d as SampleFile,
  "US:MSFT": usMsft1d as SampleFile,
  "US:TSLA": usTsla1d as SampleFile,
  "US:AMZN": usAmzn1d as SampleFile,
  "CN:600519.SH": cn600519 as SampleFile,
  "CN:000001.SZ": cn000001 as SampleFile,
  "CN:600036.SH": cn600036 as SampleFile,
  "HK:00700.HK": hk00700 as SampleFile,
  "HK:09988.HK": hk09988 as SampleFile,
  "HK:03690.HK": hk03690 as SampleFile,
  "IDX:QQQ": idxQqq1d as SampleFile,
  "IDX:VTI": idxVti1d as SampleFile,
  "IDX:SP500": idxSp5001d as SampleFile,
};

const INTRADAY_60M_SAMPLES: Record<string, SampleFile> = {
  "US:AAPL": usAapl60m as SampleFile,
  "IDX:QQQ": idxQqq60m as SampleFile,
};

interface CacheEntry {
  bars: NormalizedBar[];
  provenance: DataProvenance;
  expiresAt: number;
}

const LIVE_CACHE = new Map<string, CacheEntry>();
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface AdapterEnvStatus {
  fredPublicEnabled: boolean;
  twelveDataConfigured: boolean;
  polygonConfigured: boolean;
  finnhubConfigured: boolean;
  eodhdConfigured: boolean;
  tushareConfigured: boolean;
}

export function getAdapterEnvStatus(): AdapterEnvStatus {
  return {
    fredPublicEnabled: process.env.ENABLE_PUBLIC_FRED !== "false",
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY?.trim()),
    polygonConfigured: Boolean(process.env.POLYGON_API_KEY?.trim()),
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY?.trim()),
    eodhdConfigured: Boolean(process.env.EODHD_API_KEY?.trim()),
    tushareConfigured: Boolean(process.env.TUSHARE_TOKEN?.trim()),
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "TradeBuddy/0.1 (local-research)",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

function formatRange(bars: NormalizedBar[]): string {
  if (bars.length === 0) return "";
  const first = new Date(bars[0].timestamp).toISOString().slice(0, 10);
  const last = new Date(bars[bars.length - 1].timestamp).toISOString().slice(0, 10);
  return `${first} ~ ${last}`;
}

/**
 * 免 Key 官方公开源：美联储 FRED SP500 每日收盘指数序列
 * 失败自动回退仓库捆绑的 FRED 历史样本
 */
async function tryFetchFredSP500(): Promise<{
  bars: NormalizedBar[];
  provenance: DataProvenance;
} | null> {
  if (process.env.ENABLE_PUBLIC_FRED === "false") return null;
  try {
    const res = await fetchWithTimeout(
      "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500&cosd=2024-06-01",
      {},
      4500
    );
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/).slice(1);
    const points: Array<{ date: string; close: number }> = [];
    for (const line of lines) {
      const [dateStr, valStr] = line.split(",");
      if (!dateStr || !valStr || valStr.trim() === ".") continue;
      const close = Number(valStr.trim());
      if (!Number.isFinite(close) || close <= 0) continue;
      points.push({ date: dateStr.trim(), close });
    }
    if (points.length < 30) return null;
    const bars: NormalizedBar[] = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].close;
      const cur = points[i].close;
      const ts = Date.parse(`${points[i].date}T00:00:00Z`);
      if (!Number.isFinite(ts)) continue;
      bars.push({
        timestamp: ts,
        open: Number(prev.toFixed(2)),
        high: Number(Math.max(prev, cur).toFixed(2)),
        low: Number(Math.min(prev, cur).toFixed(2)),
        close: Number(cur.toFixed(2)),
        volume: 0,
      });
    }
    return {
      bars,
      provenance: {
        kind: "official_fred",
        badge: "FRED 官方日线",
        provider: "FRED 美联储官方公开 CSV（在线刷新）",
        delayNote: "官方滞后 1 交易日收盘指数序列（仅收盘价，无成交量）",
        dateRange: formatRange(bars),
        isSample: false,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 可选：Twelve Data Free（仅当用户自行配置 TWELVE_DATA_API_KEY 时调用）
 */
async function tryFetchTwelveData(
  symbol: SymbolMeta,
  interval: Interval
): Promise<{ bars: NormalizedBar[]; provenance: DataProvenance } | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) return null;
  if (symbol.market !== "US" && symbol.id !== "IDX:QQQ" && symbol.id !== "IDX:VTI") {
    return null;
  }
  const tdInterval = interval === "60m" ? "1h" : "1day";
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol.ticker
    )}&interval=${tdInterval}&outputsize=400&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      values?: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
      }>;
    };
    if (!Array.isArray(json.values) || json.values.length < 10) return null;
    const bars: NormalizedBar[] = json.values
      .map((v) => {
        const iso = v.datetime.includes(" ")
          ? v.datetime.replace(" ", "T") + "Z"
          : `${v.datetime}T00:00:00Z`;
        return {
          timestamp: Date.parse(iso),
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: Number(v.volume || 0),
        };
      })
      .filter((b) => Number.isFinite(b.timestamp) && b.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (bars.length < 10) return null;
    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : "delayed",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? "ETF代理 · TwelveData"
            : "TwelveData 免费档",
        provider: "Twelve Data Free REST API（在线）",
        delayNote: "美股免费档延迟 15 分钟 / 收盘更新（8次/分，800次/天）",
        dateRange: formatRange(bars),
        isSample: false,
        isProxy: symbol.assetType === "FUTURES_PROXY",
        proxyOf: symbol.defaultProvenance.proxyOf,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 可选：Polygon.io Stocks Free（仅当用户自行配置 POLYGON_API_KEY 时调用）
 */
async function tryFetchPolygon(
  symbol: SymbolMeta
): Promise<{ bars: NormalizedBar[]; provenance: DataProvenance } | null> {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey) return null;
  if (symbol.market !== "US" && symbol.id !== "IDX:QQQ" && symbol.id !== "IDX:VTI") {
    return null;
  }
  try {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 550 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
      symbol.ticker
    )}/range/1/day/${fromDate}/${to}?adjusted=true&sort=asc&limit=500&apiKey=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        t: number;
        o: number;
        h: number;
        l: number;
        c: number;
        v?: number;
      }>;
    };
    if (!Array.isArray(json.results) || json.results.length < 10) return null;
    const bars: NormalizedBar[] = json.results.map((r) => ({
      timestamp: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v ?? 0,
    }));
    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : "eod",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? "ETF代理 · Polygon"
            : "Polygon 日线 EOD",
        provider: "Polygon.io Stocks Free（在线）",
        delayNote: "免费档限 5 次/分钟、近 2 年收盘日线（非实时 SIP）",
        dateRange: formatRange(bars),
        isSample: false,
        isProxy: symbol.assetType === "FUTURES_PROXY",
        proxyOf: symbol.defaultProvenance.proxyOf,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 可选：EODHD Free（仅当用户自行配置 EODHD_API_KEY 时调用）
 */
async function tryFetchEodhd(
  symbol: SymbolMeta
): Promise<{ bars: NormalizedBar[]; provenance: DataProvenance } | null> {
  const apiKey = process.env.EODHD_API_KEY?.trim();
  if (!apiKey) return null;
  let eodTicker: string | null = null;
  if (symbol.market === "US" || symbol.id === "IDX:QQQ" || symbol.id === "IDX:VTI") {
    eodTicker = `${symbol.ticker}.US`;
  } else if (symbol.market === "HK") {
    eodTicker = `${symbol.ticker.replace(/^0+/, "")}.HK`;
  }
  if (!eodTicker) return null;

  try {
    const fromDate = new Date(Date.now() - 550 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(
      eodTicker
    )}?api_token=${encodeURIComponent(apiKey)}&fmt=json&from=${fromDate}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
    }>;
    if (!Array.isArray(rows) || rows.length < 10) return null;
    const bars: NormalizedBar[] = rows
      .map((r) => ({
        timestamp: Date.parse(`${r.date}T00:00:00Z`),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume || 0),
      }))
      .filter((b) => Number.isFinite(b.timestamp) && b.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      bars,
      provenance: {
        kind: "eod",
        badge: "EODHD 日线 EOD",
        provider: "EODHD Free API（在线）",
        delayNote: "收盘日线 EOD（免费档每日限 20 次请求）",
        dateRange: formatRange(bars),
        isSample: false,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 可选：Tushare Pro（仅当用户自行配置 TUSHARE_TOKEN 时调用，严禁自动读取仓外凭证）
 */
async function tryFetchTushare(
  symbol: SymbolMeta
): Promise<{ bars: NormalizedBar[]; provenance: DataProvenance } | null> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token || symbol.market !== "CN") return null;
  const tsCode = symbol.id.replace(/^CN:/, "");
  try {
    const res = await fetchWithTimeout(
      "https://api.tushare.pro",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_name: "daily",
          token,
          params: { ts_code: tsCode },
          fields: "trade_date,open,high,low,close,vol",
        }),
      },
      6000
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: number;
      data?: { fields: string[]; items: Array<Array<string | number>> };
    };
    if (json.code !== 0 || !json.data?.items?.length) return null;
    const idxDate = json.data.fields.indexOf("trade_date");
    const idxOpen = json.data.fields.indexOf("open");
    const idxHigh = json.data.fields.indexOf("high");
    const idxLow = json.data.fields.indexOf("low");
    const idxClose = json.data.fields.indexOf("close");
    const idxVol = json.data.fields.indexOf("vol");

    const bars: NormalizedBar[] = json.data.items
      .slice(0, 500)
      .map((row) => {
        const d = String(row[idxDate]);
        const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`;
        return {
          timestamp: Date.parse(iso),
          open: Number(row[idxOpen]),
          high: Number(row[idxHigh]),
          low: Number(row[idxLow]),
          close: Number(row[idxClose]),
          volume: Math.round(Number(row[idxVol] || 0) * 100),
        };
      })
      .filter((b) => Number.isFinite(b.timestamp) && b.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (bars.length < 10) return null;
    return {
      bars,
      provenance: {
        kind: "eod",
        badge: "Tushare 日线 EOD",
        provider: "Tushare Pro 个人账号（在线）",
        delayNote: "A 股收盘日线 EOD（盘后更新，非盘中实时流）",
        dateRange: formatRange(bars),
        isSample: false,
      },
    };
  } catch {
    return null;
  }
}

function getSampleDaily(symbol: SymbolMeta): {
  bars: NormalizedBar[];
  provenance: DataProvenance;
} {
  const sample = DAILY_SAMPLES[symbol.id];
  if (!sample) {
    return {
      bars: [],
      provenance: symbol.defaultProvenance,
    };
  }
  return {
    bars: sample.bars,
    provenance: {
      ...symbol.defaultProvenance,
      provider: sample.meta.source,
      dateRange: sample.meta.dateRange,
      isSample: true,
      badge:
        symbol.assetType === "FUTURES_PROXY"
          ? "ETF代理 · 历史样本"
          : symbol.id === "IDX:SP500"
          ? "FRED 样本 · 日线"
          : "历史样本 · 日线 EOD",
    },
  };
}

export async function getBarsForSymbol(
  rawSymbolId: string,
  requestedInterval: Interval = "1D"
): Promise<BarsResponse> {
  const symbol = getSymbolById(rawSymbolId) ?? getSymbolById(DEFAULT_SYMBOL_ID)!;
  const interval: Interval = symbol.supportedIntervals.includes(requestedInterval)
    ? requestedInterval
    : "1D";

  const cacheKey = `${symbol.id}:${interval === "60m" ? "60m" : "1D"}`;
  const cached = LIVE_CACHE.get(cacheKey);

  // 1. 60m intraday path (supported for US:AAPL and IDX:QQQ)
  if (interval === "60m") {
    let bars: NormalizedBar[] | null = null;
    let provenance: DataProvenance | null = null;

    if (cached && cached.expiresAt > Date.now()) {
      bars = cached.bars;
      provenance = cached.provenance;
    } else {
      const td = await tryFetchTwelveData(symbol, "60m");
      if (td) {
        bars = td.bars;
        provenance = td.provenance;
        LIVE_CACHE.set(cacheKey, {
          bars: td.bars,
          provenance: td.provenance,
          expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
        });
      }
    }

    if (!bars || !provenance) {
      const sample60 = INTRADAY_60M_SAMPLES[symbol.id];
      if (sample60) {
        bars = sample60.bars;
        provenance = {
          ...symbol.defaultProvenance,
          badge:
            symbol.assetType === "FUTURES_PROXY"
              ? "ETF代理 · 60m样本"
              : "历史样本 · 60分钟",
          provider: sample60.meta.source,
          dateRange: sample60.meta.dateRange,
          isSample: true,
        };
      }
    }

    if (bars && provenance) {
      const dailyForQuote = getSampleDaily(symbol).bars;
      return {
        symbol,
        interval: "60m",
        bars,
        quote: computeQuoteFromDailyBars(
          symbol.id,
          dailyForQuote.length ? dailyForQuote : bars
        ),
        provenance,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  // 2. Daily / Weekly / Monthly path (always fetch/resolve daily base first, then resample)
  let dailyBars: NormalizedBar[] | null = null;
  let provenance: DataProvenance | null = null;

  if (cached && cached.expiresAt > Date.now()) {
    dailyBars = cached.bars;
    provenance = cached.provenance;
  } else {
    let liveResult: { bars: NormalizedBar[]; provenance: DataProvenance } | null =
      null;

    if (symbol.id === "IDX:SP500") {
      liveResult = await tryFetchFredSP500();
    } else if (symbol.market === "CN") {
      liveResult = await tryFetchTushare(symbol);
    } else if (symbol.market === "HK") {
      liveResult = await tryFetchEodhd(symbol);
    } else {
      liveResult =
        (await tryFetchTwelveData(symbol, "1D")) ??
        (await tryFetchPolygon(symbol)) ??
        (await tryFetchEodhd(symbol));
    }

    if (liveResult) {
      dailyBars = liveResult.bars;
      provenance = liveResult.provenance;
      LIVE_CACHE.set(cacheKey, {
        bars: liveResult.bars,
        provenance: liveResult.provenance,
        expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
      });
    }
  }

  if (!dailyBars || !provenance) {
    const sample = getSampleDaily(symbol);
    dailyBars = sample.bars;
    provenance = sample.provenance;
  }

  const finalBars = resampleDailyBars(dailyBars, interval);
  const quote = computeQuoteFromDailyBars(symbol.id, dailyBars);

  return {
    symbol,
    interval,
    bars: finalBars,
    quote,
    provenance,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 极速生成全部 4 大市场分组的自选摘要（使用本地样本收盘快照，零阻塞首屏）
 */
export function getWatchlistSummaries(): WatchlistSummaryItem[] {
  return SYMBOL_CATALOG.map((symbol) => {
    const sample = getSampleDaily(symbol);
    const quote = computeQuoteFromDailyBars(symbol.id, sample.bars);
    return {
      symbol,
      quote,
      provenance: sample.provenance,
    };
  });
}
