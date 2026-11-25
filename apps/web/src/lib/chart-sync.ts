import type {
  Interval,
  NormalizedBar,
  NormalizedQuote,
} from "@trade-buddy/shared-types";

export interface NearestBarMatch {
  index: number;
  bar: NormalizedBar;
  exact: boolean;
  diffMs: number;
}

/**
 * Binary search for exact or nearest bar by timestamp in an ascending bars array.
 */
export function findNearestBarByTimestamp(
  bars: NormalizedBar[],
  targetTimestamp: number
): NearestBarMatch | null {
  const n = bars.length;
  if (n === 0) return null;

  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const ts = bars[mid].timestamp;
    if (ts === targetTimestamp) {
      return { index: mid, bar: bars[mid], exact: true, diffMs: 0 };
    }
    if (ts < targetTimestamp) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // lo is the first index with timestamp > targetTimestamp, hi = lo - 1
  if (lo <= 0) {
    return {
      index: 0,
      bar: bars[0],
      exact: false,
      diffMs: Math.abs(bars[0].timestamp - targetTimestamp),
    };
  }
  if (lo >= n) {
    return {
      index: n - 1,
      bar: bars[n - 1],
      exact: false,
      diffMs: Math.abs(bars[n - 1].timestamp - targetTimestamp),
    };
  }

  const prevBar = bars[lo - 1];
  const nextBar = bars[lo];
  const prevDiff = Math.abs(targetTimestamp - prevBar.timestamp);
  const nextDiff = Math.abs(nextBar.timestamp - targetTimestamp);

  if (prevDiff <= nextDiff) {
    return {
      index: lo - 1,
      bar: prevBar,
      exact: false,
      diffMs: prevDiff,
    };
  }
  return {
    index: lo,
    bar: nextBar,
    exact: false,
    diffMs: nextDiff,
  };
}

export interface TimestampSliceResult {
  bars: NormalizedBar[];
  clampedToFirst: boolean;
}

/**
 * Slice an ascending bars array to all bars with timestamp <= maxTimestamp.
 * Guarantees no future bars leak into linked panes during replay.
 */
export function sliceBarsUpToTimestamp(
  bars: NormalizedBar[],
  maxTimestamp: number
): TimestampSliceResult {
  const n = bars.length;
  if (n === 0) return { bars: [], clampedToFirst: false };

  if (maxTimestamp < bars[0].timestamp) {
    return { bars: bars.slice(0, 1), clampedToFirst: true };
  }
  if (maxTimestamp >= bars[n - 1].timestamp) {
    return { bars, clampedToFirst: false };
  }

  let lo = 0;
  let hi = n - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].timestamp <= maxTimestamp) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { bars: bars.slice(0, ans + 1), clampedToFirst: false };
}

/**
 * Format bar timestamp consistently with the chart axis timezone (Asia/Shanghai).
 */
export function formatBarTimestamp(
  timestamp: number,
  interval: Interval,
  compact = false
): string {
  const dt = new Date(timestamp);
  if (Number.isNaN(dt.getTime())) return "—";

  if (interval === "60m") {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (compact) {
      return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
    }
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  }

  const iso = dt.toISOString().slice(0, 10);
  return compact ? iso.slice(5) : iso;
}

/**
 * Derive an honest quote strictly from visible replay prefix bars so details
 * panels never display future prices while replaying.
 */
export function deriveQuoteFromBars(
  baseQuote: NormalizedQuote,
  visibleBars: NormalizedBar[],
  interval: Interval
): NormalizedQuote {
  const n = visibleBars.length;
  if (n === 0) return baseQuote;

  const latest = visibleBars[n - 1];
  const prev = n >= 2 ? visibleBars[n - 2] : null;
  const prevClose = prev ? prev.close : latest.open;
  const change = latest.close - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  // Approximate 52w window from visible prefix
  const lookback =
    interval === "60m"
      ? Math.min(n, 252 * 7)
      : interval === "1W"
      ? Math.min(n, 52)
      : interval === "1M"
      ? Math.min(n, 12)
      : Math.min(n, 252);

  let high52w = latest.high;
  let low52w = latest.low;
  for (let i = n - lookback; i < n; i++) {
    if (visibleBars[i].high > high52w) high52w = visibleBars[i].high;
    if (visibleBars[i].low < low52w) low52w = visibleBars[i].low;
  }

  const calcPerf = (barsAgo: number): number | undefined => {
    const idx = n - 1 - barsAgo;
    if (idx < 0) return undefined;
    const base = visibleBars[idx].close;
    if (base <= 0) return undefined;
    return ((latest.close - base) / base) * 100;
  };

  const perf =
    interval === "1D"
      ? {
          w1: calcPerf(5),
          m1: calcPerf(21),
          m3: calcPerf(63),
          m6: calcPerf(126),
          y1: calcPerf(252),
        }
      : interval === "1W"
      ? {
          w1: calcPerf(1),
          m1: calcPerf(4),
          m3: calcPerf(13),
          m6: calcPerf(26),
          y1: calcPerf(52),
        }
      : interval === "1M"
      ? {
          m1: calcPerf(1),
          m3: calcPerf(3),
          m6: calcPerf(6),
          y1: calcPerf(12),
        }
      : {};

  return {
    symbolId: baseQuote.symbolId,
    last: latest.close,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    prevClose,
    change,
    changePercent,
    volume: latest.volume,
    high52w,
    low52w,
    updatedAt: `${formatBarTimestamp(latest.timestamp, interval)} (回放)`,
    perf,
  };
}
