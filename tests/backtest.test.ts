import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  computeBacktestExecutionPrice,
  computeBacktestFee,
  runBacktest,
} from "../apps/web/src/lib/backtest/engine.ts";
import type {
  BacktestStrategyConfig,
  NormalizedBar,
} from "../packages/shared-types/src/index.ts";

const DAY_MS = 86_400_000;
const BASE_TS = Date.UTC(2025, 0, 1);

function makeBarsFromCloses(
  closes: number[],
  opens?: number[]
): NormalizedBar[] {
  return closes.map((close, idx) => {
    const open = opens ? opens[idx] : idx === 0 ? close : closes[idx - 1];
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    return {
      timestamp: BASE_TS + idx * DAY_MS,
      open,
      high,
      low,
      close,
      volume: 1_000_000,
    };
  });
}

function loadSampleBars(filename: string): NormalizedBar[] {
  const fullPath = path.resolve(
    process.cwd(),
    "packages/market-adapters/data/samples",
    filename
  );
  const raw = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
    bars: NormalizedBar[];
  };
  return raw.bars;
}

describe("Backtest Engine — Strict No-Lookahead (无未来函数)", () => {
  it("MA Cross: mutating bars strictly after signal+1 never changes prior signals or fill at bar i+1 open", () => {
    // Construct clear downtrend -> golden cross -> uptrend -> death cross
    const closes = [
      110, 108, 106, 104, 102, 100, 98, 96, 94, 92, // slow falling
      95, 100, 106, 112, 118, 124, 128, 130, // golden cross occurs here
      125, 118, 110, 102, 95, 90, // death cross occurs here
    ];
    const opens = closes.map((c, idx) =>
      idx === 0 ? c : Number((c * 0.995).toFixed(4))
    );
    const baseBars = makeBarsFromCloses(closes, opens);

    const strategy: BacktestStrategyConfig = {
      type: "ma_cross",
      fastPeriod: 3,
      slowPeriod: 6,
    };

    const baseRes = runBacktest({
      bars: baseBars,
      strategy,
      initialCash: 100_000,
      feeRatePct: 0.1,
      minFee: 5,
      slippagePct: 0.05,
    });

    assert.ok(baseRes.trades.length >= 2, "Expected at least one buy and one sell trade");

    // Verify every single trade executed strictly on signalBarIndex + 1 at that bar's OPEN (with slippage)
    for (const trade of baseRes.trades) {
      assert.equal(
        trade.barIndex,
        trade.signalBarIndex + 1,
        "Execution bar must be strictly signalBarIndex + 1"
      );
      assert.equal(trade.timestamp, baseBars[trade.barIndex].timestamp);
      assert.equal(trade.openPrice, baseBars[trade.barIndex].open);
      const expectedExec = computeBacktestExecutionPrice(
        trade.side,
        baseBars[trade.barIndex].open,
        0.05
      );
      assert.equal(trade.price, expectedExec);
    }

    const firstBuy = baseRes.trades[0];
    assert.equal(firstBuy.side, "buy");
    const execIdx = firstBuy.barIndex; // signalBarIndex + 1

    // Mutate bar execIdx's close/high/low (keeping open unchanged) AND radically mutate all bars > execIdx
    const mutatedBars: NormalizedBar[] = baseBars.map((b, idx) => {
      if (idx === execIdx) {
        return {
          ...b,
          high: b.open * 3,
          low: b.open * 0.2,
          close: b.open * 2.5,
        };
      }
      if (idx > execIdx) {
        return {
          ...b,
          open: 1000 + idx * 50,
          high: 1200 + idx * 50,
          low: 900 + idx * 50,
          close: 1100 + idx * 50,
        };
      }
      return { ...b };
    });

    const mutatedRes = runBacktest({
      bars: mutatedBars,
      strategy,
      initialCash: 100_000,
      feeRatePct: 0.1,
      minFee: 5,
      slippagePct: 0.05,
    });

    assert.ok(mutatedRes.trades.length >= 1);
    const mutatedFirstBuy = mutatedRes.trades[0];
    assert.deepEqual(
      mutatedFirstBuy,
      firstBuy,
      "Mutating future bars (or exec bar close) must NOT alter signal or execution at bar i+1 open"
    );

    // Also verify prefix equity curve up to bar signalBarIndex is identical
    for (let k = 0; k <= firstBuy.signalBarIndex; k++) {
      assert.equal(mutatedRes.equityCurve[k].equity, baseRes.equityCurve[k].equity);
      assert.equal(mutatedRes.equityCurve[k].cash, baseRes.equityCurve[k].cash);
      assert.equal(mutatedRes.equityCurve[k].shares, baseRes.equityCurve[k].shares);
    }
  });

  it("Bollinger & RSI: mutating future bars never changes prior trades or prefix equity", () => {
    const aaplBars = loadSampleBars("US_AAPL_1D.json");
    const strategies: BacktestStrategyConfig[] = [
      { type: "bollinger", period: 20, stdDevMultiplier: 2, sellTarget: "middle" },
      { type: "rsi", period: 14, oversold: 30, overbought: 70 },
    ];

    for (const strategy of strategies) {
      const fullRes = runBacktest({
        bars: aaplBars,
        strategy,
        initialCash: 100_000,
        feeRatePct: 0.1,
        minFee: 0,
        slippagePct: 0.05,
      });

      assert.ok(fullRes.trades.length > 0, `Expected trades for ${strategy.type}`);

      // Pick a cutoff index right after the first trade's execution bar
      const cutoff = Math.min(fullRes.trades[0].barIndex, aaplBars.length - 2);
      const tamperedBars = aaplBars.map((b, idx) =>
        idx > cutoff
          ? {
              ...b,
              open: 9999,
              high: 10500,
              low: 9500,
              close: 10000,
            }
          : { ...b }
      );

      const tamperedRes = runBacktest({
        bars: tamperedBars,
        strategy,
        initialCash: 100_000,
        feeRatePct: 0.1,
        minFee: 0,
        slippagePct: 0.05,
      });

      const tradesUpToCutoffFull = fullRes.trades.filter((t) => t.barIndex <= cutoff);
      const tradesUpToCutoffTampered = tamperedRes.trades.filter(
        (t) => t.barIndex <= cutoff
      );
      assert.deepEqual(
        tradesUpToCutoffTampered,
        tradesUpToCutoffFull,
        `${strategy.type}: trades up to cutoff must not depend on future bars`
      );

      for (let k = 0; k <= cutoff; k++) {
        assert.equal(tamperedRes.equityCurve[k].equity, fullRes.equityCurve[k].equity);
      }
    }
  });

  it("Signal generated on the final bar is NOT executed because there is no next bar", () => {
    // Fast MA(2) crosses above Slow MA(4) strictly on the very last bar (index 5)
    // Closes: [100, 100, 90, 90, 90, 120]
    // idx 4: MA2 = 90, MA4 = 92.5 (fast < slow)
    // idx 5 (last bar): MA2 = 105, MA4 = 97.5 (golden cross!)
    const bars = makeBarsFromCloses([100, 100, 90, 90, 90, 120]);
    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 10_000,
      feeRatePct: 0.1,
      minFee: 0,
      slippagePct: 0,
    });

    assert.equal(res.trades.length, 0, "Final-bar signal must not fill on the same bar");
    assert.ok(res.unexecutedLastSignal !== null);
    assert.equal(res.unexecutedLastSignal.side, "buy");
    assert.equal(res.unexecutedLastSignal.barIndex, bars.length - 1);
    assert.equal(res.summary.endingCash, 10_000);
    assert.equal(res.summary.endingShares, 0);
  });
});

