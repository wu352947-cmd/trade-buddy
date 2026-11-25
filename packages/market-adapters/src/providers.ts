import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  BarsResponse,
  DataProvenance,
  Interval,
  NormalizedBar,
  NormalizedQuote,
  QuoteResponse,
  SymbolMeta,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";

import {
  fetchWithTimeout,
  recordProviderSuccess,
  recordRateLimitBackoff,
  recordTransientFailure,
  StaleCache,
  tryAcquireQuota,
} from "./cache-limiter";
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

const execFileAsync = promisify(execFile);

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

const FRED_SERIES_MAP: Record<string, { seriesId: string; label: string }> = {
  "IDX:SP500": { seriesId: "SP500", label: "标普 500 指数" },
  "IDX:NASDAQCOM": { seriesId: "NASDAQCOM", label: "纳斯达克综合指数" },
};

interface BarsCacheValue {
  bars: NormalizedBar[];
  provenance: DataProvenance;
}

interface LiveQuotePatch {
  last: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  updatedAt: string;
  provider: string;
  badge: string;
  delayNote: string;
  delayMinutes?: number;
  kind: DataProvenance["kind"];
}

const BARS_CACHE = new StaleCache<BarsCacheValue>(200);
const QUOTE_CACHE = new StaleCache<LiveQuotePatch>(200);

const DAILY_CACHE_TTL_MS = 10 * 60 * 1000;
const INTRADAY_CACHE_TTL_MS = 5 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 60 * 1000;
const BARS_STALE_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTE_STALE_TTL_MS = 30 * 60 * 1000;

export interface AdapterEnvStatus {
  fredPublicEnabled: boolean;
  publicFeedsEnabled: boolean;
  baostockEnabled: boolean;
  secUserAgentCustom: boolean;
  twelveDataConfigured: boolean;
  polygonConfigured: boolean;
  finnhubConfigured: boolean;
  eodhdConfigured: boolean;
  tushareConfigured: boolean;
}

export function getAdapterEnvStatus(): AdapterEnvStatus {
  return {
    fredPublicEnabled: process.env.ENABLE_PUBLIC_FRED !== "false",
    publicFeedsEnabled: process.env.ENABLE_PUBLIC_FEEDS !== "false",
    baostockEnabled: process.env.ENABLE_BAOSTOCK === "true",
    secUserAgentCustom: Boolean(process.env.SEC_EDGAR_USER_AGENT?.trim()),
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY?.trim()),
    polygonConfigured: Boolean(process.env.POLYGON_API_KEY?.trim()),
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY?.trim()),
    eodhdConfigured: Boolean(process.env.EODHD_API_KEY?.trim()),
    tushareConfigured: Boolean(process.env.TUSHARE_TOKEN?.trim()),
  };
}

function isUsEquityOrEtf(symbol: SymbolMeta): boolean {
  return (
    symbol.market === "US" ||
    symbol.id === "IDX:QQQ" ||
    symbol.id === "IDX:VTI"
  );
}

function resolveEffectiveSymbol(symbol: SymbolMeta): SymbolMeta {
  const env = getAdapterEnvStatus();
  const hasUsIntradayKey = env.twelveDataConfigured || env.polygonConfigured;
  if (
    hasUsIntradayKey &&
    isUsEquityOrEtf(symbol) &&
    !symbol.supportedIntervals.includes("60m")
  ) {
    return {
      ...symbol,
      supportedIntervals: ["60m", ...symbol.supportedIntervals],
    };
  }
  return symbol;
}

function formatRange(bars: NormalizedBar[]): string {
  if (bars.length === 0) return "";
  const first = new Date(bars[0].timestamp).toISOString().slice(0, 10);
  const last = new Date(bars[bars.length - 1].timestamp).toISOString().slice(0, 10);
  return `${first} ~ ${last}`;
}

function parseRetryAfter(res: Response): number | undefined {
  const header = res.headers.get("retry-after");
  if (!header) return undefined;
  const num = Number(header);
  return Number.isFinite(num) && num > 0 ? Math.min(num, 600) : undefined;
}

