import type {
  FundamentalPeriodRow,
  FundamentalsResponse,
  FundamentalsSummary,
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
import { DEFAULT_SYMBOL_ID, getSymbolById, US_SYMBOL_CIK_MAP } from "./catalog";

const FUNDAMENTALS_CACHE = new StaleCache<FundamentalsResponse>(80);
const FUNDAMENTALS_FRESH_TTL_MS = 6 * 60 * 60 * 1000;
const FUNDAMENTALS_STALE_TTL_MS = 48 * 60 * 60 * 1000;

interface SecFactUnitItem {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

interface SecConceptEntry {
  label?: string;
  units?: Record<string, SecFactUnitItem[]>;
}

interface SecCompanyFactsPayload {
  cik?: number | string;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, SecConceptEntry>;
    dei?: Record<string, SecConceptEntry>;
  };
}

interface ParsedMetricPoint {
  endDate: string;
  fiscalYear?: number;
  fiscalPeriod: string;
  form: string;
  filedDate: string;
  val: number;
  priority: number;
}

function durationDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return (e - s) / 86_400_000;
}

function normalizeForm(form?: string): string {
  return (form || "").trim().toUpperCase();
}

function isAnnualForm(form: string): boolean {
  return form === "10-K" || form === "10-K/A" || form === "20-F" || form === "40-F";
}

function isQuarterlyForm(form: string): boolean {
  return form === "10-Q" || form === "10-Q/A";
}

function deriveQuarterLabel(endDate: string, fp?: string, fy?: number): {
  fiscalPeriod: string;
  fiscalYear?: number;
  label: string;
} {
  const year = fy ?? Number(endDate.slice(0, 4));
  const cleanFp = (fp || "").toUpperCase();
  if (cleanFp === "Q1" || cleanFp === "Q2" || cleanFp === "Q3" || cleanFp === "Q4") {
    return {
      fiscalPeriod: cleanFp,
      fiscalYear: Number.isFinite(year) ? year : undefined,
      label: `${endDate.slice(0, 4)} ${cleanFp}`,
    };
  }
  const month = Number(endDate.slice(5, 7));
  const q = month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4";
  return {
    fiscalPeriod: q,
    fiscalYear: Number.isFinite(year) ? year : undefined,
    label: `${endDate.slice(0, 4)} ${q}`,
  };
}

function extractSecSeries(
  facts: SecCompanyFactsPayload["facts"],
  taxonomy: "us-gaap" | "dei",
  conceptNames: string[],
  unitCandidates: string[],
  kind: "flow" | "instant",
  periodType: "annual" | "quarterly"
): Map<string, ParsedMetricPoint> {
  const result = new Map<string, ParsedMetricPoint>();
  const taxGroup = facts?.[taxonomy];
  if (!taxGroup) return result;

  conceptNames.forEach((concept, priorityIdx) => {
    const entry = taxGroup[concept];
    if (!entry?.units) return;

    let rawItems: SecFactUnitItem[] = [];
    for (const unitName of unitCandidates) {
      if (Array.isArray(entry.units[unitName])) {
        rawItems = entry.units[unitName];
        break;
      }
    }
    if (rawItems.length === 0) return;

    for (const item of rawItems) {
      if (typeof item.val !== "number" || !Number.isFinite(item.val)) continue;
      if (!item.end || item.end.length < 10) continue;

      const form = normalizeForm(item.form);
      const endDate = item.end.slice(0, 10);
      const filedDate = (item.filed || "").slice(0, 10);

      if (periodType === "annual") {
        if (!isAnnualForm(form)) continue;
        if (kind === "flow") {
          const days = durationDays(item.start, item.end);
          if (days === null || days < 320 || days > 410) continue;
        }
      } else {
        // Quarterly (strictly 10-Q filings so income & balance-sheet periods align cleanly)
        if (!isQuarterlyForm(form)) {
          continue;
        }
        if (kind === "flow") {
          const days = durationDays(item.start, item.end);
          // Only standalone single-quarter figures (skip 6M/9M YTD cumulative rows)
          if (days === null || days < 60 || days > 115) continue;
        }
      }

      // Deduplicate by endDate (month precision YYYY-MM to merge slight fiscal calendar date alignment)
      const dedupeKey = endDate.slice(0, 7);
      const existing = result.get(dedupeKey);

      const candidate: ParsedMetricPoint = {
        endDate,
        fiscalYear: item.fy,
        fiscalPeriod:
          periodType === "annual"
            ? "FY"
            : deriveQuarterLabel(endDate, item.fp, item.fy).fiscalPeriod,
        form: form.replace("/A", ""),
        filedDate,
        val: item.val,
        priority: priorityIdx,
      };

      if (!existing) {
        result.set(dedupeKey, candidate);
      } else {
        // Prefer higher-priority concept; within same concept prefer latest filing date
        if (
          candidate.priority < existing.priority ||
          (candidate.priority === existing.priority &&
            candidate.filedDate >= existing.filedDate)
        ) {
          result.set(dedupeKey, candidate);
        }
      }
    }
  });

  return result;
}