describe("Backtest Engine — Fee, Minimum Fee & Cash Accounting (手续费与现金精确计算)", () => {
  it("Percentage fee dominates: exact buy/sell fees, realized PnL, and ending cash", () => {
    // Construct deterministic golden cross on bar 4 -> buy at bar 5 open = 100
    // Then death cross on bar 7 -> sell at bar 8 open = 120
    // Verify MA(2) vs MA(4):
    // idx 0..3: [100, 100, 90, 90] -> idx 3: MA2=90, MA4=95 (fast < slow)
    // idx 4: close=120 -> MA2=105, MA4=100 (fast > slow => BUY signal at idx 4, fill at idx 5 open=100)
    // idx 5: open=100, close=120 -> MA2=120, MA4=105
    // idx 6: open=120, close=120 -> MA2=120, MA4=112.5
    // idx 7: open=120, close=80  -> MA2=100, MA4=110 (fast < slow => SELL signal at idx 7, fill at idx 8 open=120)
    // idx 8: open=120, close=120
    const closes = [100, 100, 90, 90, 120, 120, 120, 80, 120];
    const opens = [100, 100, 90, 90, 100, 100, 120, 120, 120];
    const bars = makeBarsFromCloses(closes, opens);

    // initialCash = 10,020, feeRatePct = 0.2%, minFee = 5, slippage = 0%
    // Buy at open=100: max qty = 100 shares -> notional = 10,000, fee = 10,000 * 0.002 = 20 (> minFee 5)
    // Total buy cost = 10,020 -> cashAfter buy = 0 exactly!
    // Sell 100 shares at open=120: notional = 12,000, fee = 12,000 * 0.002 = 24 (> minFee 5)
    // Proceeds = 11,976 -> endingCash = 11,976, realizedPnl = 11,976 - 10,020 = 1,956, totalFees = 44
    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 10_020,
      feeRatePct: 0.2,
      minFee: 5,
      slippagePct: 0,
    });

    assert.equal(res.trades.length, 2);

    const [buy, sell] = res.trades;
    assert.equal(buy.side, "buy");
    assert.equal(buy.signalBarIndex, 4);
    assert.equal(buy.barIndex, 5);
    assert.equal(buy.price, 100);
    assert.equal(buy.quantity, 100);
    assert.equal(buy.notional, 10_000);
    assert.equal(buy.fee, 20);
    assert.equal(buy.cashAfter, 0);

    assert.equal(sell.side, "sell");
    assert.equal(sell.signalBarIndex, 7);
    assert.equal(sell.barIndex, 8);
    assert.equal(sell.price, 120);
    assert.equal(sell.quantity, 100);
    assert.equal(sell.notional, 12_000);
    assert.equal(sell.fee, 24);
    assert.equal(sell.realizedPnl, 1_956);
    assert.equal(sell.cashAfter, 11_976);

    assert.equal(res.summary.totalFees, 44);
    assert.equal(res.summary.endingCash, 11_976);
    assert.equal(res.summary.finalEquity, 11_976);
    assert.equal(res.summary.totalPnl, 1_956);
  });

  it("Minimum fee dominates: exact minFee deduction and ending cash", () => {
    const closes = [100, 100, 90, 90, 120, 120, 120, 80, 120];
    const opens = [100, 100, 90, 90, 100, 100, 120, 120, 120];
    const bars = makeBarsFromCloses(closes, opens);

    // initialCash = 1,015, feeRatePct = 0.05%, minFee = 15, slippage = 0%
    // Buy at open=100: 10 shares -> notional=1,000, pctFee=0.5 < minFee=15 => fee=15, totalCost=1,015, cashAfter=0
    // Sell 10 shares at open=120: notional=1,200, pctFee=0.6 < minFee=15 => fee=15, proceeds=1,185
    // realizedPnl = 1,185 - 1,015 = 170, totalFees = 30, endingCash = 1,185
    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 1_015,
      feeRatePct: 0.05,
      minFee: 15,
      slippagePct: 0,
    });

    assert.equal(res.trades.length, 2);
    assert.equal(res.trades[0].quantity, 10);
    assert.equal(res.trades[0].fee, 15);
    assert.equal(res.trades[0].cashAfter, 0);

    assert.equal(res.trades[1].quantity, 10);
    assert.equal(res.trades[1].fee, 15);
    assert.equal(res.trades[1].realizedPnl, 170);
    assert.equal(res.trades[1].cashAfter, 1_185);
    assert.equal(res.summary.totalFees, 30);
    assert.equal(res.summary.endingCash, 1_185);
  });

  it("computeBacktestFee handles zero rate, zero minFee, and floor threshold cleanly", () => {
    assert.equal(computeBacktestFee(10_000, 0, 0), 0);
    assert.equal(computeBacktestFee(10_000, 0.1, 0), 10);
    assert.equal(computeBacktestFee(1_000, 0.1, 5), 5);
    assert.equal(computeBacktestFee(10_000, 0.1, 5), 10);
  });
});