/**
 * 免 Key 官方公开源：美联储 FRED 每日收盘指数序列（SP500 / NASDAQCOM）
 * 失败自动走 stale 缓存或回退仓库捆绑的 FRED 历史样本
 */
async function tryFetchFredSeries(
  symbol: SymbolMeta
): Promise<BarsCacheValue | null> {
  if (process.env.ENABLE_PUBLIC_FRED === "false") return null;
  const spec = FRED_SERIES_MAP[symbol.id];
  if (!spec) return null;

  const quota = tryAcquireQuota("fred");
  if (!quota.allowed) return null;

  try {
    const startDate = new Date(Date.now() - 730 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const res = await fetchWithTimeout(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(
        spec.seriesId
      )}&cosd=${startDate}`,
      {},
      5000
    );
    if (res.status === 429) {
      recordRateLimitBackoff("fred", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("fred", `HTTP ${res.status}`);
      return null;
    }

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
    if (points.length < 20) return null;

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

    recordProviderSuccess("fred");
    return {
      bars,
      provenance: {
        kind: "official_fred",
        badge: "FRED 官方日线",
        provider: `FRED 美联储官方公开 CSV（${spec.seriesId} 在线）`,
        delayNote: "官方免 Key 滞后 1 交易日收盘指数序列（仅收盘价，无成交量）",
        dateRange: formatRange(bars),
        isSample: false,
      },
    };
  } catch {
    recordTransientFailure("fred", "网络超时或离线");
    return null;
  }
}

/**
 * 可选：Twelve Data Free（美股及美股 ETF 1D 与 60m）
 */
async function tryFetchTwelveDataBars(
  symbol: SymbolMeta,
  interval: Interval
): Promise<BarsCacheValue | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("twelvedata");
  if (!quota.allowed) return null;

  const tdInterval = interval === "60m" ? "1h" : "1day";
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol.ticker
    )}&interval=${tdInterval}&outputsize=400&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 6500);
    if (res.status === 429) {
      recordRateLimitBackoff("twelvedata", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("twelvedata", `HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      status?: string;
      code?: number;
      values?: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume?: string;
      }>;
    };
    if (json.code === 429) {
      recordRateLimitBackoff("twelvedata");
      return null;
    }
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
    recordProviderSuccess("twelvedata");

    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : "delayed",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? `ETF代理 · TwelveData ${interval === "60m" ? "60m延迟15分" : "延迟"}`
            : interval === "60m"
            ? "TwelveData 延迟15分 · 60m"
            : "TwelveData 延迟15分 · 日线",
        provider: "Twelve Data Free REST API（在线）",
        delayNote: "美股免费档延迟约 15 分钟 / 收盘更新（配额 8次/分、800次/天，非交易所实时）",
        delayMinutes: 15,
        dateRange: formatRange(bars),
        isSample: false,
        isProxy: symbol.assetType === "FUTURES_PROXY",
        proxyOf: symbol.defaultProvenance.proxyOf,
      },
    };
  } catch {
    recordTransientFailure("twelvedata", "网络超时或异常");
    return null;
  }
}

async function tryFetchTwelveDataQuote(
  symbol: SymbolMeta
): Promise<LiveQuotePatch | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("twelvedata");
  if (!quota.allowed) return null;

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
      symbol.ticker
    )}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (res.status === 429) {
      recordRateLimitBackoff("twelvedata", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: number;
      close?: string;
      open?: string;
      high?: string;
      low?: string;
      previous_close?: string;
      change?: string;
      percent_change?: string;
      volume?: string;
      datetime?: string;
    };
    if (json.code === 429) {
      recordRateLimitBackoff("twelvedata");
      return null;
    }
    const last = Number(json.close);
    if (!Number.isFinite(last) || last <= 0) return null;
    recordProviderSuccess("twelvedata");
    return {
      last,
      open: Number(json.open) || undefined,
      high: Number(json.high) || undefined,
      low: Number(json.low) || undefined,
      prevClose: Number(json.previous_close) || undefined,
      change: Number.isFinite(Number(json.change)) ? Number(json.change) : undefined,
      changePercent: Number.isFinite(Number(json.percent_change))
        ? Number(json.percent_change)
        : undefined,
      volume: Number(json.volume) || undefined,
      updatedAt: json.datetime || new Date().toISOString().slice(0, 16).replace("T", " "),
      provider: "Twelve Data Free Quote",
      badge: "TwelveData 延迟15分",
      delayNote: "美股免费档延迟 15 分钟报价（非交易所直连实时）",
      delayMinutes: 15,
      kind: "delayed",
    };
  } catch {
    recordTransientFailure("twelvedata", "报价请求失败");
    return null;
  }
}

