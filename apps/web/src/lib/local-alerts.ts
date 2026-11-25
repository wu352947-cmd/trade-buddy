import {
  ALERT_CONDITION_LABELS,
  DEFAULT_LOCAL_ALERTS_SETTINGS,
  LocalAlertsStoreSchema,
  type AlertConditionType,
  type AlertTriggerEvent,
  type Interval,
  type LocalAlertRule,
  type LocalAlertsStore,
  type NormalizedBar,
  type NormalizedQuote,
} from "@trade-buddy/shared-types";

export const LOCAL_ALERTS_STORAGE_KEY = "trade-buddy:local-alerts:v1";
export const MAX_ALERT_HISTORY = 200;

export const LOCAL_ALERTS_OPEN_PAGE_NOTICE =
  "提醒只在本页面打开时生效，关闭页面不会推送";

export function createEmptyLocalAlertsStore(): LocalAlertsStore {
  return {
    version: 1,
    rules: [],
    history: [],
    settings: { ...DEFAULT_LOCAL_ALERTS_SETTINGS },
    updatedAt: new Date().toISOString(),
  };
}

export function loadLocalAlertsStore(): LocalAlertsStore {
  if (typeof window === "undefined") {
    return createEmptyLocalAlertsStore();
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_ALERTS_STORAGE_KEY);
    if (!raw) return createEmptyLocalAlertsStore();
    const parsed = JSON.parse(raw);
    const validated = LocalAlertsStoreSchema.safeParse(parsed);
    if (!validated.success) return createEmptyLocalAlertsStore();
    return validated.data;
  } catch {
    return createEmptyLocalAlertsStore();
  }
}

export function saveLocalAlertsStore(store: LocalAlertsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function isPriceAlertCondition(condition: AlertConditionType): boolean {
  return (
    condition === "price_cross_above" || condition === "price_cross_below"
  );
}

export function isChangePctAlertCondition(
  condition: AlertConditionType
): boolean {
  return (
    condition === "change_pct_up" ||
    condition === "change_pct_down" ||
    condition === "change_pct_abs"
  );
}

export function isMaAlertCondition(condition: AlertConditionType): boolean {
  return condition === "ma_golden_cross" || condition === "ma_death_cross";
}

export function isRsiAlertCondition(condition: AlertConditionType): boolean {
  return condition === "rsi_above" || condition === "rsi_below";
}

export function formatAlertRuleSummary(rule: LocalAlertRule): string {
  const prec = rule.pricePrecision ?? 2;
  switch (rule.condition) {
    case "price_cross_above":
      return `价格上穿 ${(rule.threshold ?? 0).toFixed(prec)}`;
    case "price_cross_below":
      return `价格下穿 ${(rule.threshold ?? 0).toFixed(prec)}`;
    case "change_pct_up":
      return `涨幅 ≥ +${Math.abs(rule.threshold ?? 0).toFixed(2)}%（相对前收）`;
    case "change_pct_down":
      return `跌幅 ≤ -${Math.abs(rule.threshold ?? 0).toFixed(2)}%（相对前收）`;
    case "change_pct_abs":
      return `涨跌幅波动 ≥ ±${Math.abs(rule.threshold ?? 0).toFixed(2)}%`;
    case "ma_golden_cross":
      return `MA(${rule.maFastPeriod ?? 5}) 上穿 MA(${rule.maSlowPeriod ?? 20}) 金叉`;
    case "ma_death_cross":
      return `MA(${rule.maFastPeriod ?? 5}) 下穿 MA(${rule.maSlowPeriod ?? 20}) 死叉`;
    case "rsi_above":
      return `RSI(${rule.rsiPeriod ?? 14}) ≥ ${(rule.threshold ?? 70).toFixed(1)}`;
    case "rsi_below":
      return `RSI(${rule.rsiPeriod ?? 14}) ≤ ${(rule.threshold ?? 30).toFixed(1)}`;
  }
}

/** Simple Moving Average over closes ending at `endIndex` (inclusive). */
export function computeSmaAt(
  bars: NormalizedBar[],
  endIndex: number,
  period: number
): number | null {
  if (period <= 0 || endIndex < period - 1 || endIndex >= bars.length) {
    return null;
  }
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += bars[i].close;
  }
  return sum / period;
}

