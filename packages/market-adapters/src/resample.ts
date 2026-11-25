import type {
  Interval,
  NormalizedBar,
  NormalizedQuote,
} from "@trade-buddy/shared-types";

/**
 * 将日线 OHLCV 聚合为周线（周一为起点）或月线（按自然月）
 */
export function resampleDailyBars(
  dailyBars: NormalizedBar[],
  targetInterval: Interval
): NormalizedBar[] {
  if (targetInterval === "1D" || targetInterval === "60m") {
    return dailyBars;
  }

  const buckets = new Map<string, NormalizedBar>();

  for (const bar of dailyBars) {
    const dt = new Date(bar.timestamp);
    let key: string;
    let bucketTs: number;

    if (targetInterval === "1W") {
      const day = dt.getUTCDay(); // 0=Sun, 1=Mon
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(
        Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + diffToMonday)
      );
      key = monday.toISOString().slice(0, 10);
      bucketTs = monday.getTime();
    } else {
      // 1M
      const firstOfMonth = new Date(
        Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)
      );
      key = firstOfMonth.toISOString().slice(0, 7);
      bucketTs = firstOfMonth.getTime();
    }

    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        timestamp: bucketTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function pctChange(current: number, base?: number): number | undefined {
  if (!base || base <= 0) return undefined;
  return Number((((current - base) / base) * 100).toFixed(2));
}

export function computeQuoteFromDailyBars(
  symbolId: string,
  dailyBars: NormalizedBar[]
): NormalizedQuote {
  const len = dailyBars.length;
  if (len === 0) {
    return {
      symbolId,
      last: 0,
      open: 0,
      high: 0,
      low: 0,
      prevClose: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      high52w: 0,
      low52w: 0,
      updatedAt: "",
      perf: {},
    };
  }

  const latest = dailyBars[len - 1];
  const prev = len >= 2 ? dailyBars[len - 2] : latest;
  const change = Number((latest.close - prev.close).toFixed(4));
  const changePercent =
    prev.close > 0 ? Number(((change / prev.close) * 100).toFixed(2)) : 0;

  const last252 = dailyBars.slice(-252);
  let high52w = -Infinity;
  let low52w = Infinity;
  for (const b of last252) {
    if (b.high > high52w) high52w = b.high;
    if (b.low < low52w) low52w = b.low;
  }

  const closeAtOffset = (tradingDays: number) => {
    const idx = len - 1 - tradingDays;
    return idx >= 0 ? dailyBars[idx].close : dailyBars[0]?.close;
  };

  return {
    symbolId,
    last: latest.close,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    prevClose: prev.close,
    change,
    changePercent,
    volume: latest.volume,
    high52w: Number.isFinite(high52w) ? high52w : latest.high,
    low52w: Number.isFinite(low52w) ? low52w : latest.low,
    updatedAt: new Date(latest.timestamp).toISOString().slice(0, 10),
    perf: {
      w1: pctChange(latest.close, closeAtOffset(5)),
      m1: pctChange(latest.close, closeAtOffset(21)),
      m3: pctChange(latest.close, closeAtOffset(63)),
      m6: pctChange(latest.close, closeAtOffset(126)),
      y1: pctChange(latest.close, closeAtOffset(252)),
    },
  };
}