function buildRowsFromMaps(
  periodType: "annual" | "quarterly",
  maps: {
    revenue: Map<string, ParsedMetricPoint>;
    netIncome: Map<string, ParsedMetricPoint>;
    epsDiluted: Map<string, ParsedMetricPoint>;
    totalAssets: Map<string, ParsedMetricPoint>;
    totalLiabilities: Map<string, ParsedMetricPoint>;
    stockholdersEquity: Map<string, ParsedMetricPoint>;
    sharesOutstanding: Map<string, ParsedMetricPoint>;
  },
  limit: number
): FundamentalPeriodRow[] {
  const allKeys = new Set<string>();
  for (const m of Object.values(maps)) {
    for (const k of m.keys()) {
      allKeys.add(k);
    }
  }

  const rows: FundamentalPeriodRow[] = [];
  for (const key of allKeys) {
    const rev = maps.revenue.get(key);
    const ni = maps.netIncome.get(key);
    const eps = maps.epsDiluted.get(key);
    const assets = maps.totalAssets.get(key);
    const liab = maps.totalLiabilities.get(key);
    const eq = maps.stockholdersEquity.get(key);
    const shares = maps.sharesOutstanding.get(key);

    // Require at least one core income or balance-sheet metric
    if (!rev && !ni && !assets) continue;

    const anchor = rev ?? ni ?? assets ?? liab ?? eq ?? eps!;
    const endDate = anchor.endDate;

    // Fallback: if totalLiabilities missing but assets & equity exist, compute Liabilities = Assets - Equity
    const totalLiabilities =
      liab?.val ??
      (assets && eq ? Number((assets.val - eq.val).toFixed(2)) : null);

    let label: string;
    let fiscalPeriod: string;
    let fiscalYear: number | undefined;

    if (periodType === "annual") {
      const yr = Number(endDate.slice(0, 4));
      fiscalYear = Number.isFinite(yr) ? yr : anchor.fiscalYear;
      fiscalPeriod = "FY";
      label = `FY${fiscalYear ?? endDate.slice(0, 4)}`;
    } else {
      const qInfo = deriveQuarterLabel(
        endDate,
        anchor.fiscalPeriod,
        anchor.fiscalYear
      );
      fiscalPeriod = qInfo.fiscalPeriod;
      fiscalYear = qInfo.fiscalYear;
      label = qInfo.label;
    }

    rows.push({
      periodKey: `${periodType}:${key}`,
      label,
      fiscalYear,
      fiscalPeriod,
      form: anchor.form || (periodType === "annual" ? "10-K" : "10-Q"),
      endDate,
      filedDate: anchor.filedDate || undefined,
      revenue: rev?.val ?? null,
      netIncome: ni?.val ?? null,
      epsDiluted: eps ? Number(eps.val.toFixed(2)) : null,
      totalAssets: assets?.val ?? null,
      totalLiabilities,
      stockholdersEquity: eq?.val ?? null,
      sharesOutstanding: shares?.val ?? null,
    });
  }

  // Sort descending by endDate (newest first)
  rows.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return rows.slice(0, limit);
}