/** Wilder's RSI at the latest bar of `bars`. */
export function computeLatestRsi(
  bars: NormalizedBar[],
  period = 14
): number | null {
  if (period < 2 || bars.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta > 0) gainSum += delta;
    else if (delta < 0) lossSum += -delta;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < bars.length; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface AlertEvaluationFeed {
  symbolId: string;
  interval: Interval;
  bars: NormalizedBar[];
  quote: NormalizedQuote | null;
  isReplay: boolean;
}

export interface AlertEvaluationOutcome {
  triggered: boolean;
  triggerValue: number | null;
  barTimestamp: number | null;
  observedPrice: number | null;
  title: string;
  message: string;
  statusDetail: string;
}

/**
 * Pure alert condition evaluator against loaded bars/quote.
 * Does NOT mutate the rule; callers apply frequency & state updates.
 */
export function evaluateAlertRule(
  rule: LocalAlertRule,
  feed: AlertEvaluationFeed,
  prevObservedPrice: number | null
): AlertEvaluationOutcome {
  const bars = feed.bars;
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;
  const quote = feed.quote;
  const prec = rule.pricePrecision ?? 2;

  const currentPrice =
    quote && quote.last > 0
      ? quote.last
      : lastBar && lastBar.close > 0
      ? lastBar.close
      : null;

  const barTimestamp = lastBar
    ? lastBar.timestamp
    : quote?.updatedAt && Number.isFinite(Date.parse(quote.updatedAt))
    ? Date.parse(quote.updatedAt)
    : null;

  const condLabel = ALERT_CONDITION_LABELS[rule.condition];
  const baseTitle = `${rule.ticker} · ${condLabel}`;

  // 1. Price Cross Above / Below
  if (isPriceAlertCondition(rule.condition)) {
    const target = rule.threshold;
    if (target === undefined || !Number.isFinite(target) || currentPrice === null) {
      return {
        triggered: false,
        triggerValue: currentPrice,
        barTimestamp,
        observedPrice: currentPrice,
        title: baseTitle,
        message: "",
        statusDetail: "暂无可用行情价",
      };
    }

    const refPrev =
      prevObservedPrice ??
      (prevBar ? prevBar.close : quote && quote.prevClose > 0 ? quote.prevClose : lastBar?.open ?? null);

    let crossed = false;
    if (rule.condition === "price_cross_above") {
      if (refPrev !== null && refPrev < target && currentPrice >= target) {
        crossed = true;
      } else if (
        lastBar &&
        ((refPrev !== null && refPrev < target && lastBar.high >= target) ||
          (lastBar.open < target && currentPrice >= target) ||
          (lastBar.low < target && currentPrice >= target))
      ) {
        crossed = true;
      }
    } else {
      if (refPrev !== null && refPrev > target && currentPrice <= target) {
        crossed = true;
      } else if (
        lastBar &&
        ((refPrev !== null && refPrev > target && lastBar.low <= target) ||
          (lastBar.open > target && currentPrice <= target) ||
          (lastBar.high > target && currentPrice <= target))
      ) {
        crossed = true;
      }
    }

    return {
      triggered: crossed,
      triggerValue: currentPrice,
      barTimestamp,
      observedPrice: currentPrice,
      title: baseTitle,
      message: `${rule.ticker}（${rule.symbolName}）[${rule.interval}] 当前价 ${currentPrice.toFixed(
        prec
      )} 已${rule.condition === "price_cross_above" ? "上穿" : "下穿"}目标价 ${target.toFixed(
        prec
      )}${rule.note ? ` · ${rule.note}` : ""}`,
      statusDetail: `当前价 ${currentPrice.toFixed(prec)} / 阈值 ${target.toFixed(prec)}`,
    };
  }

  // 2. Change % relative to prevClose
  if (isChangePctAlertCondition(rule.condition)) {
    const thresholdPct = Math.abs(rule.threshold ?? 0);
    const prevClose =
      quote && quote.prevClose > 0
        ? quote.prevClose
        : prevBar && prevBar.close > 0
        ? prevBar.close
        : null;

    if (currentPrice === null || prevClose === null || prevClose <= 0) {
      return {
        triggered: false,
        triggerValue: null,
        barTimestamp,
        observedPrice: currentPrice,
        title: baseTitle,
        message: "",
        statusDetail: "缺少前收价，无法计算涨跌幅",
      };
    }

    const changePct = ((currentPrice - prevClose) / prevClose) * 100;
    const hit =
      rule.condition === "change_pct_up"
        ? changePct >= thresholdPct
        : rule.condition === "change_pct_down"
        ? changePct <= -thresholdPct
        : Math.abs(changePct) >= thresholdPct;

    const sign = changePct >= 0 ? "+" : "";
    return {
      triggered: hit,
      triggerValue: changePct,
      barTimestamp,
      observedPrice: currentPrice,
      title: baseTitle,
      message: `${rule.ticker}（${rule.symbolName}）[${rule.interval}] 相对前收涨跌幅 ${sign}${changePct.toFixed(
        2
      )}%（现价 ${currentPrice.toFixed(prec)}，前收 ${prevClose.toFixed(
        prec
      )}），达到阈值 ${thresholdPct.toFixed(2)}%${rule.note ? ` · ${rule.note}` : ""}`,
      statusDetail: `当前 ${sign}${changePct.toFixed(2)}% / 阈值 ${thresholdPct.toFixed(2)}%`,
    };
  }

  // 3. MA Golden / Death Cross
  if (isMaAlertCondition(rule.condition)) {
    const fast = rule.maFastPeriod ?? 5;
    const slow = rule.maSlowPeriod ?? 20;
    if (bars.length < Math.max(fast, slow) + 1) {
      return {
        triggered: false,
        triggerValue: null,
        barTimestamp,
        observedPrice: currentPrice,
        title: baseTitle,
        message: "",
        statusDetail: `K 线数量不足（需至少 ${Math.max(fast, slow) + 1} 根）`,
      };
    }

    const n = bars.length;
    const fastPrev = computeSmaAt(bars, n - 2, fast);
    const slowPrev = computeSmaAt(bars, n - 2, slow);
    const fastCurr = computeSmaAt(bars, n - 1, fast);
    const slowCurr = computeSmaAt(bars, n - 1, slow);

    if (
      fastPrev === null ||
      slowPrev === null ||
      fastCurr === null ||
      slowCurr === null
    ) {
      return {
        triggered: false,
        triggerValue: null,
        barTimestamp,
        observedPrice: currentPrice,
        title: baseTitle,
        message: "",
        statusDetail: "均线计算数据不足",
      };
    }

    const hit =
      rule.condition === "ma_golden_cross"
        ? fastPrev <= slowPrev && fastCurr > slowCurr
        : fastPrev >= slowPrev && fastCurr < slowCurr;

    return {
      triggered: hit,
      triggerValue: fastCurr,
      barTimestamp,
      observedPrice: currentPrice,
      title: baseTitle,
      message: `${rule.ticker}（${rule.symbolName}）[${rule.interval}] MA(${fast})=${fastCurr.toFixed(
        prec
      )} ${rule.condition === "ma_golden_cross" ? "上穿形成金叉" : "下穿形成死叉"} MA(${slow})=${slowCurr.toFixed(
        prec
      )}${rule.note ? ` · ${rule.note}` : ""}`,
      statusDetail: `MA${fast}=${fastCurr.toFixed(prec)}, MA${slow}=${slowCurr.toFixed(prec)}`,
    };
  }

  // 4. RSI Above / Below
  const rsiPeriod = rule.rsiPeriod ?? 14;
  const threshold = rule.threshold ?? (rule.condition === "rsi_above" ? 70 : 30);
  const rsiCurr = computeLatestRsi(bars, rsiPeriod);

  if (rsiCurr === null) {
    return {
      triggered: false,
      triggerValue: null,
      barTimestamp,
      observedPrice: currentPrice,
      title: baseTitle,
      message: "",
      statusDetail: `K 线不足（RSI(${rsiPeriod}) 需至少 ${rsiPeriod + 1} 根）`,
    };
  }

  const hit =
    rule.condition === "rsi_above"
      ? rsiCurr >= threshold
      : rsiCurr <= threshold;

  return {
    triggered: hit,
    triggerValue: rsiCurr,
    barTimestamp,
    observedPrice: currentPrice,
    title: baseTitle,
    message: `${rule.ticker}（${rule.symbolName}）[${rule.interval}] RSI(${rsiPeriod}) = ${rsiCurr.toFixed(
      2
    )}，${rule.condition === "rsi_above" ? "高于" : "低于"}阈值 ${threshold.toFixed(
      1
    )}${rule.note ? ` · ${rule.note}` : ""}`,
    statusDetail: `RSI(${rsiPeriod})=${rsiCurr.toFixed(2)} / 阈值 ${threshold.toFixed(1)}`,
  };
}

export function createAlertTriggerEvent(
  rule: LocalAlertRule,
  outcome: AlertEvaluationOutcome,
  sourceMode: AlertTriggerEvent["sourceMode"]
): AlertTriggerEvent {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `evt-${crypto.randomUUID().slice(0, 8)}`
      : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    alertId: rule.id,
    symbolId: rule.symbolId,
    ticker: rule.ticker,
    symbolName: rule.symbolName,
    interval: rule.interval,
    condition: rule.condition,
    title: outcome.title,
    message: outcome.message,
    triggerValue: outcome.triggerValue ?? 0,
    barTimestamp: outcome.barTimestamp,
    sourceMode,
    triggeredAt: new Date().toISOString(),
    read: false,
  };
}
