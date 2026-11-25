"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  BacktestBollingerSellTarget,
  BacktestResult,
  BacktestStrategyConfig,
  BacktestStrategyType,
  BacktestTrade,
  DataProvenance,
  Interval,
  NormalizedBar,
  SymbolMeta,
} from "@trade-buddy/shared-types";
import { IconBacktest, IconDownload } from "@trade-buddy/ui-tokens";

import { formatStrategyLabel, runBacktest } from "@/lib/backtest";
import { formatBarTimestamp } from "@/lib/chart-sync";
import { triggerCsvDownload } from "@/lib/paper-stats";
import { BacktestEquityChart } from "./BacktestEquityChart";

export interface BacktestPublishedOverlay {
  symbolId: string;
  interval: Interval;
  strategyLabel: string;
  trades: BacktestTrade[];
}

interface BacktestPanelProps {
  symbol: SymbolMeta;
  interval: Interval;
  provenance: DataProvenance;
  fullBars: NormalizedBar[];
  visibleBars: NormalizedBar[];
  isReplayActive: boolean;
  showChartMarkers: boolean;
  onToggleChartMarkers: () => void;
  onPublishOverlay: (overlay: BacktestPublishedOverlay | null) => void;
  onNotify?: (msg: string) => void;
}

type ResultSubTab = "overview" | "trades" | "rules";