function buildSummary(
  annual: FundamentalPeriodRow[],
  quarterly: FundamentalPeriodRow[]
): FundamentalsSummary | null {
  const latest = annual[0] ?? quarterly[0];
  if (!latest) return null;

  const prevAnnual = annual.length >= 2 ? annual[1] : null;
  const latestBalance =
    quarterly[0] && quarterly[0].endDate > latest.endDate && quarterly[0].totalAssets
      ? quarterly[0]
      : latest;

  const netMarginPct =
    latest.revenue && latest.revenue > 0 && latest.netIncome !== null
      ? Number(((latest.netIncome / latest.revenue) * 100).toFixed(2))
      : null;

  const debtToAssetPct =
    latestBalance.totalAssets &&
    latestBalance.totalAssets > 0 &&
    latestBalance.totalLiabilities !== null
      ? Number(
          (
            (latestBalance.totalLiabilities / latestBalance.totalAssets) *
            100
          ).toFixed(2)
        )
      : null;

  const revenueYoYPct =
    annual[0]?.revenue !== null &&
    annual[0]?.revenue !== undefined &&
    prevAnnual?.revenue &&
    Math.abs(prevAnnual.revenue) > 0
      ? Number(
          (((annual[0].revenue - prevAnnual.revenue) / Math.abs(prevAnnual.revenue)) * 100).toFixed(2)
        )
      : null;

  const netIncomeYoYPct =
    annual[0]?.netIncome !== null &&
    annual[0]?.netIncome !== undefined &&
    prevAnnual?.netIncome &&
    Math.abs(prevAnnual.netIncome) > 0
      ? Number(
          (
            ((annual[0].netIncome - prevAnnual.netIncome) /
              Math.abs(prevAnnual.netIncome)) *
            100
          ).toFixed(2)
        )
      : null;

  return {
    latestPeriodLabel: latest.label,
    latestEndDate: latest.endDate,
    revenue: latest.revenue,
    netIncome: latest.netIncome,
    epsDiluted: latest.epsDiluted,
    totalAssets: latestBalance.totalAssets,
    totalLiabilities: latestBalance.totalLiabilities,
    stockholdersEquity: latestBalance.stockholdersEquity,
    sharesOutstanding: latestBalance.sharesOutstanding,
    netMarginPct,
    debtToAssetPct,
    revenueYoYPct,
    netIncomeYoYPct,
  };
}