/**
 * 可选：Polygon.io Stocks Free（支持美股/ETF 日线与 60m 小时线 Aggregates）
 */
async function tryFetchPolygonBars(
  symbol: SymbolMeta,
  interval: Interval
): Promise<BarsCacheValue | null> {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("polygon");
  if (!quota.allowed) return null;

  const isIntraday = interval === "60m";
  const timespan = isIntraday ? "hour" : "day";
  const lookbackDays = isIntraday ? 45 : 550;

  try {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - lookbackDays * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
      symbol.ticker
    )}/range/1/${timespan}/${fromDate}/${to}?adjusted=true&sort=asc&limit=500&apiKey=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetchWithTimeout(url, {}, 6500);
    if (res.status === 429) {
      recordRateLimitBackoff("polygon", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("polygon", `HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      status?: string;
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

    const bars: NormalizedBar[] = json.results
      .map((r) => ({
        timestamp: r.t,
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v ?? 0,
      }))
      .filter((b) => Number.isFinite(b.timestamp) && b.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (bars.length < 10) return null;
    recordProviderSuccess("polygon");

    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : isIntraday ? "delayed" : "eod",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? `ETF代理 · Polygon ${isIntraday ? "60m" : "EOD"}`
            : isIntraday
            ? "Polygon 延迟 · 60m"
            : "Polygon 日线 EOD",
        provider: "Polygon.io Stocks Free（在线）",
        delayNote: isIntraday
          ? "免费档延迟小时线（5 次/分钟限流，非实时 SIP）"
          : "免费档近 2 年收盘日线 EOD（5 次/分钟限流，非实时 SIP）",
        delayMinutes: isIntraday ? 15 : undefined,
        dateRange: formatRange(bars),
        isSample: false,
        isProxy: symbol.assetType === "FUTURES_PROXY",
        proxyOf: symbol.defaultProvenance.proxyOf,
      },
    };
  } catch {
    recordTransientFailure("polygon", "网络超时或异常");
    return null;
  }
}

async function tryFetchPolygonPrevQuote(
  symbol: SymbolMeta
): Promise<LiveQuotePatch | null> {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("polygon");
  if (!quota.allowed) return null;

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
      symbol.ticker
    )}/prev?adjusted=true&apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (res.status === 429) {
      recordRateLimitBackoff("polygon", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
    };
    const r = json.results?.[0];
    if (!r || !r.c) return null;
    recordProviderSuccess("polygon");
    return {
      last: r.c,
      open: r.o,
      high: r.h,
      low: r.l,
      volume: r.v ?? 0,
      updatedAt: new Date(r.t).toISOString().slice(0, 10),
      provider: "Polygon.io Stocks Free (Prev Close)",
      badge: "Polygon 收盘 EOD",
      delayNote: "美股上一交易日收盘参考价（免费档 5 次/分钟）",
      kind: "eod",
    };
  } catch {
    recordTransientFailure("polygon", "报价请求失败");
    return null;
  }
}

/**
 * 可选：Finnhub Free（美股/ETF 最新参考报价 + 尽力尝试 K 线）
 */
async function tryFetchFinnhubQuote(
  symbol: SymbolMeta
): Promise<LiveQuotePatch | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("finnhub");
  if (!quota.allowed) return null;

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      symbol.ticker
    )}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (res.status === 429) {
      recordRateLimitBackoff("finnhub", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) {
      if (res.status >= 500) {
        recordTransientFailure("finnhub", `HTTP ${res.status}`);
      }
      return null;
    }

    const json = (await res.json()) as {
      c?: number;
      d?: number | null;
      dp?: number | null;
      h?: number;
      l?: number;
      o?: number;
      pc?: number;
      t?: number;
    };
    if (!json.c || !Number.isFinite(json.c) || json.c <= 0) return null;
    recordProviderSuccess("finnhub");

    const tsMs = json.t && json.t > 0 ? json.t * 1000 : Date.now();
    return {
      last: Number(json.c.toFixed(4)),
      open: json.o && json.o > 0 ? Number(json.o.toFixed(4)) : undefined,
      high: json.h && json.h > 0 ? Number(json.h.toFixed(4)) : undefined,
      low: json.l && json.l > 0 ? Number(json.l.toFixed(4)) : undefined,
      prevClose: json.pc && json.pc > 0 ? Number(json.pc.toFixed(4)) : undefined,
      change: typeof json.d === "number" ? Number(json.d.toFixed(4)) : undefined,
      changePercent: typeof json.dp === "number" ? Number(json.dp.toFixed(2)) : undefined,
      updatedAt: new Date(tsMs).toISOString().slice(0, 16).replace("T", " "),
      provider: "Finnhub Free Quote API（在线）",
      badge: "Finnhub 参考报价",
      delayNote: "Finnhub 免费档美股参考报价（60次/分，非全美交易所合并 SIP 实时流）",
      kind: "live_ref",
    };
  } catch {
    recordTransientFailure("finnhub", "报价请求超时");
    return null;
  }
}

async function tryFetchFinnhubCandles(
  symbol: SymbolMeta,
  interval: Interval
): Promise<BarsCacheValue | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey || !isUsEquityOrEtf(symbol)) return null;

  const quota = tryAcquireQuota("finnhub");
  if (!quota.allowed) return null;

  const resolution = interval === "60m" ? "60" : "D";
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - (interval === "60m" ? 30 * 86400 : 400 * 86400);

  try {
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
      symbol.ticker
    )}&resolution=${resolution}&from=${fromSec}&to=${nowSec}&token=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetchWithTimeout(url, {}, 5500);
    if (res.status === 429) {
      recordRateLimitBackoff("finnhub", parseRetryAfter(res));
      return null;
    }
    // Finnhub Free 账号通常对 /stock/candle 返回 403，静默回退而不触发全源冷却
    if (!res.ok) return null;

    const json = (await res.json()) as {
      s?: string;
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
    };
    if (json.s !== "ok" || !Array.isArray(json.t) || json.t.length < 10) {
      return null;
    }

    const bars: NormalizedBar[] = [];
    for (let i = 0; i < json.t.length; i++) {
      const c = json.c?.[i] ?? 0;
      if (!Number.isFinite(c) || c <= 0) continue;
      bars.push({
        timestamp: json.t[i] * 1000,
        open: json.o?.[i] ?? c,
        high: json.h?.[i] ?? c,
        low: json.l?.[i] ?? c,
        close: c,
        volume: json.v?.[i] ?? 0,
      });
    }
    bars.sort((a, b) => a.timestamp - b.timestamp);
    if (bars.length < 10) return null;
    recordProviderSuccess("finnhub");

    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : "delayed",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? "ETF代理 · Finnhub"
            : interval === "60m"
            ? "Finnhub 延迟 · 60m"
            : "Finnhub 日线",
        provider: "Finnhub Free Candle API（在线）",
        delayNote: "Finnhub 免费档历史与延迟 K 线（60次/分）",
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
 * 可选：EODHD Free（美股/ETF/港股收盘日线，20次/天）
 */
async function tryFetchEodhd(
  symbol: SymbolMeta
): Promise<BarsCacheValue | null> {
  const apiKey = process.env.EODHD_API_KEY?.trim();
  if (!apiKey) return null;

  let eodTicker: string | null = null;
  if (isUsEquityOrEtf(symbol)) {
    eodTicker = `${symbol.ticker}.US`;
  } else if (symbol.market === "HK") {
    eodTicker = `${symbol.ticker.replace(/^0+/, "")}.HK`;
  }
  if (!eodTicker) return null;

  const quota = tryAcquireQuota("eodhd");
  if (!quota.allowed) return null;

  try {
    const fromDate = new Date(Date.now() - 550 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(
      eodTicker
    )}?api_token=${encodeURIComponent(apiKey)}&fmt=json&from=${fromDate}`;
    const res = await fetchWithTimeout(url, {}, 6500);
    if (res.status === 429 || res.status === 402) {
      recordRateLimitBackoff("eodhd", parseRetryAfter(res) ?? 300);
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("eodhd", `HTTP ${res.status}`);
      return null;
    }

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

    if (bars.length < 10) return null;
    recordProviderSuccess("eodhd");

    return {
      bars,
      provenance: {
        kind: symbol.assetType === "FUTURES_PROXY" ? "proxy" : "eod",
        badge:
          symbol.assetType === "FUTURES_PROXY"
            ? "ETF代理 · EODHD"
            : "EODHD 日线 EOD",
        provider: "EODHD Free API（在线）",
        delayNote: "收盘日线 EOD（免费档每日限 20 次请求，已做内存缓存保护）",
        dateRange: formatRange(bars),
        isSample: false,
        isProxy: symbol.assetType === "FUTURES_PROXY",
        proxyOf: symbol.defaultProvenance.proxyOf,
      },
    };
  } catch {
    recordTransientFailure("eodhd", "网络超时或异常");
    return null;
  }
}

/**
 * 可选：Tushare Pro（仅当用户在 .env.local 配置 TUSHARE_TOKEN 时调用）
 */
async function tryFetchTushare(
  symbol: SymbolMeta
): Promise<BarsCacheValue | null> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token || symbol.market !== "CN") return null;

  const quota = tryAcquireQuota("tushare");
  if (!quota.allowed) return null;

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
      6500
    );
    if (res.status === 429) {
      recordRateLimitBackoff("tushare", parseRetryAfter(res));
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("tushare", `HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { fields: string[]; items: Array<Array<string | number>> };
    };
    if (json.code === 40203) {
      recordRateLimitBackoff("tushare", 60);
      return null;
    }
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
    recordProviderSuccess("tushare");

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
    recordTransientFailure("tushare", "网络超时或异常");
    return null;
  }
}

/**
 * 可选：本地 Python Baostock 适配器（默认关闭，仅当 ENABLE_BAOSTOCK=true 时尝试调用）
 * 不强制安装 Python/baostock，缺失或失败时静默回退本地样本。
 */
async function tryFetchBaostock(
  symbol: SymbolMeta
): Promise<BarsCacheValue | null> {
  if (process.env.ENABLE_BAOSTOCK !== "true" || symbol.market !== "CN") {
    return null;
  }
  const match = /^CN:(\d{6})\.(SH|SZ)$/i.exec(symbol.id);
  if (!match) return null;

  const quota = tryAcquireQuota("baostock");
  if (!quota.allowed) return null;

  const bsCode = `${match[2].toLowerCase()}.${match[1]}`;
  const startDate = new Date(Date.now() - 550 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const pyScript = [
    "import json, sys, baostock as bs",
    "code, start, end = sys.argv[1], sys.argv[2], sys.argv[3]",
    "lg = bs.login()",
    "if lg.error_code != '0': sys.exit(1)",
    "rs = bs.query_history_k_data_plus(code, 'date,open,high,low,close,volume', start_date=start, end_date=end, frequency='d', adjustflag='2')",
    "rows = []",
    "while rs.error_code == '0' and rs.next(): rows.append(rs.get_row_data())",
    "bs.logout()",
    "print(json.dumps(rows))",
  ].join("\n");

  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", pyScript, bsCode, startDate, endDate],
      { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }
    );
    const jsonLine = stdout.trim().split(/\r?\n/).pop() || "[]";
    const rows = JSON.parse(jsonLine) as string[][];
    if (!Array.isArray(rows) || rows.length < 10) return null;

    const bars: NormalizedBar[] = rows
      .map((r) => ({
        timestamp: Date.parse(`${r[0]}T00:00:00Z`),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5] || 0),
      }))
      .filter((b) => Number.isFinite(b.timestamp) && b.close > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (bars.length < 10) return null;
    recordProviderSuccess("baostock");

    return {
      bars,
      provenance: {
        kind: "eod",
        badge: "Baostock 日线 EOD",
        provider: "Baostock 本地 Python 适配器（前复权日线）",
        delayNote: "A 股开源历史收盘日线 EOD（盘后更新，非实时）",
        dateRange: formatRange(bars),
        isSample: false,
      },
    };
  } catch {
    recordTransientFailure("baostock", "未安装 baostock 或调用失败", 120);
    return null;
  }
}

function getSampleDaily(symbol: SymbolMeta): BarsCacheValue {
  const sample = DAILY_SAMPLES[symbol.id];
  if (!sample) {
    return {
      bars: [],
      provenance: {
        ...symbol.defaultProvenance,
        isSample: false,
        fallbackReason: "该 FRED 公开指数未捆绑离线样本，请确认联网并开启 ENABLE_PUBLIC_FRED=true",
      },
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

function mergeQuoteWithLivePatch(
  baseQuote: NormalizedQuote,
  patch: LiveQuotePatch
): NormalizedQuote {
  const prevClose = patch.prevClose ?? baseQuote.prevClose;
  const change =
    patch.change ?? Number((patch.last - prevClose).toFixed(4));
  const changePercent =
    patch.changePercent ??
    (prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0);

  return {
    ...baseQuote,
    last: patch.last,
    open: patch.open ?? baseQuote.open,
    high: patch.high ?? Math.max(baseQuote.high, patch.last),
    low: patch.low ?? Math.min(baseQuote.low || patch.last, patch.last),
    prevClose,
    change,
    changePercent,
    volume: patch.volume ?? baseQuote.volume,
    high52w: Math.max(baseQuote.high52w, patch.high ?? patch.last),
    low52w:
      baseQuote.low52w > 0
        ? Math.min(baseQuote.low52w, patch.low ?? patch.last)
        : patch.low ?? patch.last,
    updatedAt: patch.updatedAt,
  };
}

async function resolveOptionalUsQuotePatch(
  symbol: SymbolMeta
): Promise<{ patch: LiveQuotePatch; stale?: boolean } | null> {
  if (!isUsEquityOrEtf(symbol)) return null;
  const env = getAdapterEnvStatus();
  if (!env.finnhubConfigured && !env.twelveDataConfigured && !env.polygonConfigured) {
    return null;
  }

  const cacheKey = `quote:${symbol.id}`;
  const fresh = QUOTE_CACHE.getFresh(cacheKey);
  if (fresh) return { patch: fresh };

  const live =
    (await tryFetchFinnhubQuote(symbol)) ??
    (await tryFetchTwelveDataQuote(symbol)) ??
    (await tryFetchPolygonPrevQuote(symbol));

  if (live) {
    QUOTE_CACHE.set(cacheKey, live, QUOTE_CACHE_TTL_MS, QUOTE_STALE_TTL_MS);
    return { patch: live };
  }

  const stale = QUOTE_CACHE.getStale(cacheKey);
  if (stale) {
    return { patch: stale.value, stale: true };
  }
  return null;
}

export async function getBarsForSymbol(
  rawSymbolId: string,
  requestedInterval: Interval = "1D"
): Promise<BarsResponse> {
  const baseSymbol =
    getSymbolById(rawSymbolId) ?? getSymbolById(DEFAULT_SYMBOL_ID)!;
  const symbol = resolveEffectiveSymbol(baseSymbol);
  const interval: Interval = symbol.supportedIntervals.includes(requestedInterval)
    ? requestedInterval
    : "1D";

  const cacheKey = `${symbol.id}:${interval === "60m" ? "60m" : "1D"}`;

  // 1. 60m intraday path
  if (interval === "60m") {
    let resolved: BarsCacheValue | null = BARS_CACHE.getFresh(cacheKey);
    if (resolved) {
      resolved = {
        ...resolved,
        provenance: { ...resolved.provenance, cached: true },
      };
    } else {
      const live =
        (await tryFetchTwelveDataBars(symbol, "60m")) ??
        (await tryFetchPolygonBars(symbol, "60m")) ??
        (await tryFetchFinnhubCandles(symbol, "60m"));

      if (live) {
        BARS_CACHE.set(cacheKey, live, INTRADAY_CACHE_TTL_MS, BARS_STALE_TTL_MS);
        resolved = live;
      } else {
        const stale = BARS_CACHE.getStale(cacheKey);
        if (stale) {
          resolved = {
            bars: stale.value.bars,
            provenance: {
              ...stale.value.provenance,
              cached: true,
              stale: true,
              delayNote: `${stale.value.provenance.delayNote}（上游限流或超时，已回退 ${stale.ageMinutes} 分钟前缓存）`,
            },
          };
        }
      }
    }

    if (!resolved) {
      const sample60 = INTRADAY_60M_SAMPLES[symbol.id];
      if (sample60) {
        resolved = {
          bars: sample60.bars,
          provenance: {
            ...symbol.defaultProvenance,
            badge:
              symbol.assetType === "FUTURES_PROXY"
                ? "ETF代理 · 60m样本"
                : "历史样本 · 60分钟",
            provider: sample60.meta.source,
            dateRange: sample60.meta.dateRange,
            isSample: true,
          },
        };
      }
    }

    if (resolved) {
      const dailyForQuote = getSampleDaily(symbol).bars;
      let quote = computeQuoteFromDailyBars(
        symbol.id,
        dailyForQuote.length ? dailyForQuote : resolved.bars
      );
      let provenance = resolved.provenance;

      const quotePatchRes = await resolveOptionalUsQuotePatch(symbol);
      if (quotePatchRes) {
        quote = mergeQuoteWithLivePatch(quote, quotePatchRes.patch);
        provenance = {
          ...provenance,
          quoteProvider: quotePatchRes.patch.provider,
          delayNote: `${provenance.delayNote}；最新参考价由 ${quotePatchRes.patch.provider} 补充`,
        };
      }

      return {
        symbol,
        interval: "60m",
        bars: resolved.bars,
        quote,
        provenance,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  // 2. Daily / Weekly / Monthly path
  let resolvedDaily: BarsCacheValue | null = BARS_CACHE.getFresh(cacheKey);
  if (resolvedDaily) {
    resolvedDaily = {
      ...resolvedDaily,
      provenance: { ...resolvedDaily.provenance, cached: true },
    };
  } else {
    let liveResult: BarsCacheValue | null = null;

    if (FRED_SERIES_MAP[symbol.id]) {
      liveResult = await tryFetchFredSeries(symbol);
    } else if (symbol.market === "CN") {
      liveResult =
        (await tryFetchTushare(symbol)) ?? (await tryFetchBaostock(symbol));
    } else if (symbol.market === "HK") {
      liveResult = await tryFetchEodhd(symbol);
    } else {
      liveResult =
        (await tryFetchTwelveDataBars(symbol, "1D")) ??
        (await tryFetchPolygonBars(symbol, "1D")) ??
        (await tryFetchEodhd(symbol)) ??
        (await tryFetchFinnhubCandles(symbol, "1D"));
    }

    if (liveResult) {
      BARS_CACHE.set(cacheKey, liveResult, DAILY_CACHE_TTL_MS, BARS_STALE_TTL_MS);
      resolvedDaily = liveResult;
    } else {
      const stale = BARS_CACHE.getStale(cacheKey);
      if (stale) {
        resolvedDaily = {
          bars: stale.value.bars,
          provenance: {
            ...stale.value.provenance,
            cached: true,
            stale: true,
            delayNote: `${stale.value.provenance.delayNote}（上游限流或超时，已回退 ${stale.ageMinutes} 分钟前缓存）`,
          },
        };
      }
    }
  }

  if (!resolvedDaily) {
    resolvedDaily = getSampleDaily(symbol);
  }

  const finalBars = resampleDailyBars(resolvedDaily.bars, interval);
  let quote = computeQuoteFromDailyBars(symbol.id, resolvedDaily.bars);
  let provenance = resolvedDaily.provenance;

  // 若配置了 Finnhub 等报价 Key，为美股/ETF 叠加最新参考报价（绝不篡改历史 K 线并明确标注）
  const quotePatchRes = await resolveOptionalUsQuotePatch(symbol);
  if (quotePatchRes) {
    quote = mergeQuoteWithLivePatch(quote, quotePatchRes.patch);
    provenance = {
      ...provenance,
      quoteProvider: quotePatchRes.patch.provider,
      delayNote: `${provenance.delayNote}；右侧最新报价由 ${quotePatchRes.patch.provider} 补充`,
    };
  }

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
 * 独立最新报价接口（供 /api/quote 调用）
 * 优先使用已配置免费档最新报价（Finnhub -> TwelveData -> Polygon Prev），
 * 无 Key 或失败时自动回退缓存或日线样本收盘快照。
 */
export async function getQuoteForSymbol(
  rawSymbolId: string
): Promise<QuoteResponse> {
  const baseSymbol =
    getSymbolById(rawSymbolId) ?? getSymbolById(DEFAULT_SYMBOL_ID)!;
  const symbol = resolveEffectiveSymbol(baseSymbol);

  const sample = getSampleDaily(symbol);
  const baseQuote = computeQuoteFromDailyBars(symbol.id, sample.bars);

  const livePatch = await resolveOptionalUsQuotePatch(symbol);
  if (livePatch) {
    const merged = mergeQuoteWithLivePatch(baseQuote, livePatch.patch);
    return {
      symbol,
      quote: merged,
      provenance: {
        kind: livePatch.patch.kind,
        badge: livePatch.stale
          ? `${livePatch.patch.badge} · 缓存`
          : livePatch.patch.badge,
        provider: livePatch.patch.provider,
        delayNote: livePatch.stale
          ? `${livePatch.patch.delayNote}（当前返回近期缓存）`
          : livePatch.patch.delayNote,
        delayMinutes: livePatch.patch.delayMinutes,
        dateRange: sample.provenance.dateRange,
        isSample: false,
        cached: Boolean(livePatch.stale),
        stale: Boolean(livePatch.stale),
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  // 若未配置报价 Key（或 A股/港股/FRED 指数），复用 getBarsForSymbol 的缓存/公开源/样本结果
  const barsResp = await getBarsForSymbol(symbol.id, "1D");
  return {
    symbol: barsResp.symbol,
    quote: barsResp.quote,
    provenance: barsResp.provenance,
    fetchedAt: barsResp.fetchedAt,
  };
}

/**
 * 极速生成全部 4 大市场分组的自选摘要（优先读内存缓存，无缓存时读本地样本，零阻塞首屏）
 */
export function getWatchlistSummaries(): WatchlistSummaryItem[] {
  return SYMBOL_CATALOG.map((rawSymbol) => {
    const symbol = resolveEffectiveSymbol(rawSymbol);
    const cached = BARS_CACHE.getFresh(`${symbol.id}:1D`) ?? BARS_CACHE.getStale(`${symbol.id}:1D`)?.value;
    const resolved = cached ?? getSampleDaily(symbol);
    const quote = computeQuoteFromDailyBars(symbol.id, resolved.bars);
    return {
      symbol,
      quote,
      provenance: resolved.provenance,
    };
  });
}