describe("Backtest Engine — Slippage Direction, No Shorting & No Leverage (滑点方向与1倍现货约束)", () => {
  it("Slippage increases buy price and decreases sell price", () => {
    const closes = [100, 100, 90, 90, 120, 120, 120, 80, 120];
    const opens = [100, 100, 90, 90, 100, 100, 120, 120, 120];
    const bars = makeBarsFromCloses(closes, opens);

    // 1% slippage: buy at 100 * 1.01 = 101; sell at 120 * 0.99 = 118.8
    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 10_100,
      feeRatePct: 0,
      minFee: 0,
      slippagePct: 1,
    });

    assert.equal(res.trades.length, 2);
    assert.equal(res.trades[0].side, "buy");
    assert.equal(res.trades[0].openPrice, 100);
    assert.equal(res.trades[0].price, 101);
    assert.equal(res.trades[0].quantity, 100);
    assert.equal(res.trades[0].cashAfter, 0);

    assert.equal(res.trades[1].side, "sell");
    assert.equal(res.trades[1].openPrice, 120);
    assert.equal(res.trades[1].price, 118.8);
    assert.equal(res.trades[1].quantity, 100);
    assert.equal(res.trades[1].cashAfter, 11_880);
    assert.equal(res.trades[1].realizedPnl, 1_780);
  });

  it("No shorting: sell signals while flat are strictly ignored", () => {
    // Sequence starts high and drops sharply -> death cross fires while flat (no prior buy!)
    // idx 3: MA2=110, MA4=105 (fast > slow)
    // idx 4: close=70 -> MA2=90, MA4=97.5 (death cross!)
    // idx 5..7: stays low (no golden cross)
    const bars = makeBarsFromCloses([100, 100, 110, 110, 70, 65, 60, 55]);
    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 50_000,
      feeRatePct: 0.1,
      minFee: 0,
      slippagePct: 0.05,
    });

    assert.equal(res.trades.length, 0, "Sell signal when flat must be ignored (no shorting)");
    assert.equal(res.summary.endingShares, 0);
    assert.equal(res.summary.endingCash, 50_000);
    assert.equal(res.summary.finalEquity, 50_000);
    for (const pt of res.equityCurve) {
      assert.ok(pt.shares >= 0, "Shares must never be negative");
      assert.ok(pt.cash >= 0, "Cash must never be negative");
    }
  });

  it("Rejects any leverage != 1 or allowShort != false", () => {
    const bars = makeBarsFromCloses([100, 101, 102, 103, 104]);
    assert.throws(() => {
      runBacktest({
        bars,
        strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 3 },
        initialCash: 10_000,
        feeRatePct: 0.1,
        slippagePct: 0.05,
        leverage: 2 as unknown as 1,
      });
    }, /1 倍现货/);

    assert.throws(() => {
      runBacktest({
        bars,
        strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 3 },
        initialCash: 10_000,
        feeRatePct: 0.1,
        slippagePct: 0.05,
        allowShort: true as unknown as false,
      });
    }, /严禁卖空/);
  });

  it("Fixed ratio position sizing stays strictly within ratioPct of cash and never uses leverage", () => {
    const closes = [100, 100, 90, 90, 120, 120, 120];
    const opens = [100, 100, 90, 90, 100, 100, 120];
    const bars = makeBarsFromCloses(closes, opens);

    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 2, slowPeriod: 4 },
      initialCash: 10_000,
      feeRatePct: 0,
      minFee: 0,
      slippagePct: 0,
      positionSizing: { mode: "fixed_ratio", ratioPct: 40 },
    });

    assert.equal(res.trades.length, 1);
    assert.equal(res.trades[0].quantity, 40);
    assert.equal(res.trades[0].notional, 4_000);
    assert.equal(res.trades[0].cashAfter, 6_000);
  });
});

