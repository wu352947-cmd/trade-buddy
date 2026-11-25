import type {
  CalendarEvent,
  CalendarImportance,
  CalendarResponse,
  SymbolMeta,
} from "@trade-buddy/shared-types";

import {
  fetchWithTimeout,
  getSecUserAgent,
  recordProviderSuccess,
  recordRateLimitBackoff,
  recordTransientFailure,
  StaleCache,
  tryAcquireQuota,
} from "./cache-limiter";
import { getSymbolById, SYMBOL_CATALOG, US_SYMBOL_CIK_MAP } from "./catalog";

const CALENDAR_CACHE = new StaleCache<CalendarResponse>(60);
const CALENDAR_FRESH_TTL_MS = 30 * 60 * 1000;
const CALENDAR_STALE_TTL_MS = 12 * 60 * 60 * 1000;

const HIGH_IMPACT_KEYWORDS = [
  "consumer price index",
  "cpi",
  "employment situation",
  "nonfarm",
  "payroll",
  "fomc",
  "federal reserve",
  "interest rate",
  "gross domestic product",
  "gdp",
  "personal income and outlays",
  "pce",
  "producer price index",
  "ppi",
  "retail sales",
  "job openings",
  "jolts",
  "unemployment",
];

const MEDIUM_IMPACT_KEYWORDS = [
  "import and export price",
  "industrial production",
  "housing starts",
  "durable goods",
  "productivity",
  "employment cost",
  "real earnings",
  "consumer sentiment",
  "pmi",
  "trade balance",
];

function classifyImportance(title: string): CalendarImportance {
  const lower = title.toLowerCase();
  if (HIGH_IMPACT_KEYWORDS.some((kw) => lower.includes(kw))) return "high";
  if (MEDIUM_IMPACT_KEYWORDS.some((kw) => lower.includes(kw))) return "medium";
  return "low";
}

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateTime(rawLine: string): {
  date: string;
  time: string;
  timezone: string;
} | null {
  const colonIdx = rawLine.indexOf(":");
  if (colonIdx === -1) return null;
  const meta = rawLine.slice(0, colonIdx);
  const val = rawLine.slice(colonIdx + 1).trim();

  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(val);
  if (!m) return null;

  const [, y, mo, d, hh, mm, , isUtc] = m;
  const date = `${y}-${mo}-${d}`;
  if (!hh || !mm) {
    return { date, time: "全天", timezone: "US" };
  }
  const tzMatch = /TZID=([^;:]+)/i.exec(meta);
  const timezone = isUtc
    ? "UTC"
    : tzMatch?.[1]?.includes("New_York") || tzMatch?.[1]?.includes("Eastern")
    ? "ET"
    : tzMatch?.[1] || "ET";

  return { date, time: `${hh}:${mm}`, timezone };
}

function parseIcsEvents(
  icsText: string,
  fromDate: string,
  toDate: string,
  sourceName: string,
  defaultUrl: string
): CalendarEvent[] {
  // RFC 5545 line unfolding
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: CalendarEvent[] = [];
  let inEvent = false;
  let uid = "";
  let summary = "";
  let url = "";
  let dtStartLine = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      summary = "";
      url = "";
      dtStartLine = "";
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      const dt = parseIcsDateTime(dtStartLine);
      if (dt && summary && dt.date >= fromDate && dt.date <= toDate) {
        events.push({
          id: `${sourceName}:${uid || `${dt.date}-${summary.slice(0, 32)}`}`,
          date: dt.date,
          time: dt.time,
          timezone: dt.timezone,
          country: "US",
          title: summary,
          kind: "macro",
          importance: classifyImportance(summary),
          source: sourceName,
          url: url || defaultUrl,
        });
      }
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith("UID:")) {
      uid = line.slice(4).trim();
    } else if (line.startsWith("SUMMARY")) {
      const idx = line.indexOf(":");
      if (idx !== -1) summary = unescapeIcsText(line.slice(idx + 1));
    } else if (line.startsWith("DTSTART")) {
      dtStartLine = line;
    } else if (line.startsWith("URL")) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const candidate = line.slice(idx + 1).trim();
        if (candidate.startsWith("https://") || candidate.startsWith("http://")) {
          url = candidate;
        }
      }
    }
  }

  return events;
}

