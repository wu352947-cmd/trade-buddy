import type {
  NewsItem,
  NewsResponse,
  NewsScope,
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
import { getSymbolById, US_SYMBOL_CIK_MAP } from "./catalog";

const NEWS_CACHE = new StaleCache<NewsResponse>(100);
const NEWS_FRESH_TTL_MS = 10 * 60 * 1000;
const NEWS_STALE_TTL_MS = 6 * 60 * 60 * 1000;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function extractTag(block: string, tagName: string): string {
  const re = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const m = re.exec(block);
  return m ? decodeXmlEntities(m[1]) : "";
}

function extractAtomLink(block: string): string {
  const hrefMatch =
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(
      block
    ) ?? /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  if (hrefMatch?.[1]) return decodeXmlEntities(hrefMatch[1]);
  return extractTag(block, "link");
}

function parseRssOrAtomFeed(
  xml: string,
  sourceName: string,
  sourceBadge: string,
  category: string,
  limit = 12
): NewsItem[] {
  const items: NewsItem[] = [];
  const itemMatches = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ];

  for (const m of itemMatches) {
    if (items.length >= limit) break;
    const block = m[1];
    const title = extractTag(block, "title");
    const link = extractAtomLink(block) || extractTag(block, "link");
    const rawDate =
      extractTag(block, "pubDate") ||
      extractTag(block, "updated") ||
      extractTag(block, "published") ||
      extractTag(block, "dc:date");

    if (!title || !link || !isSafeHttpUrl(link)) continue;
    const parsedTs = Date.parse(rawDate);
    const publishedAt = Number.isFinite(parsedTs)
      ? new Date(parsedTs).toISOString()
      : new Date().toISOString();

    items.push({
      id: `${sourceBadge}:${link}`.slice(0, 160),
      title: title.slice(0, 220),
      url: link,
      source: sourceName,
      sourceBadge,
      publishedAt,
      category,
    });
  }

  return items;
}

const FORM_LABEL_ZH: Record<string, string> = {
  "8-K": "重大事项公告",
  "10-Q": "季度财务报告",
  "10-K": "年度财务报告",
  "DEF 14A": "股东大会委托书",
  "S-3": "证券发行注册",
  "4": "内部人持股变动",
};

/**
 * 免 Key 官方公开源：SEC EDGAR 公司最新申报（仅美股，带合规 User-Agent）
 */
async function tryFetchSecCompanyFilings(
  symbol: SymbolMeta
): Promise<NewsItem[] | null> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false") return null;
  const cikInfo = US_SYMBOL_CIK_MAP[symbol.id];
  if (!cikInfo) return null;

  const quota = tryAcquireQuota("sec_edgar");
  if (!quota.allowed) return null;

  try {
    const url = `https://data.sec.gov/submissions/CIK${cikInfo.cik}.json`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": getSecUserAgent(),
          Accept: "application/json",
        },
      },
      6000
    );
    if (res.status === 429) {
      recordRateLimitBackoff("sec_edgar", 60);
      return null;
    }
    if (!res.ok) {
      recordTransientFailure("sec_edgar", `HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      name?: string;
      filings?: {
        recent?: {
          accessionNumber?: string[];
          filingDate?: string[];
          acceptanceDateTime?: string[];
          form?: string[];
          primaryDocument?: string[];
          primaryDocDescription?: string[];
        };
      };
    };

    const recent = json.filings?.recent;
    if (!recent?.form?.length) return null;

    const allowedForms = new Set(["8-K", "10-Q", "10-K", "DEF 14A", "8-K/A", "10-Q/A"]);
    const cikNumeric = String(parseInt(cikInfo.cik, 10));
    const items: NewsItem[] = [];

    for (let i = 0; i < recent.form.length && items.length < 15; i++) {
      const form = recent.form[i];
      if (!allowedForms.has(form)) continue;
      const accNo = recent.accessionNumber?.[i] || "";
      const primaryDoc = recent.primaryDocument?.[i] || "";
      const filingDate = recent.filingDate?.[i] || "";
      const acceptanceDt = recent.acceptanceDateTime?.[i];
      const desc = recent.primaryDocDescription?.[i] || "";
      if (!accNo) continue;

      const accClean = accNo.replace(/-/g, "");
      const docUrl = primaryDoc
        ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/${primaryDoc}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/`;

      const formZh = FORM_LABEL_ZH[form.replace("/A", "")] || "监管申报";
      const entityLabel = json.name || cikInfo.entityName;
      const title = `[${form}] ${entityLabel} ${formZh}${
        desc && desc.toUpperCase() !== form ? ` — ${desc}` : ""
      }`;

      const ts = acceptanceDt ? Date.parse(acceptanceDt) : Date.parse(`${filingDate}T16:00:00Z`);
      items.push({
        id: `sec:${symbol.id}:${accNo}`,
        title,
        url: docUrl,
        source: "SEC EDGAR 官方披露",
        sourceBadge: `SEC ${form}`,
        publishedAt: Number.isFinite(ts)
          ? new Date(ts).toISOString()
          : new Date().toISOString(),
        category: "监管公告",
        relatedSymbols: [symbol.ticker],
      });
    }

    recordProviderSuccess("sec_edgar");
    return items;
  } catch {
    recordTransientFailure("sec_edgar", "SEC EDGAR 请求超时或离线");
    return null;
  }
}

