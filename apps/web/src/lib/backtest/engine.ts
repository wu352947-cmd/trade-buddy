import type {
  BacktestEquityPoint,
  BacktestPositionSizing,
  BacktestResult,
  BacktestRunParams,
  BacktestStrategyConfig,
  BacktestSummary,
  BacktestTrade,
  BacktestUnexecutedSignal,
  NormalizedBar,
} from "@trade-buddy/shared-types";

const EPSILON = 1e-9;

function roundMoney(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function roundQty(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/**
 * Compute commission fee for a trade notional.
 * fee = max(notional * (feeRatePct / 100), minFee) when notional > 0 and (feeRatePct > 0 || minFee > 0).
 */
export function computeBacktestFee(
  notional: number,
  feeRatePct: number,
  minFee = 0
): number {
  if (!Number.isFinite(notional) || notional <= 0) return 0;
  const rate = Math.max(0, feeRatePct) / 100;
  const floorFee = Math.max(0, minFee);
  if (rate <= 0 && floorFee <= 0) return 0;
  return roundMoney(Math.max(notional * rate, floorFee));
}

/**
 * Compute execution price with slippage applied to bar open price:
 * - buy:  open * (1 + slippagePct / 100)
 * - sell: open * (1 - slippagePct / 100)
 */
export function computeBacktestExecutionPrice(
  side: "buy" | "sell",
  openPrice: number,
  slippagePct: number
): number {
  const slipRatio = Math.max(0, slippagePct) / 100;
  if (side === "buy") {
    return roundMoney(openPrice * (1 + slipRatio));
  }
  return roundMoney(Math.max(1e-8, openPrice * (1 - slipRatio)));
}

/**
 * Compute maximum 1x spot affordable buy quantity within cashBudget,
 * guaranteeing `qty * execPrice + computeBacktestFee(qty * execPrice, feeRatePct, minFee) <= cashBudget`.
 */
export function computeMaxAffordableQty(
  cashBudget: number,
  execPrice: number,
  feeRatePct: number,
  minFee: number,
  allowFractionalShares: boolean
): number {
  if (
    !Number.isFinite(cashBudget) ||
    cashBudget <= 0 ||
    !Number.isFinite(execPrice) ||
    execPrice <= 0
  ) {
    return 0;
  }

  const rate = Math.max(0, feeRatePct) / 100;
  const floorFee = Math.max(0, minFee);
  if (cashBudget <= floorFee + EPSILON) return 0;

  const maxNotionalByRate = cashBudget / (1 + rate);
  const maxNotionalByMinFee = cashBudget - floorFee;
  const maxNotional = Math.min(maxNotionalByRate, maxNotionalByMinFee);
  if (maxNotional <= 0) return 0;

  const rawQty = maxNotional / execPrice;

  if (!allowFractionalShares) {
    let qty = Math.floor(rawQty + EPSILON);
    while (qty > 0) {
      const notional = roundMoney(qty * execPrice);
      const fee = computeBacktestFee(notional, feeRatePct, minFee);
      if (notional + fee <= cashBudget + EPSILON) {
        return qty;
      }
      qty -= 1;
    }
    return 0;
  }

  let qty = Math.floor(rawQty * 1_000_000) / 1_000_000;
  if (qty <= 0) return 0;
  const notional = roundMoney(qty * execPrice);
  const fee = computeBacktestFee(notional, feeRatePct, minFee);
  if (notional + fee > cashBudget + EPSILON) {
    qty = Math.max(0, roundQty(qty - 0.000001));
  }
  return qty;
}

/**
 * Strict causal (no-lookahead) Simple Moving Average at index `endIndex` using only bars[0..endIndex].
 */
export function computeCausalSmaAt(
  bars: readonly NormalizedBar[],
  endIndex: number,
  period: number
): number | null {
  if (period <= 0 || endIndex < period - 1 || endIndex >= bars.length) {
    return null;
  }
  let sum = 0;
  for (let k = endIndex - period + 1; k <= endIndex; k++) {
    sum += bars[k].close;
  }
  return sum / period;
}

/**
 * Strict causal (no-lookahead) Bollinger Bands at index `endIndex` using only bars[0..endIndex].
 * Uses population standard deviation over the `period` closing prices ending at `endIndex`.
 */
export function computeCausalBollingerAt(
  bars: readonly NormalizedBar[],
  endIndex: number,
  period: number,
  stdDevMultiplier: number
): { middle: number; upper: number; lower: number; stdDev: number } | null {
  const middle = computeCausalSmaAt(bars, endIndex, period);
  if (middle === null) return null;
  let sqDiffSum = 0;
  for (let k = endIndex - period + 1; k <= endIndex; k++) {
    const d = bars[k].close - middle;
    sqDiffSum += d * d;
  }
  const stdDev = Math.sqrt(sqDiffSum / period);
  return {
    middle,
    upper: middle + stdDevMultiplier * stdDev,
    lower: middle - stdDevMultiplier * stdDev,
    stdDev,
  };
}

/**
 * Incremental causal Wilder RSI state.
 * Each `push(close)` strictly depends only on the closes pushed so far (zero future data).
 */
class CausalWilderRsi {
  private readonly period: number;
  private count = 0;
  private prevClose: number | null = null;
  private initGainSum = 0;
  private initLossSum = 0;
  private avgGain: number | null = null;
  private avgLoss: number | null = null;

  constructor(period: number) {
    this.period = period;
  }

  push(close: number): number | null {
    this.count += 1;
    if (this.prevClose === null) {
      this.prevClose = close;
      return null;
    }

    const change = close - this.prevClose;
    this.prevClose = close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    // Need `period` price changes -> first valid RSI on bar index `period` (count === period + 1)
    if (this.count <= this.period) {
      this.initGainSum += gain;
      this.initLossSum += loss;
      return null;
    }

    if (this.avgGain === null || this.avgLoss === null) {
      this.initGainSum += gain;
      this.initLossSum += loss;
      this.avgGain = this.initGainSum / this.period;
      this.avgLoss = this.initLossSum / this.period;
    } else {
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }

    if (this.avgLoss <= EPSILON) {
      return this.avgGain <= EPSILON ? 50 : 100;
    }
    const rs = this.avgGain / this.avgLoss;
    return 100 - 100 / (1 + rs);
  }
}

interface PendingSignal {
  side: "buy" | "sell";
  signalBarIndex: number;
  signalTimestamp: number;
  reason: string;
}

function validateBacktestParams(params: BacktestRunParams): {
  positionSizing: BacktestPositionSizing;
  minFee: number;
  allowFractionalShares: boolean;
} {
  // Hard-coded safety invariants: 1x spot only, no leverage, no shorting
  const raw = params as unknown as Record<string, unknown>;
  if (raw.leverage !== undefined && raw.leverage !== 1) {
    throw new Error("回测沙盒仅支持 1 倍现货，禁止任何杠杆参数");
  }
  if (raw.allowShort !== undefined && raw.allowShort !== false) {
    throw new Error("回测沙盒严禁卖空，仅支持 1 倍现货多头");
  }

  if (!Array.isArray(params.bars)) {
    throw new Error("K 线数据必须为数组");
  }
  for (let i = 0; i < params.bars.length; i++) {
    const b = params.bars[i];
    if (
      !Number.isFinite(b.timestamp) ||
      !Number.isFinite(b.open) ||
      !Number.isFinite(b.close) ||
      b.open <= 0 ||
      b.close <= 0
    ) {
      throw new Error(`第 ${i + 1} 根 K 线包含无效价格或时间戳`);
    }
    if (i > 0 && b.timestamp < params.bars[i - 1].timestamp) {
      throw new Error("K 线数组必须按时间戳升序排列");
    }
  }

  if (!Number.isFinite(params.initialCash) || params.initialCash <= 0) {
    throw new Error("初始资金必须为大于 0 的有限数值");
  }
  if (!Number.isFinite(params.feeRatePct) || params.feeRatePct < 0 || params.feeRatePct > 10) {
    throw new Error("手续费率需在 0% ~ 10% 之间");
  }
  const minFee = params.minFee ?? 0;
  if (!Number.isFinite(minFee) || minFee < 0) {
    throw new Error("最低手续费不能为负数");
  }
  if (
    !Number.isFinite(params.slippagePct) ||
    params.slippagePct < 0 ||
    params.slippagePct > 10
  ) {
    throw new Error("滑点比例需在 0% ~ 10% 之间");
  }

  const s = params.strategy;
  if (s.type === "ma_cross") {
    if (!Number.isInteger(s.fastPeriod) || s.fastPeriod < 2) {
      throw new Error("快线周期必须为大于等于 2 的整数");
    }
    if (!Number.isInteger(s.slowPeriod) || s.slowPeriod <= s.fastPeriod) {
      throw new Error("慢线周期必须为大于快线周期的整数");
    }
  } else if (s.type === "bollinger") {
    if (!Number.isInteger(s.period) || s.period < 2) {
      throw new Error("布林带周期必须为大于等于 2 的整数");
    }
    if (!Number.isFinite(s.stdDevMultiplier) || s.stdDevMultiplier <= 0) {
      throw new Error("布林带标准差倍数必须大于 0");
    }
    if (s.sellTarget !== "middle" && s.sellTarget !== "upper") {
      throw new Error("布林带卖出目标必须为 middle 或 upper");
    }
  } else if (s.type === "rsi") {
    if (!Number.isInteger(s.period) || s.period < 2) {
      throw new Error("RSI 周期必须为大于等于 2 的整数");
    }
    if (
      !Number.isFinite(s.oversold) ||
      !Number.isFinite(s.overbought) ||
      s.oversold <= 0 ||
      s.overbought >= 100 ||
      s.oversold >= s.overbought
    ) {
      throw new Error("RSI 阈值须满足 0 < 买入阈值 < 卖出阈值 < 100");
    }
  } else {
    throw new Error("不支持的回测策略类型");
  }

  const positionSizing: BacktestPositionSizing =
    params.positionSizing ?? { mode: "full" };
  if (positionSizing.mode === "fixed_ratio") {
    if (
      !Number.isFinite(positionSizing.ratioPct) ||
      positionSizing.ratioPct <= 0 ||
      positionSizing.ratioPct > 100
    ) {
      throw new Error("固定仓位比例必须在 (0, 100]% 之间（1 倍现货）");
    }
  }

  return {
    positionSizing,
    minFee,
    allowFractionalShares: Boolean(params.allowFractionalShares),
  };
}

/**
 * Pure, deterministic, strictly causal (no-lookahead) 1x spot backtest engine.
 *
 * Key guarantees:
 * 1. Signals evaluated after bar `i` close use ONLY bars[0..i] (never bar i+1 or beyond).
 * 2. Any signal generated at bar `i` executes strictly at bar `i+1`'s open price (with slippage & fee).
 * 3. Signals generated on the final bar have no next bar and are NOT executed.
 * 4. 1x spot only: buys only when flat (never exceeds cash, no leverage); sells only when holding (no shorting).
 * 5. Buy-and-Hold benchmark enters at bar 1 open with the exact same fee and slippage model.
 */
export function runBacktest(params: BacktestRunParams): BacktestResult {
  const { positionSizing, minFee, allowFractionalShares } =
    validateBacktestParams(params);
  const { bars, strategy, initialCash, feeRatePct, slippagePct } = params;

  const equityCurve: BacktestEquityPoint[] = [];
  const trades: BacktestTrade[] = [];

  if (bars.length === 0) {
    const emptySummary: BacktestSummary = {
      initialCash,
      finalEquity: initialCash,
      totalPnl: 0,
      totalReturnPct: 0,
      annualizedReturnPct: null,
      maxDrawdownAmount: 0,
      maxDrawdownPct: 0,
      benchmarkFinalEquity: initialCash,
      benchmarkReturnPct: 0,
      benchmarkMaxDrawdownPct: 0,
      benchmarkFees: 0,
      excessReturnPct: 0,
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      closedRoundTrips: 0,
      winningTrips: 0,
      losingTrips: 0,
      breakevenTrips: 0,
      winRatePct: null,
      avgWin: null,
      avgLoss: null,
      profitLossRatio: null,
      totalFees: 0,
      hasOpenPositionAtEnd: false,
      endingShares: 0,
      endingCash: initialCash,
      barCount: 0,
      startTimestamp: null,
      endTimestamp: null,
    };

    return {
      strategy,
      initialCash,
      feeRatePct,
      minFee,
      slippagePct,
      positionSizing,
      allowFractionalShares,
      leverage: 1,
      allowShort: false,
      equityCurve,
      trades,
      summary: emptySummary,
      unexecutedLastSignal: null,
    };
  }

  // Strategy portfolio state (1x spot only)
  let cash = initialCash;
  let shares = 0;
  let positionTotalCost = 0;
  let totalFees = 0;
  let pendingSignal: PendingSignal | null = null;
  let unexecutedLastSignal: BacktestUnexecutedSignal | null = null;

  // Buy-and-hold benchmark state (enters at bar 1 open with identical fee & slippage model)
  let benchCash = initialCash;
  let benchShares = 0;
  let benchFees = 0;

  // Running peak tracking for drawdown
  let stratPeak = initialCash;
  let maxDrawdownAmount = 0;
  let maxDrawdownPct = 0;
  let benchPeak = initialCash;
  let benchMaxDrawdownPct = 0;

  // Causal indicator state
  let prevFastMa: number | null = null;
  let prevSlowMa: number | null = null;
  const rsiCalc =
    strategy.type === "rsi" ? new CausalWilderRsi(strategy.period) : null;

  let tradeSeq = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // === Phase 1: Execute pending signal from bar (i - 1) strictly at bar i OPEN ===
    if (pendingSignal !== null) {
      if (pendingSignal.side === "buy" && shares === 0) {
        const execPrice = computeBacktestExecutionPrice(
          "buy",
          bar.open,
          slippagePct
        );
        const budget =
          positionSizing.mode === "full"
            ? cash
            : Math.min(cash, roundMoney((cash * positionSizing.ratioPct) / 100));

        const qty = computeMaxAffordableQty(
          budget,
          execPrice,
          feeRatePct,
          minFee,
          allowFractionalShares
        );

        if (qty > 0) {
          const notional = roundMoney(qty * execPrice);
          const fee = computeBacktestFee(notional, feeRatePct, minFee);
          const totalCost = roundMoney(notional + fee);

          if (totalCost <= cash + EPSILON) {
            cash = roundMoney(Math.max(0, cash - totalCost));
            shares = qty;
            positionTotalCost = totalCost;
            totalFees = roundMoney(totalFees + fee);
            tradeSeq += 1;

            trades.push({
              id: `bt-${tradeSeq}`,
              side: "buy",
              signalBarIndex: pendingSignal.signalBarIndex,
              signalTimestamp: pendingSignal.signalTimestamp,
              barIndex: i,
              timestamp: bar.timestamp,
              openPrice: bar.open,
              price: execPrice,
              quantity: qty,
              notional,
              fee,
              realizedPnl: null,
              returnPct: null,
              cashAfter: cash,
              reason: pendingSignal.reason,
            });
          }
        }
      } else if (pendingSignal.side === "sell" && shares > 0) {
        // Strictly only sell when holding shares (never short!)
        const execPrice = computeBacktestExecutionPrice(
          "sell",
          bar.open,
          slippagePct
        );
        const qty = shares;
        const notional = roundMoney(qty * execPrice);
        const fee = computeBacktestFee(notional, feeRatePct, minFee);
        const proceeds = roundMoney(notional - fee);
        const realizedPnl = roundMoney(proceeds - positionTotalCost);
        const returnPct =
          positionTotalCost > 0 ? (realizedPnl / positionTotalCost) * 100 : 0;

        cash = roundMoney(Math.max(0, cash + proceeds));
        shares = 0;
        positionTotalCost = 0;
        totalFees = roundMoney(totalFees + fee);
        tradeSeq += 1;

        trades.push({
          id: `bt-${tradeSeq}`,
          side: "sell",
          signalBarIndex: pendingSignal.signalBarIndex,
          signalTimestamp: pendingSignal.signalTimestamp,
          barIndex: i,
          timestamp: bar.timestamp,
          openPrice: bar.open,
          price: execPrice,
          quantity: qty,
          notional,
          fee,
          realizedPnl,
          returnPct,
          cashAfter: cash,
          reason: pendingSignal.reason,
        });
      }
      // Always consume pendingSignal (sell while flat or buy while holding is ignored in 1x spot)
      pendingSignal = null;
    }

    // === Phase 1b: Benchmark Buy-and-Hold enters at bar 1 OPEN ===
    if (i === 1) {
      const benchExecPrice = computeBacktestExecutionPrice(
        "buy",
        bar.open,
        slippagePct
      );
      const qty = computeMaxAffordableQty(
        benchCash,
        benchExecPrice,
        feeRatePct,
        minFee,
        allowFractionalShares
      );
      if (qty > 0) {
        const notional = roundMoney(qty * benchExecPrice);
        const fee = computeBacktestFee(notional, feeRatePct, minFee);
        const totalCost = roundMoney(notional + fee);
        if (totalCost <= benchCash + EPSILON) {
          benchCash = roundMoney(Math.max(0, benchCash - totalCost));
          benchShares = qty;
          benchFees = roundMoney(benchFees + fee);
        }
      }
    }

    // === Phase 2: Mark-to-Market Valuation at Bar i CLOSE ===
    const positionValue = roundMoney(shares * bar.close);
    const equity = roundMoney(cash + positionValue);
    if (equity > stratPeak) stratPeak = equity;
    const ddAmt = Math.max(0, stratPeak - equity);
    const ddPct = stratPeak > 0 ? (ddAmt / stratPeak) * 100 : 0;
    if (ddAmt > maxDrawdownAmount) maxDrawdownAmount = ddAmt;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    const benchmarkEquity = roundMoney(benchCash + benchShares * bar.close);
    if (benchmarkEquity > benchPeak) benchPeak = benchmarkEquity;
    const benchDdPct =
      benchPeak > 0
        ? (Math.max(0, benchPeak - benchmarkEquity) / benchPeak) * 100
        : 0;
    if (benchDdPct > benchMaxDrawdownPct) benchMaxDrawdownPct = benchDdPct;

    equityCurve.push({
      barIndex: i,
      timestamp: bar.timestamp,
      close: bar.close,
      equity,
      cash,
      positionValue,
      shares,
      drawdownPct: ddPct,
      benchmarkEquity,
      benchmarkDrawdownPct: benchDdPct,
    });

    // === Phase 3: Compute Strategy Signal at Bar i CLOSE (strictly using bars[0..i]) ===
    let nextSide: "buy" | "sell" | null = null;
    let nextReason = "";

    if (strategy.type === "ma_cross") {
      const fastMa = computeCausalSmaAt(bars, i, strategy.fastPeriod);
      const slowMa = computeCausalSmaAt(bars, i, strategy.slowPeriod);

      if (
        fastMa !== null &&
        slowMa !== null &&
        prevFastMa !== null &&
        prevSlowMa !== null
      ) {
        if (prevFastMa <= prevSlowMa && fastMa > slowMa) {
          nextSide = "buy";
          nextReason = `MA${strategy.fastPeriod}(${fastMa.toFixed(2)}) 上穿 MA${strategy.slowPeriod}(${slowMa.toFixed(2)}) 金叉`;
        } else if (prevFastMa >= prevSlowMa && fastMa < slowMa) {
          nextSide = "sell";
          nextReason = `MA${strategy.fastPeriod}(${fastMa.toFixed(2)}) 下穿 MA${strategy.slowPeriod}(${slowMa.toFixed(2)}) 死叉`;
        }
      }
      prevFastMa = fastMa;
      prevSlowMa = slowMa;
    } else if (strategy.type === "bollinger") {
      const boll = computeCausalBollingerAt(
        bars,
        i,
        strategy.period,
        strategy.stdDevMultiplier
      );
      if (boll !== null) {
        if (bar.close < boll.lower) {
          nextSide = "buy";
          nextReason = `收盘(${bar.close.toFixed(2)}) 跌破布林下轨(${boll.lower.toFixed(2)})`;
        } else if (
          strategy.sellTarget === "middle" &&
          bar.close > boll.middle
        ) {
          nextSide = "sell";
          nextReason = `收盘(${bar.close.toFixed(2)}) 升破布林中轨(${boll.middle.toFixed(2)})`;
        } else if (strategy.sellTarget === "upper" && bar.close > boll.upper) {
          nextSide = "sell";
          nextReason = `收盘(${bar.close.toFixed(2)}) 升破布林上轨(${boll.upper.toFixed(2)})`;
        }
      }
    } else if (strategy.type === "rsi" && rsiCalc) {
      const rsiVal = rsiCalc.push(bar.close);
      if (rsiVal !== null) {
        if (rsiVal < strategy.oversold) {
          nextSide = "buy";
          nextReason = `RSI(${strategy.period})=${rsiVal.toFixed(1)} 低于超卖线 ${strategy.oversold}`;
        } else if (rsiVal > strategy.overbought) {
          nextSide = "sell";
          nextReason = `RSI(${strategy.period})=${rsiVal.toFixed(1)} 高于超买线 ${strategy.overbought}`;
        }
      }
    }

    // Only queue actionable signal for next bar open (bar i+1).
    // Final bar signal cannot execute because there is no bar i+1.
    if (nextSide !== null) {
      const isActionable =
        (nextSide === "buy" && shares === 0) ||
        (nextSide === "sell" && shares > 0);
      if (i < bars.length - 1) {
        if (isActionable) {
          pendingSignal = {
            side: nextSide,
            signalBarIndex: i,
            signalTimestamp: bar.timestamp,
            reason: nextReason,
          };
        }
      } else if (isActionable) {
        unexecutedLastSignal = {
          side: nextSide,
          barIndex: i,
          timestamp: bar.timestamp,
          reason: nextReason,
        };
      }
    }
  }

  // === Phase 4: Summary Metrics ===
  const lastPoint = equityCurve[equityCurve.length - 1];
  const finalEquity = lastPoint.equity;
  const totalPnl = roundMoney(finalEquity - initialCash);
  const totalReturnPct = (totalPnl / initialCash) * 100;

  const benchmarkFinalEquity = lastPoint.benchmarkEquity;
  const benchmarkReturnPct =
    ((benchmarkFinalEquity - initialCash) / initialCash) * 100;
  const excessReturnPct = totalReturnPct - benchmarkReturnPct;

  const startTimestamp = bars[0].timestamp;
  const endTimestamp = bars[bars.length - 1].timestamp;
  const spanDays = (endTimestamp - startTimestamp) / 86_400_000;
  let annualizedReturnPct: number | null = null;
  if (spanDays >= 7 && finalEquity > 0 && initialCash > 0) {
    const years = spanDays / 365.25;
    annualizedReturnPct =
      (Math.pow(finalEquity / initialCash, 1 / years) - 1) * 100;
  }

  let buyTrades = 0;
  let sellTrades = 0;
  const sellPnls: number[] = [];
  for (const t of trades) {
    if (t.side === "buy") {
      buyTrades += 1;
    } else {
      sellTrades += 1;
      if (t.realizedPnl !== null) {
        sellPnls.push(t.realizedPnl);
      }
    }
  }

  const winningPnls = sellPnls.filter((p) => p > EPSILON);
  const losingPnls = sellPnls.filter((p) => p < -EPSILON);
  const breakevenTrips = sellPnls.length - winningPnls.length - losingPnls.length;

  const winRatePct =
    sellPnls.length > 0 ? (winningPnls.length / sellPnls.length) * 100 : null;
  const avgWin =
    winningPnls.length > 0
      ? roundMoney(
          winningPnls.reduce((s, v) => s + v, 0) / winningPnls.length
        )
      : null;
  const avgLoss =
    losingPnls.length > 0
      ? roundMoney(
          Math.abs(losingPnls.reduce((s, v) => s + v, 0)) / losingPnls.length
        )
      : null;

  let profitLossRatio: number | null = null;
  if (sellPnls.length > 0) {
    if (avgWin !== null && avgLoss !== null && avgLoss > EPSILON) {
      profitLossRatio = avgWin / avgLoss;
    } else if (avgWin !== null && (avgLoss === null || avgLoss <= EPSILON)) {
      profitLossRatio = Number.POSITIVE_INFINITY;
    } else if (avgWin === null && avgLoss !== null) {
      profitLossRatio = 0;
    }
  }

  const summary: BacktestSummary = {
    initialCash,
    finalEquity,
    totalPnl,
    totalReturnPct,
    annualizedReturnPct,
    maxDrawdownAmount: roundMoney(maxDrawdownAmount),
    maxDrawdownPct,
    benchmarkFinalEquity,
    benchmarkReturnPct,
    benchmarkMaxDrawdownPct: benchMaxDrawdownPct,
    benchmarkFees: benchFees,
    excessReturnPct,
    totalTrades: trades.length,
    buyTrades,
    sellTrades,
    closedRoundTrips: sellPnls.length,
    winningTrips: winningPnls.length,
    losingTrips: losingPnls.length,
    breakevenTrips,
    winRatePct,
    avgWin,
    avgLoss,
    profitLossRatio,
    totalFees,
    hasOpenPositionAtEnd: shares > 0,
    endingShares: shares,
    endingCash: cash,
    barCount: bars.length,
    startTimestamp,
    endTimestamp,
  };

  return {
    strategy,
    initialCash,
    feeRatePct,
    minFee,
    slippagePct,
    positionSizing,
    allowFractionalShares,
    leverage: 1,
    allowShort: false,
    equityCurve,
    trades,
    summary,
    unexecutedLastSignal,
  };
}

export function formatStrategyLabel(strategy: BacktestStrategyConfig): string {
  switch (strategy.type) {
    case "ma_cross":
      return `双均线 MA(${strategy.fastPeriod}/${strategy.slowPeriod})`;
    case "bollinger":
      return `布林带 BOLL(${strategy.period}, ${strategy.stdDevMultiplier}σ · ${
        strategy.sellTarget === "middle" ? "中轨卖" : "上轨卖"
      })`;
    case "rsi":
      return `RSI(${strategy.period}) <${strategy.oversold}买 / >${strategy.overbought}卖`;
  }
}