/**
 * 免 Key 官方公开源 1：美国劳工统计局 BLS 官方经济发布日程 iCalendar
 */
async function tryFetchBlsCalendar(
  fromDate: string,
  toDate: string
): Promise<CalendarEvent[] | null> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false") return null;
  const quota = tryAcquireQuota("public_calendar");
  if (!quota.allowed) return null;

  try {
    const res = await fetchWithTimeout(
      "https://www.bls.gov/schedule/news_release/bls.ics",
      {},
      6000
    );
    if (res.status === 429) {
      recordRateLimitBackoff("public_calendar", 60);
      return null;
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) return null;
    recordProviderSuccess("public_calendar");
    return parseIcsEvents(
      text,
      fromDate,
      toDate,
      "BLS 美国劳工统计局 (官方 iCal)",
      "https://www.bls.gov/schedule/news_release/current_year.htm"
    );
  } catch {
    recordTransientFailure("public_calendar", "BLS iCal 超时或离线");
    return null;
  }
}

/**
 * 免 Key 官方公开源 2：美联储 FRED 官方发布日历 iCalendar
 */
async function tryFetchFredReleaseCalendar(
  fromDate: string,
  toDate: string
): Promise<CalendarEvent[] | null> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false") return null;
  const quota = tryAcquireQuota("public_calendar");
  if (!quota.allowed) return null;

  try {
    const res = await fetchWithTimeout(
      "https://fred.stlouisfed.org/releases/calendar.ics",
      {},
      6000
    );
    if (res.status === 429) {
      recordRateLimitBackoff("public_calendar", 60);
      return null;
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) return null;
    recordProviderSuccess("public_calendar");
    const parsed = parseIcsEvents(
      text,
      fromDate,
      toDate,
      "FRED 官方发布日历",
      "https://fred.stlouisfed.org/releases/calendar"
    );
    // FRED 日历条目极多，优先保留高/中重要性核心宏观指标，避免面板噪音过大
    const filtered = parsed.filter((e) => e.importance !== "low");
    return (filtered.length > 0 ? filtered : parsed).slice(0, 40);
  } catch {
    recordTransientFailure("public_calendar", "FRED 日历超时或离线");
    return null;
  }
}

/**
 * 免 Key 官方公开源 3：SEC EDGAR 当前美股近期财报申报记录（10-Q / 10-K）
 */