describe("Backtest Engine — Offline Sample Verification (US:AAPL 1D)", () => {
  it("Runs MA(5/20) on bundled US:AAPL 1D sample cleanly without network", () => {
    const bars = loadSampleBars("US_AAPL_1D.json");
    assert.ok(bars.length > 100);

    const res = runBacktest({
      bars,
      strategy: { type: "ma_cross", fastPeriod: 5, slowPeriod: 20 },
      initialCash: 100_000,
      feeRatePct: 0.1,
      minFee: 0,
      slippagePct: 0.05,
    });

    assert.equal(res.equityCurve.length, bars.length);
    assert.ok(res.trades.length >= 2, "AAPL sample should produce trades for MA(5/20)");
    assert.equal(res.leverage, 1);
    assert.equal(res.allowShort, false);
    assert.equal(res.equityCurve[0].equity, 100_000);
    assert.equal(res.equityCurve[0].benchmarkEquity, 100_000);

    // Every trade respects next-bar-open and non-negative cash
    for (const t of res.trades) {
      assert.equal(t.barIndex, t.signalBarIndex + 1);
      assert.ok(t.cashAfter >= 0);
      assert.ok(t.quantity > 0);
      assert.ok(t.fee >= 0);
    }

    assert.ok(Number.isFinite(res.summary.finalEquity));
    assert.ok(Number.isFinite(res.summary.totalReturnPct));
    assert.ok(Number.isFinite(res.summary.benchmarkReturnPct));
    assert.ok(Number.isFinite(res.summary.maxDrawdownPct));
  });
});