async function fetchUsSecFundamentals(
  symbol: SymbolMeta
): Promise<{ ok: true; data: FundamentalsResponse } | { ok: false; error: string }> {
  if (process.env.ENABLE_PUBLIC_FEEDS === "false") {
    return {
      ok: false,
      error: "已通过 ENABLE_PUBLIC_FEEDS=false 关闭公开源，暂无法拉取 SEC EDGAR 财务数据。",
    };
  }

  const cikInfo = US_SYMBOL_CIK_MAP[symbol.id];
  if (!cikInfo) {
    return {
      ok: false,
      error: `当前美股品种 ${symbol.ticker} 暂未配置 SEC CIK 映射。`,
    };
  }

  const quota = tryAcquireQuota("sec_edgar");
  if (!quota.allowed) {
    return {
      ok: false,
      error: `SEC EDGAR 请求保护中（${quota.reason || "请稍后重试"}）。`,
    };
  }

  try {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikInfo.cik}.json`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": getSecUserAgent(),
          Accept: "application/json",
        },
      },
      10000
    );

    if (res.status === 429) {
      recordRateLimitBackoff("sec_edgar", 60);
      return {
        ok: false,
        error: "SEC EDGAR 返回限流（HTTP 429），已自动退避冷却，请稍后重试。",
      };
    }

    if (!res.ok) {
      recordTransientFailure("sec_edgar", `HTTP ${res.status}`);
      return {
        ok: false,
        error: `SEC EDGAR 接口返回 HTTP ${res.status}，请稍后点击重试。`,
      };
    }

    const payload = (await res.json()) as SecCompanyFactsPayload;
    if (!payload.facts) {
      return {
        ok: false,
        error: "SEC EDGAR 返回内容中缺少 XBRL facts 数据。",
      };
    }

    const REVENUE_TAGS = [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueGoodsNet",
    ];
    const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"];
    const EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasic"];
    const ASSETS_TAGS = ["Assets"];
    const LIABILITIES_TAGS = ["Liabilities"];
    const EQUITY_TAGS = [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ];
    const SHARES_USGAAP_TAGS = [
      "CommonStockSharesOutstanding",
      "WeightedAverageNumberOfDilutedSharesOutstanding",
    ];

    const annualMaps = {
      revenue: extractSecSeries(payload.facts, "us-gaap", REVENUE_TAGS, ["USD"], "flow", "annual"),
      netIncome: extractSecSeries(payload.facts, "us-gaap", NET_INCOME_TAGS, ["USD"], "flow", "annual"),
      epsDiluted: extractSecSeries(payload.facts, "us-gaap", EPS_TAGS, ["USD/shares"], "flow", "annual"),
      totalAssets: extractSecSeries(payload.facts, "us-gaap", ASSETS_TAGS, ["USD"], "instant", "annual"),
      totalLiabilities: extractSecSeries(payload.facts, "us-gaap", LIABILITIES_TAGS, ["USD"], "instant", "annual"),
      stockholdersEquity: extractSecSeries(payload.facts, "us-gaap", EQUITY_TAGS, ["USD"], "instant", "annual"),
      sharesOutstanding: extractSecSeries(payload.facts, "us-gaap", SHARES_USGAAP_TAGS, ["shares"], "instant", "annual"),
    };

    const quarterlyMaps = {
      revenue: extractSecSeries(payload.facts, "us-gaap", REVENUE_TAGS, ["USD"], "flow", "quarterly"),
      netIncome: extractSecSeries(payload.facts, "us-gaap", NET_INCOME_TAGS, ["USD"], "flow", "quarterly"),
      epsDiluted: extractSecSeries(payload.facts, "us-gaap", EPS_TAGS, ["USD/shares"], "flow", "quarterly"),
      totalAssets: extractSecSeries(payload.facts, "us-gaap", ASSETS_TAGS, ["USD"], "instant", "quarterly"),
      totalLiabilities: extractSecSeries(payload.facts, "us-gaap", LIABILITIES_TAGS, ["USD"], "instant", "quarterly"),
      stockholdersEquity: extractSecSeries(payload.facts, "us-gaap", EQUITY_TAGS, ["USD"], "instant", "quarterly"),
      sharesOutstanding: extractSecSeries(payload.facts, "us-gaap", SHARES_USGAAP_TAGS, ["shares"], "instant", "quarterly"),
    };

    const annual = buildRowsFromMaps("annual", annualMaps, 6);
    const quarterly = buildRowsFromMaps("quarterly", quarterlyMaps, 8);

    if (annual.length === 0 && quarterly.length === 0) {
      return {
        ok: false,
        error: "已连接 SEC EDGAR，但未能解析到标准 US-GAAP 营收/利润指标。",
      };
    }

    recordProviderSuccess("sec_edgar");

    return {
      ok: true,
      data: {
        symbol,
        mode: "sec_edgar",
        source: "SEC EDGAR",
        sourceBadge: "SEC EDGAR · 官方 XBRL",
        currency: "USD",
        cik: cikInfo.cik,
        entityName: payload.entityName || cikInfo.entityName,
        secBrowseUrl: `https://www.sec.gov/edgar/browse/?CIK=${cikInfo.cik}`,
        unitNote:
          "金额单位：美元（USD），EPS 单位：美元/股（USD/股）；来源：SEC EDGAR 官方 companyfacts（年报 10-K / 单季 10-Q）。",
        annual,
        quarterly,
        summary: buildSummary(annual, quarterly),
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    recordTransientFailure("sec_edgar", "网络超时或离线");
    return {
      ok: false,
      error: "连接 SEC EDGAR 超时或当前环境离线，请检查网络后点击重试。",
    };
  }
}