async function tryFetchSecEarningsFilings(
  symbol?: SymbolMeta
): Promise<CalendarEvent[] | null> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false" || !symbol) return null;
  const cikInfo = US_SYMBOL_CIK_MAP[symbol.id];
  if (!cikInfo) return null;

  const quota = tryAcquireQuota("sec_edgar");
  if (!quota.allowed) return null;

  try {
    const res = await fetchWithTimeout(
      `https://data.sec.gov/submissions/CIK${cikInfo.cik}.json`,
      {
        headers: {
          "User-Agent": getSecUserAgent(),
          Accept: "application/json",
        },
      },
      5500
    );
    if (!res.ok) return null;

    const json = (await res.json()) as {
      filings?: {
        recent?: {
          accessionNumber?: string[];
          filingDate?: string[];
          reportDate?: string[];
          form?: string[];
          primaryDocument?: string[];
        };
      };
    };
    const recent = json.filings?.recent;
    if (!recent?.form?.length) return null;

    const cikNumeric = String(parseInt(cikInfo.cik, 10));
    const events: CalendarEvent[] = [];
    for (let i = 0; i < recent.form.length && events.length < 4; i++) {
      const form = recent.form[i];
      if (form !== "10-Q" && form !== "10-K") continue;
      const filingDate = recent.filingDate?.[i];
      const reportDate = recent.reportDate?.[i];
      const accNo = recent.accessionNumber?.[i] || "";
      const primaryDoc = recent.primaryDocument?.[i] || "";
      if (!filingDate || !accNo) continue;

      const accClean = accNo.replace(/-/g, "");
      const docUrl = primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/${primaryDoc}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/`;

      events.push({
        id: `sec-filing:${symbol.id}:${accNo}`,
        date: filingDate,
        time: "盘后/申报",
        timezone: "ET",
        country: "US",
        title: `${symbol.ticker} ${form === "10-K" ? "年度财报 (10-K)" : "季度财报 (10-Q)"}${
          reportDate ? ` · 报告期 ${reportDate}` : ""
        }`,
        kind: "filing",
        importance: "high",
        symbol: symbol.ticker,
        source: "SEC EDGAR 财报申报",
        url: docUrl,
      });
    }
    recordProviderSuccess("sec_edgar");
    return events;
  } catch {
    return null;
  }
}

/**
 * 可选有 Key：Finnhub Free 宏观经济日历 + 美股财报日历
 */
async function tryFetchFinnhubCalendars(
  fromDate: string,
  toDate: string,
  symbol?: SymbolMeta
): Promise<{ events: CalendarEvent[]; sources: string[] } | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) return null;

  const events: CalendarEvent[] = [];
  const sources: string[] = [];

  // 1) Economic Calendar
  if (tryAcquireQuota("finnhub").allowed) {
    try {
      const url = `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=${encodeURIComponent(
        apiKey
      )}`;
      const res = await fetchWithTimeout(url, {}, 6000);
      if (res.status === 429) {
        recordRateLimitBackoff("finnhub", 60);
      } else if (res.ok) {
        const json = (await res.json()) as {
          economicCalendar?: Array<{
            country?: string;
            event?: string;
            time?: string;
            impact?: string;
            prev?: number | null;
            estimate?: number | null;
            actual?: number | null;
            unit?: string;
          }>;
        };
        if (Array.isArray(json.economicCalendar) && json.economicCalendar.length > 0) {
          recordProviderSuccess("finnhub");
          sources.push("Finnhub 经济日历");
          for (const [idx, e] of json.economicCalendar.slice(0, 60).entries()) {
            if (!e.event || !e.time) continue;
            const [datePart, timePart] = e.time.split(" ");
            const impRaw = (e.impact || "").toLowerCase();
            const importance: CalendarImportance =
              impRaw === "high"
                ? "high"
                : impRaw === "medium"
                ? "medium"
                : "low";
            const unit = e.unit || "";
            events.push({
              id: `fh-eco:${idx}:${datePart}:${e.event.slice(0, 24)}`,
              date: datePart,
              time: timePart ? timePart.slice(0, 5) : "—",
              timezone: "UTC",
              country: e.country || "US",
              title: e.event,
              kind: "macro",
              importance,
              previous:
                typeof e.prev === "number" ? `${e.prev}${unit}` : undefined,
              forecast:
                typeof e.estimate === "number"
                  ? `${e.estimate}${unit}`
                  : undefined,
              actual:
                typeof e.actual === "number" ? `${e.actual}${unit}` : undefined,
              unit,
              source: "Finnhub Free",
            });
          }
        }
      }
    } catch {
      recordTransientFailure("finnhub", "Finnhub 经济日历超时");
    }
  }

  // 2) Earnings Calendar
  if (tryAcquireQuota("finnhub").allowed) {
    try {
      const symbolQuery =
        symbol && symbol.market === "US"
          ? `&symbol=${encodeURIComponent(symbol.ticker)}`
          : "";
      const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fromDate}&to=${toDate}${symbolQuery}&token=${encodeURIComponent(
        apiKey
      )}`;
      const res = await fetchWithTimeout(url, {}, 6000);
      if (res.status === 429) {
        recordRateLimitBackoff("finnhub", 60);
      } else if (res.ok) {
        const json = (await res.json()) as {
          earningsCalendar?: Array<{
            symbol?: string;
            date?: string;
            hour?: string;
            quarter?: number;
            year?: number;
            epsEstimate?: number | null;
            epsActual?: number | null;
          }>;
        };
        if (Array.isArray(json.earningsCalendar) && json.earningsCalendar.length > 0) {
          recordProviderSuccess("finnhub");
          sources.push("Finnhub 财报日历");
          const watchlistTickers = new Set(
            SYMBOL_CATALOG.filter((s) => s.market === "US").map((s) => s.ticker)
          );
          const prioritized = [
            ...json.earningsCalendar.filter(
              (r) => r.symbol && watchlistTickers.has(r.symbol)
            ),
            ...json.earningsCalendar.filter(
              (r) => r.symbol && !watchlistTickers.has(r.symbol)
            ),
          ].slice(0, 20);

          for (const [idx, e] of prioritized.entries()) {
            if (!e.symbol || !e.date) continue;
            const sessionLabel =
              e.hour === "bmo"
                ? "盘前"
                : e.hour === "amc"
                ? "盘后"
                : "盘中/待定";
            events.push({
              id: `fh-earn:${idx}:${e.symbol}:${e.date}`,
              date: e.date,
              time: sessionLabel,
              timezone: "ET",
              country: "US",
              title: `${e.symbol} 财报发布${
                e.year && e.quarter ? ` (FY${e.year} Q${e.quarter})` : ""
              }`,
              kind: "earnings",
              importance: watchlistTickers.has(e.symbol) ? "high" : "medium",
              forecast:
                typeof e.epsEstimate === "number"
                  ? `EPS ${e.epsEstimate.toFixed(2)}`
                  : undefined,
              actual:
                typeof e.epsActual === "number"
                  ? `EPS ${e.epsActual.toFixed(2)}`
                  : undefined,
              symbol: e.symbol,
              source: "Finnhub Free",
            });
          }
        }
      }
    } catch {
      // ignore secondary earnings failure
    }
  }

  return events.length > 0 ? { events, sources } : null;
}