/**
 * 免 Key 官方公开源：美联储 / SEC / BLS 官方 RSS + SEC EDGAR 最新 8-K Atom
 */
async function tryFetchPublicMarketFeeds(): Promise<{
  items: NewsItem[];
  sources: string[];
}> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false") {
    return { items: [], sources: [] };
  }

  const feeds: Array<{
    url: string;
    source: string;
    badge: string;
    category: string;
    provider: "public_rss" | "sec_edgar";
    headers?: Record<string, string>;
    limit: number;
  }> = [
    {
      url: "https://www.federalreserve.gov/feeds/press_all.xml",
      source: "美联储官方新闻稿 (Federal Reserve)",
      badge: "美联储",
      category: "央行政策",
      provider: "public_rss",
      limit: 8,
    },
    {
      url: "https://www.bls.gov/feed/bls_latest.rss",
      source: "美国劳工统计局 (BLS)",
      badge: "BLS 官方",
      category: "宏观数据",
      provider: "public_rss",
      limit: 8,
    },
    {
      url: "https://www.sec.gov/news/pressreleases.rss",
      source: "美国证监会官方新闻 (SEC)",
      badge: "SEC 新闻",
      category: "监管动态",
      provider: "sec_edgar",
      headers: { "User-Agent": getSecUserAgent() },
      limit: 6,
    },
    {
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=12&output=atom",
      source: "SEC EDGAR 最新 8-K 公告",
      badge: "SEC 8-K",
      category: "公司公告",
      provider: "sec_edgar",
      headers: { "User-Agent": getSecUserAgent() },
      limit: 8,
    },
  ];

  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const quota = tryAcquireQuota(f.provider);
      if (!quota.allowed) return { source: f.source, items: [] as NewsItem[] };
      const res = await fetchWithTimeout(
        f.url,
        { headers: f.headers },
        5000
      );
      if (res.status === 429) {
        recordRateLimitBackoff(f.provider, 60);
        return { source: f.source, items: [] as NewsItem[] };
      }
      if (!res.ok) return { source: f.source, items: [] as NewsItem[] };
      const xml = await res.text();
      const parsed = parseRssOrAtomFeed(
        xml,
        f.source,
        f.badge,
        f.category,
        f.limit
      );
      if (parsed.length > 0) recordProviderSuccess(f.provider);
      return { source: f.source, items: parsed };
    })
  );

  const allItems: NewsItem[] = [];
  const activeSources = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.items.length > 0) {
      activeSources.add(r.value.source);
      allItems.push(...r.value.items);
    }
  }

  return {
    items: allItems,
    sources: Array.from(activeSources),
  };
}

/**
 * 可选有 Key：Finnhub 公司新闻 / 全市场新闻
 */