/**
 * 可选：当用户配置了 TUSHARE_TOKEN 时，尝试拉取 A 股利润表与资产负债表核心指标；
 * 若未配置或积分权限不足，静默返回 null 由上层展示清晰空状态。
 */
async function tryFetchTushareCnFundamentals(
  symbol: SymbolMeta
): Promise<FundamentalsResponse | null> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token || symbol.market !== "CN") return null;

  const quota = tryAcquireQuota("tushare");
  if (!quota.allowed) return null;

  const tsCode = symbol.id.replace(/^CN:/, "");

  try {
    const [incomeRes, bsRes] = await Promise.all([
      fetchWithTimeout(
        "https://api.tushare.pro",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_name: "income",
            token,
            params: { ts_code: tsCode },
            fields: "end_date,ann_date,report_type,total_revenue,n_income_attr_p,diluted_eps,basic_eps",
          }),
        },
        6500
      ),
      fetchWithTimeout(
        "https://api.tushare.pro",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_name: "balancesheet",
            token,
            params: { ts_code: tsCode },
            fields: "end_date,ann_date,report_type,total_assets,total_liab,total_hldr_eqy_exc_min_int,total_share",
          }),
        },
        6500
      ),
    ]);

    if (!incomeRes.ok || !bsRes.ok) return null;

    const incJson = (await incomeRes.json()) as {
      code?: number;
      data?: { fields: string[]; items: Array<Array<string | number | null>> };
    };
    const bsJson = (await bsRes.json()) as {
      code?: number;
      data?: { fields: string[]; items: Array<Array<string | number | null>> };
    };

    if (incJson.code !== 0 || !incJson.data?.items?.length) return null;

    const mapByEnd = new Map<string, FundamentalPeriodRow>();
    const incFields = incJson.data.fields;
    const fEnd = incFields.indexOf("end_date");
    const fAnn = incFields.indexOf("ann_date");
    const fType = incFields.indexOf("report_type");
    const fRev = incFields.indexOf("total_revenue");
    const fNi = incFields.indexOf("n_income_attr_p");
    const fEpsD = incFields.indexOf("diluted_eps");
    const fEpsB = incFields.indexOf("basic_eps");

    for (const row of incJson.data.items) {
      if (fType >= 0 && String(row[fType] ?? "1") !== "1") continue;
      const rawEnd = String(row[fEnd] ?? "");
      if (rawEnd.length !== 8) continue;
      const endDate = `${rawEnd.slice(0, 4)}-${rawEnd.slice(4, 6)}-${rawEnd.slice(6, 8)}`;
      if (mapByEnd.has(endDate)) continue;
      const mmdd = rawEnd.slice(4, 8);
      const fp =
        mmdd === "1231"
          ? "FY"
          : mmdd === "0331"
          ? "Q1"
          : mmdd === "0630"
          ? "Q2"
          : mmdd === "0930"
          ? "Q3"
          : "Q4";
      const rev = row[fRev] !== null ? Number(row[fRev]) : null;
      const ni = row[fNi] !== null ? Number(row[fNi]) : null;
      const epsVal =
        row[fEpsD] !== null && row[fEpsD] !== undefined
          ? Number(row[fEpsD])
          : row[fEpsB] !== null && row[fEpsB] !== undefined
          ? Number(row[fEpsB])
          : null;

      mapByEnd.set(endDate, {
        periodKey: `cn:${endDate}`,
        label: fp === "FY" ? `FY${rawEnd.slice(0, 4)}` : `${rawEnd.slice(0, 4)} ${fp}`,
        fiscalYear: Number(rawEnd.slice(0, 4)),
        fiscalPeriod: fp,
        form: fp === "FY" ? "年报" : "季报(累计)",
        endDate,
        filedDate:
          fAnn >= 0 && String(row[fAnn] ?? "").length === 8
            ? `${String(row[fAnn]).slice(0, 4)}-${String(row[fAnn]).slice(4, 6)}-${String(row[fAnn]).slice(6, 8)}`
            : undefined,
        revenue: Number.isFinite(rev) ? rev : null,
        netIncome: Number.isFinite(ni) ? ni : null,
        epsDiluted: epsVal !== null && Number.isFinite(epsVal) ? Number(epsVal.toFixed(2)) : null,
        totalAssets: null,
        totalLiabilities: null,
        stockholdersEquity: null,
        sharesOutstanding: null,
      });
    }

    if (bsJson.code === 0 && bsJson.data?.items?.length) {
      const bf = bsJson.data.fields;
      const bEnd = bf.indexOf("end_date");
      const bType = bf.indexOf("report_type");
      const bAssets = bf.indexOf("total_assets");
      const bLiab = bf.indexOf("total_liab");
      const bEq = bf.indexOf("total_hldr_eqy_exc_min_int");
      const bShare = bf.indexOf("total_share");

      for (const row of bsJson.data.items) {
        if (bType >= 0 && String(row[bType] ?? "1") !== "1") continue;
        const rawEnd = String(row[bEnd] ?? "");
        if (rawEnd.length !== 8) continue;
        const endDate = `${rawEnd.slice(0, 4)}-${rawEnd.slice(4, 6)}-${rawEnd.slice(6, 8)}`;
        const target = mapByEnd.get(endDate);
        if (!target) continue;
        if (target.totalAssets === null && row[bAssets] !== null) {
          const v = Number(row[bAssets]);
          if (Number.isFinite(v)) target.totalAssets = v;
        }
        if (target.totalLiabilities === null && row[bLiab] !== null) {
          const v = Number(row[bLiab]);
          if (Number.isFinite(v)) target.totalLiabilities = v;
        }
        if (target.stockholdersEquity === null && row[bEq] !== null) {
          const v = Number(row[bEq]);
          if (Number.isFinite(v)) target.stockholdersEquity = v;
        }
        if (target.sharesOutstanding === null && row[bShare] !== null) {
          const v = Number(row[bShare]);
          if (Number.isFinite(v)) target.sharesOutstanding = v;
        }
      }
    }

    const allRows = [...mapByEnd.values()].sort((a, b) =>
      b.endDate.localeCompare(a.endDate)
    );
    const annual = allRows.filter((r) => r.fiscalPeriod === "FY").slice(0, 6);
    const quarterly = allRows.filter((r) => r.fiscalPeriod !== "FY").slice(0, 8);
    if (annual.length === 0 && quarterly.length === 0) return null;

    recordProviderSuccess("tushare");

    return {
      symbol,
      mode: "api_key",
      source: "Tushare Pro",
      sourceBadge: "Tushare Pro · 财务报表",
      currency: "CNY",
      unitNote:
        "金额单位：人民币（CNY），EPS 单位：元/股；来源：Tushare Pro（合并报表，季报为年内累计口径）。",
      annual,
      quarterly,
      summary: buildSummary(annual, quarterly),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getFundamentalsForSymbol(
  rawSymbolId: string,
  forceRefresh = false
): Promise<FundamentalsResponse> {
  const symbol = getSymbolById(rawSymbolId) ?? getSymbolById(DEFAULT_SYMBOL_ID)!;
  const cacheKey = `fundamentals:${symbol.id}`;

  if (!forceRefresh) {
    const fresh = FUNDAMENTALS_CACHE.getFresh(cacheKey);
    if (fresh) {
      return { ...fresh, cached: true };
    }
  }

  // 1. US Equities with SEC CIK -> Official SEC EDGAR companyfacts (no key required)
  if (symbol.market === "US" && US_SYMBOL_CIK_MAP[symbol.id]) {
    const res = await fetchUsSecFundamentals(symbol);
    if (res.ok) {
      FUNDAMENTALS_CACHE.set(
        cacheKey,
        res.data,
        FUNDAMENTALS_FRESH_TTL_MS,
        FUNDAMENTALS_STALE_TTL_MS
      );
      return res.data;
    }

    const stale = FUNDAMENTALS_CACHE.getStale(cacheKey);
    if (stale) {
      return {
        ...stale.value,
        mode: "stale_cache",
        cached: true,
        stale: true,
        warning: `${res.error} 已展示 ${stale.ageMinutes} 分钟前缓存数据。`,
      };
    }

    const cikInfo = US_SYMBOL_CIK_MAP[symbol.id];
    return {
      symbol,
      mode: "error",
      source: "SEC EDGAR",
      sourceBadge: "SEC EDGAR · 暂不可达",
      currency: symbol.currency,
      cik: cikInfo.cik,
      entityName: cikInfo.entityName,
      secBrowseUrl: `https://www.sec.gov/edgar/browse/?CIK=${cikInfo.cik}`,
      unitNote: "来源：SEC EDGAR 官方 companyfacts（免 Key 公开接口）",
      annual: [],
      quarterly: [],
      summary: null,
      fetchedAt: new Date().toISOString(),
      errorMessage: res.error,
    };
  }

  // 2. CN Equities -> Optional Tushare Pro if configured
  if (symbol.market === "CN") {
    const tushareData = await tryFetchTushareCnFundamentals(symbol);
    if (tushareData) {
      FUNDAMENTALS_CACHE.set(
        cacheKey,
        tushareData,
        FUNDAMENTALS_FRESH_TTL_MS,
        FUNDAMENTALS_STALE_TTL_MS
      );
      return tushareData;
    }
    return {
      symbol,
      mode: "unsupported",
      source: "未接入",
      sourceBadge: "需可选 Key",
      currency: symbol.currency,
      unitNote: "A 股财务报表未配置在线数据源",
      annual: [],
      quarterly: [],
      summary: null,
      fetchedAt: new Date().toISOString(),
      emptyHint:
        "无 key 时财务数据目前仅支持美股 SEC 公开 companyfacts；可在设置中查看数据源状态并按说明在本地 .env.local 配置可选 key（如 TUSHARE_TOKEN）。",
    };
  }

  // 3. HK Equities / Indexes / ETF Proxies -> Honest empty state
  return {
    symbol,
    mode: "unsupported",
    source: "未接入",
    sourceBadge:
      symbol.market === "FUTURES_INDEX" ? "指数 / ETF 代理" : "需可选 Key",
    currency: symbol.currency,
    unitNote:
      symbol.market === "FUTURES_INDEX"
        ? "宽基指数与 ETF 代理通常无单体上市公司财务报表"
        : "港股财务报表需配置可选付费/研究数据源",
    annual: [],
    quarterly: [],
    summary: null,
    fetchedAt: new Date().toISOString(),
    emptyHint:
      symbol.market === "FUTURES_INDEX"
        ? "当前标的为指数或 ETF 代理，无单体公司财报。无 key 时财务数据目前仅支持美股个股（AAPL / MSFT / TSLA / AMZN）的 SEC 公开 companyfacts。"
        : "无 key 时财务数据目前仅支持美股 SEC 公开 companyfacts；可在设置中配置可选 key（不抓取付费终端或财经网站 HTML）。",
  };
}