function fmtMoney(val: number): string {
  if (!Number.isFinite(val)) return "—";
  return val.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSignedPct(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "—";
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function fmtDateRangeFromBars(
  bars: NormalizedBar[],
  interval: Interval
): string {
  if (bars.length === 0) return "无数据";
  const start = formatBarTimestamp(bars[0].timestamp, interval);
  const end = formatBarTimestamp(bars[bars.length - 1].timestamp, interval);
  return `${start} ~ ${end}`;
}

function buildBacktestTradesCsv(
  trades: BacktestTrade[],
  symbol: SymbolMeta,
  interval: Interval
): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = [
    "序号",
    "品种",
    "周期",
    "方向",
    "信号K线时间",
    "成交K线时间(下一根开盘)",
    "开盘价",
    "成交价(含滑点)",
    "数量",
    "成交额",
    "手续费",
    "净盈亏",
    "回合收益率(%)",
    "成交后现金",
    "触发原因",
  ];
  const rows = trades.map((t, i) => [
    i + 1,
    symbol.ticker,
    interval,
    t.side === "buy" ? "买入" : "卖出",
    formatBarTimestamp(t.signalTimestamp, interval),
    formatBarTimestamp(t.timestamp, interval),
    t.openPrice.toFixed(symbol.pricePrecision),
    t.price.toFixed(symbol.pricePrecision),
    t.quantity,
    t.notional.toFixed(2),
    t.fee.toFixed(2),
    t.realizedPnl === null ? "" : t.realizedPnl.toFixed(2),
    t.returnPct === null ? "" : t.returnPct.toFixed(2),
    t.cashAfter.toFixed(2),
    t.reason,
  ]);
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function BacktestPanel({
  symbol,
  interval,
  provenance,
  fullBars,
  visibleBars,
  isReplayActive,
  showChartMarkers,
  onToggleChartMarkers,
  onPublishOverlay,
  onNotify,
}: BacktestPanelProps) {
  // Strategy configuration state
  const [strategyType, setStrategyType] =
    useState<BacktestStrategyType>("ma_cross");
  // MA Cross params
  const [maFast, setMaFast] = useState("5");
  const [maSlow, setMaSlow] = useState("20");
  // Bollinger params
  const [bollPeriod, setBollPeriod] = useState("20");
  const [bollStd, setBollStd] = useState("2");
  const [bollSellTarget, setBollSellTarget] =
    useState<BacktestBollingerSellTarget>("middle");
  // RSI params
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiOversold, setRsiOversold] = useState("30");
  const [rsiOverbought, setRsiOverbought] = useState("70");

  // Capital, sizing & friction params
  const [initialCashInput, setInitialCashInput] = useState("100000");
  const [sizingMode, setSizingMode] = useState<"full" | "fixed_ratio">("full");
  const [sizingRatioInput, setSizingRatioInput] = useState("50");
  const [feeRateInput, setFeeRateInput] = useState("0.1");
  const [minFeeInput, setMinFeeInput] = useState("0");
  const [slippageInput, setSlippageInput] = useState("0.05");

  // Replay scope option: default use replay prefix when replay is active
  const [useReplayPrefix, setUseReplayPrefix] = useState(true);
  const [subTab, setSubTab] = useState<ResultSubTab>("overview");
  const [runVersion, setRunVersion] = useState(0);

  const effectiveBars =
    isReplayActive && useReplayPrefix ? visibleBars : fullBars;

  const parsedExecution = useMemo<{
    result: BacktestResult | null;
    error: string | null;
    strategyLabel: string;
  }>(() => {
    // Re-evaluate whenever inputs or runVersion change
    void runVersion;
    if (effectiveBars.length < 3) {
      return {
        result: null,
        error: "当前品种已加载 K 线不足 3 根，无法运行回测",
        strategyLabel: "",
      };
    }

    let strategy: BacktestStrategyConfig;
    if (strategyType === "ma_cross") {
      const fastPeriod = Number.parseInt(maFast, 10);
      const slowPeriod = Number.parseInt(maSlow, 10);
      if (
        !Number.isInteger(fastPeriod) ||
        !Number.isInteger(slowPeriod) ||
        fastPeriod < 2 ||
        slowPeriod <= fastPeriod
      ) {
        return {
          result: null,
          error: "双均线参数无效：快线周期须 ≥ 2 且慢线周期 > 快线周期",
          strategyLabel: "",
        };
      }
      strategy = { type: "ma_cross", fastPeriod, slowPeriod };
    } else if (strategyType === "bollinger") {
      const period = Number.parseInt(bollPeriod, 10);
      const stdDevMultiplier = Number.parseFloat(bollStd);
      if (
        !Number.isInteger(period) ||
        period < 2 ||
        !Number.isFinite(stdDevMultiplier) ||
        stdDevMultiplier <= 0
      ) {
        return {
          result: null,
          error: "布林带参数无效：周期须 ≥ 2 且标准差倍数 > 0",
          strategyLabel: "",
        };
      }
      strategy = {
        type: "bollinger",
        period,
        stdDevMultiplier,
        sellTarget: bollSellTarget,
      };
    } else {
      const period = Number.parseInt(rsiPeriod, 10);
      const oversold = Number.parseFloat(rsiOversold);
      const overbought = Number.parseFloat(rsiOverbought);
      if (
        !Number.isInteger(period) ||
        period < 2 ||
        !Number.isFinite(oversold) ||
        !Number.isFinite(overbought) ||
        oversold <= 0 ||
        overbought >= 100 ||
        oversold >= overbought
      ) {
        return {
          result: null,
          error: "RSI 参数无效：须满足周期 ≥ 2 且 0 < 买入阈值 < 卖出阈值 < 100",
          strategyLabel: "",
        };
      }
      strategy = { type: "rsi", period, oversold, overbought };
    }

    const initialCash = Number.parseFloat(initialCashInput);
    const feeRatePct = Number.parseFloat(feeRateInput);
    const minFee = Number.parseFloat(minFeeInput || "0");
    const slippagePct = Number.parseFloat(slippageInput);
    const ratioPct = Number.parseFloat(sizingRatioInput);

    if (!Number.isFinite(initialCash) || initialCash <= 0) {
      return { result: null, error: "初始资金须大于 0", strategyLabel: "" };
    }
    if (!Number.isFinite(feeRatePct) || feeRatePct < 0 || feeRatePct > 10) {
      return {
        result: null,
        error: "手续费率须在 0% ~ 10% 之间",
        strategyLabel: "",
      };
    }
    if (!Number.isFinite(minFee) || minFee < 0) {
      return { result: null, error: "最低手续费不能为负数", strategyLabel: "" };
    }
    if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct > 10) {
      return {
        result: null,
        error: "滑点须在 0% ~ 10% 之间",
        strategyLabel: "",
      };
    }
    if (
      sizingMode === "fixed_ratio" &&
      (!Number.isFinite(ratioPct) || ratioPct <= 0 || ratioPct > 100)
    ) {
      return {
        result: null,
        error: "固定仓位比例须在 (0, 100]% 之间（1 倍现货）",
        strategyLabel: "",
      };
    }

    try {
      const res = runBacktest({
        bars: effectiveBars,
        strategy,
        initialCash,
        feeRatePct,
        minFee,
        slippagePct,
        positionSizing:
          sizingMode === "full"
            ? { mode: "full" }
            : { mode: "fixed_ratio", ratioPct },
        leverage: 1,
        allowShort: false,
      });
      return {
        result: res,
        error: null,
        strategyLabel: formatStrategyLabel(strategy),
      };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : "回测执行失败",
        strategyLabel: "",
      };
    }
  }, [
    runVersion,
    effectiveBars,
    strategyType,
    maFast,
    maSlow,
    bollPeriod,
    bollStd,
    bollSellTarget,
    rsiPeriod,
    rsiOversold,
    rsiOverbought,
    initialCashInput,
    sizingMode,
    sizingRatioInput,
    feeRateInput,
    minFeeInput,
    slippageInput,
  ]);

  // Publish latest backtest trades to main chart overlay
  useEffect(() => {
    if (parsedExecution.result) {
      onPublishOverlay({
        symbolId: symbol.id,
        interval,
        strategyLabel: parsedExecution.strategyLabel,
        trades: parsedExecution.result.trades,
      });
    } else {
      onPublishOverlay(null);
    }
  }, [
    parsedExecution.result,
    parsedExecution.strategyLabel,
    symbol.id,
    interval,
    onPublishOverlay,
  ]);

  const handleExportCsv = () => {
    if (!parsedExecution.result || parsedExecution.result.trades.length === 0) {
      onNotify?.("当前回测暂无成交记录可导出");
      return;
    }
    const csv = buildBacktestTradesCsv(
      parsedExecution.result.trades,
      symbol,
      interval
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const safeTicker = symbol.ticker.replace(/[^a-zA-Z0-9_-]/g, "_");
    triggerCsvDownload(
      `trade-buddy-backtest-${safeTicker}-${interval}-${strategyType}-${stamp}.csv`,
      csv
    );
    onNotify?.("已导出回测交易列表 CSV");
  };

  const result = parsedExecution.result;
  const summary = result?.summary ?? null;
  const prec = symbol.pricePrecision;
  const effectiveRangeLabel = fmtDateRangeFromBars(effectiveBars, interval);

  const plRatioText =
    summary === null || summary.profitLossRatio === null
      ? "—"
      : !Number.isFinite(summary.profitLossRatio)
      ? "∞ (全胜)"
      : `${summary.profitLossRatio.toFixed(2)} : 1`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-panel)] text-[11px]">
      {/* Top Educational Banner + Sample Data Provenance Warning */}
      <div className="tb-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 bg-[var(--bg-elevated)]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: "rgba(56, 189, 248, 0.16)",
              color: "#38BDF8",
            }}
          >
            <IconBacktest size={11} />
            教学回测沙盒
          </span>
          <span className="font-semibold tb-text-primary">
            {symbol.ticker} · {symbol.name} ({interval})
          </span>
          <span className="tb-text-muted tabular-nums">
            共 {effectiveBars.length} 根 K 线 · {effectiveRangeLabel}
          </span>
          <span className="rounded border tb-border-subtle px-1.5 py-0.5 text-[10px] tb-text-secondary">
            1倍现货 · 无杠杆 · 无卖空 · 下一根开盘成交
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isReplayActive && (
            <label className="inline-flex items-center gap-1 rounded border tb-border-subtle bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[10px] tb-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={useReplayPrefix}
                onChange={(e) => setUseReplayPrefix(e.target.checked)}
                className="accent-[#38BDF8]"
              />
              <span>
                仅用回放前缀 ({visibleBars.length}/{fullBars.length})
              </span>
            </label>
          )}
          <label className="inline-flex items-center gap-1 rounded border tb-border-subtle bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[10px] tb-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={showChartMarkers}
              onChange={onToggleChartMarkers}
              className="accent-[#38BDF8]"
            />
            <span>主图回测买卖点</span>
          </label>
          <span className="text-[10px] font-medium text-[var(--status-delayed)]">
            教学用途，不构成投资建议
          </span>
        </div>
      </div>

      {/* Prominent Sample Data Notice */}
      {provenance.isSample ? (
        <div
          className="tb-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1 text-[10px]"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            color: "var(--status-delayed)",
          }}
        >
          <span className="font-semibold">
            ⚠ 基于历史样本数据，非实时，仅供学习
          </span>
          <span className="tabular-nums opacity-90">
            来源：{provenance.provider}
            {provenance.dateRange ? ` · 样本区间：${provenance.dateRange}` : ""}
            {isReplayActive && useReplayPrefix
              ? ` · 当前回放截断至 ${effectiveRangeLabel}`
              : ""}
          </span>
        </div>
      ) : (
        <div className="tb-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1 text-[10px] bg-[var(--bg-canvas)] tb-text-muted">
          <span>
            数据来源：{provenance.provider}（{provenance.delayNote}）· 教学用途，不构成投资建议
          </span>
          <span className="tabular-nums">区间：{effectiveRangeLabel}</span>
        </div>
      )}

      {/* Main Split Workspace: Left Controls + Right Results */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Strategy & Friction Config Column */}
        <div className="tb-border w-[264px] shrink-0 overflow-y-auto border-r p-2.5 space-y-2.5 bg-[var(--bg-canvas)]">
          {/* Strategy Selector */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold tb-text-secondary">
              预设教学策略
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ["ma_cross", "双均线"],
                  ["bollinger", "布林带"],
                  ["rsi", "RSI阈值"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStrategyType(id)}
                  className={`rounded border px-1.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                    strategyType === id
                      ? "border-[#38BDF8] bg-[rgba(56,189,248,0.16)] text-[#38BDF8]"
                      : "tb-border-subtle tb-text-secondary tb-hover"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy-specific Parameters */}
          {strategyType === "ma_cross" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  快线 MA 周期
                </label>
                <input
                  type="number"
                  min={2}
                  max={200}
                  step={1}
                  value={maFast}
                  onChange={(e) => setMaFast(e.target.value)}
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  慢线 MA 周期
                </label>
                <input
                  type="number"
                  min={3}
                  max={400}
                  step={1}
                  value={maSlow}
                  onChange={(e) => setMaSlow(e.target.value)}
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                />
              </div>
            </div>
          )}

          {strategyType === "bollinger" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] tb-text-muted">
                    均线周期 N
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    step={1}
                    value={bollPeriod}
                    onChange={(e) => setBollPeriod(e.target.value)}
                    className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] tb-text-muted">
                    标准差倍数 σ
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    max={5}
                    step={0.1}
                    value={bollStd}
                    onChange={(e) => setBollStd(e.target.value)}
                    className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  布林卖出条件（收盘跌破下轨买）
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      ["middle", "升破中轨卖"],
                      ["upper", "升破上轨卖"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBollSellTarget(val)}
                      className={`rounded border px-1.5 py-1 text-[10px] cursor-pointer ${
                        bollSellTarget === val
                          ? "border-[#38BDF8] bg-[rgba(56,189,248,0.14)] text-[#38BDF8] font-semibold"
                          : "tb-border-subtle tb-text-secondary tb-hover"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {strategyType === "rsi" && (
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  RSI 周期
                </label>
                <input
                  type="number"
                  min={2}
                  max={100}
                  step={1}
                  value={rsiPeriod}
                  onChange={(e) => setRsiPeriod(e.target.value)}
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  低于买
                </label>
                <input
                  type="number"
                  min={1}
                  max={49}
                  step={1}
                  value={rsiOversold}
                  onChange={(e) => setRsiOversold(e.target.value)}
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] tb-text-muted">
                  高于卖
                </label>
                <input
                  type="number"
                  min={51}
                  max={99}
                  step={1}
                  value={rsiOverbought}
                  onChange={(e) => setRsiOverbought(e.target.value)}
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
                />
              </div>
            </div>
          )}

          {/* Initial Cash & Position Sizing */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                初始虚拟资金
              </label>
              <input
                type="number"
                min={100}
                step={10000}
                value={initialCashInput}
                onChange={(e) => setInitialCashInput(e.target.value)}
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                1倍现货仓位
              </label>
              <select
                value={sizingMode}
                onChange={(e) =>
                  setSizingMode(e.target.value as "full" | "fixed_ratio")
                }
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
              >
                <option value="full">全仓 (100%)</option>
                <option value="fixed_ratio">固定比例</option>
              </select>
            </div>
          </div>

          {sizingMode === "fixed_ratio" && (
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                单次建仓比例 (%，上限 100%)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                step={5}
                value={sizingRatioInput}
                onChange={(e) => setSizingRatioInput(e.target.value)}
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
              />
            </div>
          )}

          {/* Fees & Slippage */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                费率(%)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                step={0.01}
                value={feeRateInput}
                onChange={(e) => setFeeRateInput(e.target.value)}
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                最低费
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={minFeeInput}
                onChange={(e) => setMinFeeInput(e.target.value)}
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] tb-text-muted">
                滑点(%)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                step={0.01}
                value={slippageInput}
                onChange={(e) => setSlippageInput(e.target.value)}
                className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tb-text-primary tabular-nums outline-none focus:border-[var(--border-focus)]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => {
                setRunVersion((v) => v + 1);
                if (parsedExecution.result) {
                  onNotify?.(
                    `回测完成：${symbol.ticker} · ${parsedExecution.strategyLabel}（共 ${parsedExecution.result.trades.length} 笔成交）`
                  );
                }
              }}
              className="flex-1 rounded bg-[#0284C7] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0369A1] transition-colors cursor-pointer"
            >
              重新运行回测
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!result || result.trades.length === 0}
              title="导出回测交易列表 CSV（UTF-8 BOM）"
              className="tb-border-subtle tb-hover inline-flex items-center gap-1 rounded border px-2 py-1.5 text-[10px] tb-text-secondary disabled:opacity-40 cursor-pointer"
            >
              <IconDownload size={12} />
              CSV
            </button>
          </div>
        </div>

        {/* Right Result Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sub-Tab Strip */}
          <div className="tb-border flex shrink-0 items-center justify-between border-b px-3 py-1 bg-[var(--bg-panel)]">
            <div className="flex items-center gap-1">
              {(
                [
                  ["overview", "概览与权益曲线"],
                  [
                    "trades",
                    `交易列表 (${result ? result.trades.length : 0})`,
                  ],
                  ["rules", "无未来函数与口径说明"],
                ] as const
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setSubTab(tabId)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    subTab === tabId
                      ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold"
                      : "tb-text-secondary tb-hover"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {result && (
              <span className="hidden lg:inline text-[10px] tb-text-muted">
                当前策略：{parsedExecution.strategyLabel}
                {result.unexecutedLastSignal
                  ? ` · 末根产生${
                      result.unexecutedLastSignal.side === "buy" ? "买" : "卖"
                    }信号（无下一根未成交）`
                  : ""}
              </span>
            )}
          </div>

          {/* Sub-Tab Body */}
          <div className="flex-1 overflow-y-auto p-2.5">
            {parsedExecution.error ? (
              <div className="rounded border border-[#F2485B]/40 bg-[#F2485B]/10 p-3 text-[11px] text-[#F2485B]">
                {parsedExecution.error}
              </div>
            ) : !result || !summary ? (
              <div className="p-4 text-center tb-text-muted">暂无回测结果</div>
            ) : subTab === "overview" ? (
              <div className="space-y-2.5">
                {/* Summary KPI Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">策略总收益</div>
                    <div
                      className={`text-[13px] font-bold tabular-nums ${
                        summary.totalReturnPct >= 0 ? "tb-up" : "tb-down"
                      }`}
                    >
                      {fmtSignedPct(summary.totalReturnPct)}
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      期末 {fmtMoney(summary.finalEquity)}
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">
                      买入持有基准
                    </div>
                    <div
                      className={`text-[13px] font-bold tabular-nums ${
                        summary.benchmarkReturnPct >= 0 ? "tb-up" : "tb-down"
                      }`}
                    >
                      {fmtSignedPct(summary.benchmarkReturnPct)}
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      超额{" "}
                      <span
                        className={
                          summary.excessReturnPct >= 0 ? "tb-up" : "tb-down"
                        }
                      >
                        {fmtSignedPct(summary.excessReturnPct)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">最大回撤</div>
                    <div className="text-[13px] font-bold tabular-nums tb-down">
                      -{summary.maxDrawdownPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      基准 -{summary.benchmarkMaxDrawdownPct.toFixed(2)}%
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">
                      年化收益（参考）
                    </div>
                    <div
                      className={`text-[13px] font-bold tabular-nums ${
                        (summary.annualizedReturnPct ?? 0) >= 0
                          ? "tb-up"
                          : "tb-down"
                      }`}
                    >
                      {fmtSignedPct(summary.annualizedReturnPct)}
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      {summary.hasOpenPositionAtEnd
                        ? `期末持仓 ${summary.endingShares}`
                        : "期末空仓"}
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">
                      胜率 / 盈亏比
                    </div>
                    <div className="text-[13px] font-bold tabular-nums tb-text-primary">
                      {summary.winRatePct === null
                        ? "—"
                        : `${summary.winRatePct.toFixed(1)}%`}
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      盈亏比 {plRatioText}
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-1.5">
                    <div className="text-[10px] tb-text-muted">
                      交易次数 / 手续费
                    </div>
                    <div className="text-[13px] font-bold tabular-nums tb-text-primary">
                      {summary.totalTrades} 笔 ({summary.closedRoundTrips}回合)
                    </div>
                    <div className="text-[10px] tb-text-muted tabular-nums">
                      费用 {fmtMoney(summary.totalFees)}
                    </div>
                  </div>
                </div>

                {/* Dual-line Comparison Chart */}
                <BacktestEquityChart
                  series={result.equityCurve}
                  initialCash={result.initialCash}
                  interval={interval}
                />
              </div>
            ) : subTab === "trades" ? (
              result.trades.length === 0 ? (
                <div className="rounded border tb-border bg-[var(--bg-canvas)] p-6 text-center text-[11px] tb-text-muted">
                  当前参数区间内未触发任何可成交交易（可尝试调整周期或阈值）。
                </div>
              ) : (
                <div className="overflow-x-auto rounded border tb-border bg-[var(--bg-canvas)]">
                  <table className="w-full border-collapse text-left text-[11px] tabular-nums">
                    <thead>
                      <tr className="tb-border border-b bg-[var(--bg-elevated)] text-[10px] tb-text-muted">
                        <th className="px-2 py-1.5 font-medium">#</th>
                        <th className="px-2 py-1.5 font-medium">信号时间</th>
                        <th className="px-2 py-1.5 font-medium">
                          成交时间(下一根开盘)
                        </th>
                        <th className="px-2 py-1.5 font-medium">方向</th>
                        <th className="px-2 py-1.5 font-medium text-right">
                          开盘价
                        </th>
                        <th className="px-2 py-1.5 font-medium text-right">
                          成交价
                        </th>
                        <th className="px-2 py-1.5 font-medium text-right">
                          数量
                        </th>
                        <th className="px-2 py-1.5 font-medium text-right">
                          手续费
                        </th>
                        <th className="px-2 py-1.5 font-medium text-right">
                          回合净盈亏
                        </th>
                        <th className="px-2 py-1.5 font-medium">触发原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t, idx) => (
                        <tr
                          key={t.id}
                          className="tb-border border-b last:border-b-0 hover:bg-[var(--bg-hover)]"
                        >
                          <td className="px-2 py-1 tb-text-muted">{idx + 1}</td>
                          <td className="px-2 py-1 tb-text-secondary">
                            {formatBarTimestamp(t.signalTimestamp, interval)}
                          </td>
                          <td className="px-2 py-1 tb-text-primary font-medium">
                            {formatBarTimestamp(t.timestamp, interval)}
                          </td>
                          <td className="px-2 py-1">
                            <span
                              className="inline-block rounded px-1.5 py-0.2 text-[10px] font-semibold"
                              style={
                                t.side === "buy"
                                  ? {
                                      backgroundColor:
                                        "rgba(56, 189, 248, 0.16)",
                                      color: "#38BDF8",
                                    }
                                  : {
                                      backgroundColor:
                                        "rgba(168, 85, 247, 0.16)",
                                      color: "#C084FC",
                                    }
                              }
                            >
                              {t.side === "buy" ? "测·买" : "测·卖"}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right tb-text-secondary">
                            {t.openPrice.toFixed(prec)}
                          </td>
                          <td className="px-2 py-1 text-right tb-text-primary font-medium">
                            {t.price.toFixed(prec)}
                          </td>
                          <td className="px-2 py-1 text-right tb-text-primary">
                            {t.quantity}
                          </td>
                          <td className="px-2 py-1 text-right tb-text-secondary">
                            {fmtMoney(t.fee)}
                          </td>
                          <td
                            className={`px-2 py-1 text-right font-semibold ${
                              t.realizedPnl === null
                                ? "tb-text-muted"
                                : t.realizedPnl >= 0
                                ? "tb-up"
                                : "tb-down"
                            }`}
                          >
                            {t.realizedPnl === null
                              ? "—"
                              : `${t.realizedPnl >= 0 ? "+" : ""}${fmtMoney(
                                  t.realizedPnl
                                )} (${fmtSignedPct(t.returnPct)})`}
                          </td>
                          <td className="px-2 py-1 tb-text-secondary">
                            {t.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px] leading-relaxed">
                <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2.5 space-y-1">
                  <div className="font-semibold tb-text-primary">
                    严格无未来函数与撮合口径
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 tb-text-secondary">
                    <li>
                      <strong className="tb-text-primary">下一根开盘成交</strong>
                      ：第 i 根 K 线收盘后，仅使用索引 ≤ i 的历史收盘价计算指标与信号；信号严格在第 i+1 根的
                      <strong>开盘价</strong>成交。最后一根产生的信号因无下一根而不成交。
                    </li>
                    <li>
                      <strong className="tb-text-primary">
                        1 倍现货、禁止卖空与杠杆
                      </strong>
                      ：仅允许空仓时买入、持仓时全部卖出；空仓时的卖出信号直接忽略；建仓资金永远不超过当前可用现金。
                    </li>
                    <li>
                      <strong className="tb-text-primary">滑点与手续费</strong>
                      ：买价 = 开盘价 × (1 + 滑点%)，卖价 = 开盘价 × (1 − 滑点%)；每笔手续费 = max(成交额 × 费率%, 最低费用)，双向扣除并计入回合净盈亏。
                    </li>
                  </ul>
                </div>

                <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2.5 space-y-1">
                  <div className="font-semibold tb-text-primary">
                    预设策略与基准口径
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 tb-text-secondary">
                    <li>
                      <strong className="tb-text-primary">双均线交叉</strong>
                      ：快线 SMA 上穿慢线 SMA（金叉）产生买信号，下穿（死叉）产生卖信号。
                    </li>
                    <li>
                      <strong className="tb-text-primary">布林带 (BOLL)</strong>
                      ：N 周期总体标准差轨道；收盘跌破下轨产生买信号，收盘升破中轨或上轨（可切换）产生卖信号。
                    </li>
                    <li>
                      <strong className="tb-text-primary">RSI 阈值</strong>
                      ：Wilder 平滑 RSI；低于超卖阈值产生买信号，高于超买阈值产生卖信号。
                    </li>
                    <li>
                      <strong className="tb-text-primary">买入持有基准</strong>
                      ：在第 2 根 K 线（索引 1）开盘时以 1 倍全仓买入并持有至期末，套用完全相同的滑点与手续费率，确保公平对比。
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