async function tryFetchFinnhubNews(
  scope: NewsScope,
  symbol?: SymbolMeta
): Promise<NewsItem[] | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) return null;

  if (
    scope === "symbol" &&
    (!symbol ||
      (symbol.market !== "US" &&
        symbol.id !== "IDX:QQQ" &&
        symbol.id !== "IDX:VTI"))
  ) {
    return null;
  }

  const quota = tryAcquireQuota("finnhub");
  if (!quota.allowed) return null;

  try {
    let url: string;
    if (scope === "symbol" && symbol) {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 10 * 86400 * 1000)
        .toISOString()
        .slice(0, 10);
      url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(
        symbol.ticker
      )}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
    } else {
      url = `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(
        apiKey
      )}`;
    }

    const res = await fetchWithTimeout(url, {}, 6000);
    if (res.status === 429) {
      recordRateLimitBackoff("finnhub", 60);
      return null;
    }
    if (!res.ok) return null;

    const rows = (await res.json()) as Array<{
      id?: number;
      headline?: string;
      url?: string;
      source?: string;
      datetime?: number;
      category?: string;
      related?: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const items: NewsItem[] = rows
      .filter((r) => r.headline && r.url && isSafeHttpUrl(r.url))
      .slice(0, 20)
      .map((r, idx) => ({
        id: `finnhub:${r.id ?? idx}:${r.datetime ?? 0}`,
        title: String(r.headline).trim(),
        url: String(r.url),
        source: r.source ? `${r.source} (via Finnhub)` : "Finnhub Free",
        sourceBadge: r.source ? r.source.slice(0, 14) : "Finnhub",
        publishedAt: r.datetime
          ? new Date(r.datetime * 1000).toISOString()
          : new Date().toISOString(),
        category: r.category || (scope === "symbol" ? "公司资讯" : "全球市场"),
        relatedSymbols: r.related
          ? r.related
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 4)
          : symbol
          ? [symbol.ticker]
          : undefined,
      }));

    recordProviderSuccess("finnhub");
    return items;
  } catch {
    recordTransientFailure("finnhub", "Finnhub 新闻请求超时");
    return null;
  }
}

/**
 * 可选有 Key：Polygon.io 参考新闻（美股 / 全市场）
 */
async function tryFetchPolygonNews(
  scope: NewsScope,
  symbol?: SymbolMeta
): Promise<NewsItem[] | null> {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey) return null;

  if (
    scope === "symbol" &&
    (!symbol ||
      (symbol.market !== "US" &&
        symbol.id !== "IDX:QQQ" &&
        symbol.id !== "IDX:VTI"))
  ) {
    return null;
  }

  const quota = tryAcquireQuota("polygon");
  if (!quota.allowed) return null;

  try {
    const tickerParam =
      scope === "symbol" && symbol
        ? `ticker=${encodeURIComponent(symbol.ticker)}&`
        : "";
    const url = `https://api.polygon.io/v2/reference/news?${tickerParam}limit=18&order=desc&apiKey=${encodeURIComponent(
      apiKey
    )}`;
    const res = await fetchWithTimeout(url, {}, 6000);
    if (res.status === 429) {
      recordRateLimitBackoff("polygon", 60);
      return null;
    }
    if (!res.ok) return null;

    const json = (await res.json()) as {
      results?: Array<{
        id?: string;
        title?: string;
        article_url?: string;
        published_utc?: string;
        publisher?: { name?: string };
        tickers?: string[];
      }>;
    };
    if (!Array.isArray(json.results) || json.results.length === 0) return null;

    const items: NewsItem[] = json.results
      .filter((r) => r.title && r.article_url && isSafeHttpUrl(r.article_url))
      .map((r, idx) => ({
        id: `polygon:${r.id ?? idx}`,
        title: String(r.title).trim(),
        url: String(r.article_url),
        source: r.publisher?.name
          ? `${r.publisher.name} (via Polygon)`
          : "Polygon Reference News",
        sourceBadge: (r.publisher?.name || "Polygon").slice(0, 14),
        publishedAt: r.published_utc || new Date().toISOString(),
        category: scope === "symbol" ? "公司资讯" : "美股资讯",
        relatedSymbols: r.tickers?.slice(0, 4),
      }));

    recordProviderSuccess("polygon");
    return items;
  } catch {
    recordTransientFailure("polygon", "Polygon 新闻请求超时");
    return null;
  }
}

function dedupeAndSortNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 30);
}