export async function getEconomicCalendar(
  days = 14,
  rawSymbolId?: string,
  forceRefresh = false
): Promise<CalendarResponse> {
  const safeDays = Math.min(30, Math.max(7, Math.round(days)));
  const symbol = rawSymbolId ? getSymbolById(rawSymbolId) : undefined;

  const now = Date.now();
  const fromDate = new Date(now - 2 * 86400 * 1000).toISOString().slice(0, 10);
  const toDate = new Date(now + safeDays * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  const cacheKey = `cal:${safeDays}:${symbol?.id ?? "all"}:${fromDate}`;
  if (!forceRefresh) {
    const fresh = CALENDAR_CACHE.getFresh(cacheKey);
    if (fresh) return fresh;
  }

  const allEvents: CalendarEvent[] = [];
  const sources = new Set<string>();
  let usedApiKey = false;

  // 1. 优先尝试 Finnhub Free 经济与财报日历（配置 FINNHUB_API_KEY 时）
  const fh = await tryFetchFinnhubCalendars(fromDate, toDate, symbol);
  if (fh && fh.events.length > 0) {
    allEvents.push(...fh.events);
    fh.sources.forEach((s) => sources.add(s));
    usedApiKey = true;
  }

  // 2. 免 Key 官方公开日历（BLS 官方 iCal / FRED 官方日历 / SEC EDGAR 当前美股财报申报）
  const [blsEvents, fredEvents, secFilings] = await Promise.all([
    usedApiKey ? Promise.resolve(null) : tryFetchBlsCalendar(fromDate, toDate),
    usedApiKey
      ? Promise.resolve(null)
      : tryFetchFredReleaseCalendar(fromDate, toDate),
    tryFetchSecEarningsFilings(symbol),
  ]);

  if (blsEvents?.length) {
    allEvents.push(...blsEvents);
    sources.add("BLS 美国劳工统计局 (官方 iCal)");
  }
  if (fredEvents?.length) {
    allEvents.push(...fredEvents);
    sources.add("FRED 官方发布日历");
  }
  if (secFilings?.length) {
    allEvents.push(...secFilings);
    sources.add("SEC EDGAR 财报申报记录");
  }

  // 去重并按日期+时间排序（未来事件按正序，SEC 历史财报记录放底部/按日期排）
  const dedupedMap = new Map<string, CalendarEvent>();
  for (const ev of allEvents) {
    const key = `${ev.date}:${ev.title.toLowerCase()}`;
    if (!dedupedMap.has(key)) dedupedMap.set(key, ev);
  }
  const finalEvents = Array.from(dedupedMap.values()).sort((a, b) => {
    // 近期日程正序优先，历史申报放后面
    const aIsPastFiling = a.kind === "filing" && a.date < fromDate;
    const bIsPastFiling = b.kind === "filing" && b.date < fromDate;
    if (aIsPastFiling !== bIsPastFiling) return aIsPastFiling ? 1 : -1;
    if (aIsPastFiling && bIsPastFiling) return b.date.localeCompare(a.date);
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.time.localeCompare(b.time);
  });

  if (finalEvents.length > 0) {
    const response: CalendarResponse = {
      from: fromDate,
      to: toDate,
      symbolId: symbol?.id,
      events: finalEvents,
      sources: Array.from(sources),
      delayNote: usedApiKey
        ? "来源为 Finnhub Free 经济/财报日历及 SEC 官方记录（时间以页面标注时区为准，仅供研究参考）。"
        : "免 Key 官方公开日程（BLS / FRED 官方 iCal 发布表 + SEC 历史财报申报）；如需全球多国「前值/预测/公布」数值对比，可配置可选的 FINNHUB_API_KEY。",
      mode: usedApiKey ? "api_key" : "public_official",
      fetchedAt: new Date().toISOString(),
    };
    CALENDAR_CACHE.set(
      cacheKey,
      response,
      CALENDAR_FRESH_TTL_MS,
      CALENDAR_STALE_TTL_MS
    );
    return response;
  }

  // 3. 失败优先返回 stale 缓存
  const stale = CALENDAR_CACHE.getStale(cacheKey);
  if (stale) {
    return {
      ...stale.value,
      mode: "stale_cache",
      warning: `官方日历源暂时不可达或限流，已回退约 ${stale.ageMinutes} 分钟前缓存。`,
    };
  }

  // 4. 清晰空状态说明
  const feedsDisabled = process.env.ENABLE_PUBLIC_FEEDS === "false";
  return {
    from: fromDate,
    to: toDate,
    symbolId: symbol?.id,
    events: [],
    sources: [],
    delayNote: "未配置 Key 时使用 BLS/FRED 官方公开日历与 SEC 财报申报；配置 FINNHUB_API_KEY 可解锁完整前值/预测/公布数据。",
    mode: "empty",
    fetchedAt: new Date().toISOString(),
    emptyHint: feedsDisabled
      ? "当前已设置 ENABLE_PUBLIC_FEEDS=false（离线模式），已跳过在线日历请求。"
      : "当前暂未拉取到在线宏观/财报事件（可能是离线或 BLS / FRED / SEC 官方公开源超时）。无 Key 联网时支持拉取美国劳工统计局（BLS）官方发布日程、FRED 官方日历与美股 SEC 财报申报记录；若需含「前值 / 预测 / 公布」的完整全球宏观与美股财报日历，请在 .env.local 配置可选的 FINNHUB_API_KEY。",
  };
}
