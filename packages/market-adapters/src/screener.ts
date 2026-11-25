import type {
  MarketCategory,
  NormalizedBar,
  ScreenerItem,
  ScreenerResponse,
} from "@trade-buddy/shared-types";

import { StaleCache } from "./cache-limiter";
import { SYMBOL_CATALOG } from "./catalog";
import { getDailySnapshotForScreener } from "./providers";

const SCREENER_CACHE = new StaleCache<ScreenerResponse>(16);
const SCREENER_FRESH_TTL_MS = 5 * 60 * 1000;
const SCREENER_STALE_TTL_MS = 6 * 60 * 60 * 1000;

function computeSMA(bars: NormalizedBar[], period: number): number | null {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    sum += bars[i].close;
  }
  return Number((sum / period).toFixed(4));
}

export interface ScreenerQueryOptions {
  market?: MarketCategory | "ALL";
  minChangePct?: number;
  maxChangePct?: number;
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  minTurnover?: number;
  ma20?: "all" | "above" | "below";
  ma60?: "all" | "above" | "below";
  refresh?: boolean;
}

async function buildAllScreenerItems(): Promise<ScreenerResponse> {
  const snapshots = await Promise.all(
    SYMBOL_CATALOG.map((sym) => getDailySnapshotForScreener(sym, true))
  );

  const items: ScreenerItem[] = snapshots.map(({ symbol, bars, quote, provenance }) => {
    const hasData = bars.length > 0 && quote.last > 0;
    const price = quote.last;
    const ma20 = hasData ? computeSMA(bars, 20) : null;
    const ma60 = hasData ? computeSMA(bars, 60) : null;
    const aboveMa20 = ma20 !== null && price > 0 ? price >= ma20 : null;
    const aboveMa60 = ma60 !== null && price > 0 ? price >= ma60 : null;
    const distMa20Pct =
      ma20 !== null && ma20 > 0
        ? Number((((price - ma20) / ma20) * 100).toFixed(2))
        : null;
    const distMa60Pct =
      ma60 !== null && ma60 > 0
        ? Number((((price - ma60) / ma60) * 100).toFixed(2))
        : null;
    const volume = quote.volume ?? 0;
    const turnover =
      hasData && volume > 0 ? Math.round(price * volume) : 0;

    return {
      symbol,
      price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume,
      turnover,
      ma20,
      ma60,
      aboveMa20,
      aboveMa60,
      distMa20Pct,
      distMa60Pct,
      high52w: quote.high52w,
      low52w: quote.low52w,
      perf: quote.perf,
      updatedAt: quote.updatedAt,
      hasData,
      provenance,
    };
  });

  return {
    items,
    total: items.length,
    fetchedAt: new Date().toISOString(),
    note: "基于内置品种日线（样本 / FRED 官方在线指数 / 已缓存免费行情）服务端计算 MA20 与 MA60，已做内存缓存保护。",
  };
}

export async function getScreenerData(
  options: ScreenerQueryOptions = {}
): Promise<ScreenerResponse> {
  const cacheKey = "screener:all";
  let base: ScreenerResponse | null = options.refresh
    ? null
    : SCREENER_CACHE.getFresh(cacheKey);

  if (base) {
    base = { ...base, cached: true };
  } else {
    try {
      const fresh = await buildAllScreenerItems();
      SCREENER_CACHE.set(
        cacheKey,
        fresh,
        SCREENER_FRESH_TTL_MS,
        SCREENER_STALE_TTL_MS
      );
      base = fresh;
    } catch {
      const stale = SCREENER_CACHE.getStale(cacheKey);
      if (stale) {
        base = { ...stale.value, cached: true };
      } else {
        base = {
          items: [],
          total: 0,
          fetchedAt: new Date().toISOString(),
          note: "计算筛选指标失败，请稍后重试。",
        };
      }
    }
  }

  // Apply optional server-side filters
  const filtered = base.items.filter((item) => {
    if (options.market && options.market !== "ALL" && item.symbol.market !== options.market) {
      return false;
    }
    if (
      typeof options.minChangePct === "number" &&
      (!item.hasData || item.changePercent < options.minChangePct)
    ) {
      return false;
    }
    if (
      typeof options.maxChangePct === "number" &&
      (!item.hasData || item.changePercent > options.maxChangePct)
    ) {
      return false;
    }
    if (
      typeof options.minPrice === "number" &&
      (!item.hasData || item.price < options.minPrice)
    ) {
      return false;
    }
    if (
      typeof options.maxPrice === "number" &&
      (!item.hasData || item.price > options.maxPrice)
    ) {
      return false;
    }
    if (
      typeof options.minVolume === "number" &&
      item.volume < options.minVolume
    ) {
      return false;
    }
    if (
      typeof options.minTurnover === "number" &&
      item.turnover < options.minTurnover
    ) {
      return false;
    }
    if (options.ma20 === "above" && item.aboveMa20 !== true) return false;
    if (options.ma20 === "below" && item.aboveMa20 !== false) return false;
    if (options.ma60 === "above" && item.aboveMa60 !== true) return false;
    if (options.ma60 === "below" && item.aboveMa60 !== false) return false;
    return true;
  });

  return {
    ...base,
    items: filtered,
    total: filtered.length,
  };
}