export async function getNewsFeed(
  scope: NewsScope = "symbol",
  rawSymbolId?: string,
  forceRefresh = false
): Promise<NewsResponse> {
  const symbol = rawSymbolId ? getSymbolById(rawSymbolId) : undefined;
  const cacheKey = `${scope}:${scope === "symbol" ? symbol?.id ?? "none" : "all"}`;

  if (!forceRefresh) {
    const fresh = NEWS_CACHE.getFresh(cacheKey);
    if (fresh) return fresh;
  }

  const collected: NewsItem[] = [];
  const sources: string[] = [];
  let usedApiKey = false;

  // 1. 优先尝试已配置的免费 API Key（Finnhub / Polygon）
  const [fhNews, polyNews] = await Promise.all([
    tryFetchFinnhubNews(scope, symbol),
    tryFetchPolygonNews(scope, symbol),
  ]);

  if (fhNews?.length) {
    collected.push(...fhNews);
    sources.push("Finnhub Free News");
    usedApiKey = true;
  }
  if (polyNews?.length) {
    collected.push(...polyNews);
    sources.push("Polygon Reference News");
    usedApiKey = true;
  }

  // 2. 免 Key 官方公开来源（SEC EDGAR / 美联储 / BLS / SEC RSS）
  if (scope === "symbol") {
    if (symbol && US_SYMBOL_CIK_MAP[symbol.id]) {
      const secItems = await tryFetchSecCompanyFilings(symbol);
      if (secItems?.length) {
        collected.push(...secItems);
        sources.push("SEC EDGAR 官方公告");
      }
    } else if (symbol && symbol.market === "FUTURES_INDEX" && collected.length === 0) {
      const pub = await tryFetchPublicMarketFeeds();
      if (pub.items.length > 0) {
        collected.push(...pub.items);
        sources.push(...pub.sources);
      }
    }
  } else if (collected.length < 6) {
    const pub = await tryFetchPublicMarketFeeds();
    if (pub.items.length > 0) {
      collected.push(...pub.items);
      sources.push(...pub.sources);
    }
  }

  const finalItems = dedupeAndSortNews(collected);

  if (finalItems.length > 0) {
    const response: NewsResponse = {
      scope,
      symbolId: symbol?.id,
      items: finalItems,
      sources: Array.from(new Set(sources)),
      delayNote: usedApiKey
        ? "来源含免费档资讯接口及官方公开披露，可能存在数分钟至数十分钟延迟；仅展示标题与原文外链。"
        : "免 Key 官方公开来源（SEC EDGAR / 美联储 / BLS / SEC RSS），可能存在发布延迟；仅展示标题与原文外链。",
      mode: usedApiKey ? "api_key" : "public_official",
      fetchedAt: new Date().toISOString(),
    };
    NEWS_CACHE.set(cacheKey, response, NEWS_FRESH_TTL_MS, NEWS_STALE_TTL_MS);
    return response;
  }

  // 3. 失败回退略过期缓存
  const stale = NEWS_CACHE.getStale(cacheKey);
  if (stale) {
    return {
      ...stale.value,
      mode: "stale_cache",
      warning: `上游公开源暂时不可达或限流，已展示约 ${stale.ageMinutes} 分钟前的缓存内容。`,
    };
  }

  // 4. 清晰可读的空状态说明（绝不崩溃或显示旧占位）
  const isCnOrHk = symbol && (symbol.market === "CN" || symbol.market === "HK");
  const feedsDisabled = process.env.ENABLE_PUBLIC_FEEDS === "false";
  const emptyHint = feedsDisabled
    ? "已在环境变量中设置 ENABLE_PUBLIC_FEEDS=false（离线模式），当前不会拉取官方公开资讯。"
    : scope === "symbol" && isCnOrHk
    ? `当前品种 ${symbol.ticker}（${symbol.name}）为${
        symbol.market === "CN" ? "A 股" : "港股"
      }标的，免 Key 公开源暂仅覆盖美股 SEC EDGAR 公告与全球宏观官方 RSS。可切换上方「全市场/宏观」查看美联储、BLS 与 SEC 官方动态。`
    : "暂未能从官方公开源（SEC EDGAR / 美联储 / BLS）获取数据，可能是本机离线或网络受限。联网后点击重试即可刷新；配置 FINNHUB_API_KEY 或 POLYGON_API_KEY 还可解锁美股公司聚合资讯。";

  return {
    scope,
    symbolId: symbol?.id,
    items: [],
    sources: [],
    delayNote: "仅展示合规公开来源标题、时间与原文外链，不抓取网页正文。",
    mode: "empty",
    fetchedAt: new Date().toISOString(),
    emptyHint,
  };
}
