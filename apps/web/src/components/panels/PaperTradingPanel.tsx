"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PAPER_INITIAL_CASH,
  type PaperOrderSide,
  type PaperOrderType,
  type SymbolMeta,
} from "@trade-buddy/shared-types";
import { IconClose, IconPaperSim, IconRefresh } from "@trade-buddy/ui-tokens";

import {
  computeAccountMetrics,
  computeFrozenSellQty,
  getAvailableSellQty,
  type PaperMarketSnapshot,
} from "@/lib/paper-trading";
import { usePaperTrading } from "@/lib/paper-trading-store";

interface PaperTradingPanelProps {
  activeSymbol: SymbolMeta;
  activeSnapshot: PaperMarketSnapshot | null;
  snapshotsBySymbol: Record<string, PaperMarketSnapshot>;
  markPriceBySymbol: Record<string, number>;
  onSelectSymbol: (symbolId: string) => void;
  onNotify?: (msg: string) => void;
}

type PaperSubTab = "positions" | "orders" | "fills" | "rules";

const INITIAL_CASH_PRESETS = [
  { label: "10万", value: 100_000 },
  { label: "50万", value: 500_000 },
  { label: "100万", value: 1_000_000 },
  { label: "500万", value: 5_000_000 },
];

function fmtMoney(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return "—";
  return val.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtSignedMoney(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return "—";
  const prefix = val > 0 ? "+" : "";
  return `${prefix}${fmtMoney(val, digits)}`;
}

function fmtQty(val: number): string {
  if (!Number.isFinite(val)) return "—";
  if (Math.abs(val - Math.round(val)) < 1e-6) {
    return Math.round(val).toLocaleString("zh-CN");
  }
  return val.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function fmtLocalTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function pnlColorClass(val: number): string {
  if (val > 1e-6) return "tb-up";
  if (val < -1e-6) return "tb-down";
  return "tb-text-secondary";
}

export function PaperTradingPanel({
  activeSymbol,
  activeSnapshot,
  snapshotsBySymbol,
  markPriceBySymbol,
  onSelectSymbol,
  onNotify,
}: PaperTradingPanelProps) {
  const {
    hydrated,
    account,
    initAccount,
    resetAccount,
    placeOrder,
    cancelOrder,
  } = usePaperTrading();

  // First-time setup & reset confirmation state
  const [setupCashInput, setSetupCashInput] = useState(
    String(DEFAULT_PAPER_INITIAL_CASH)
  );
  const [setupError, setSetupError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetCashInput, setResetCashInput] = useState(
    String(DEFAULT_PAPER_INITIAL_CASH)
  );

  // Order ticket state
  const [side, setSide] = useState<PaperOrderSide>("buy");
  const [orderType, setOrderType] = useState<PaperOrderType>("market");
  const [quantityInput, setQuantityInput] = useState("10");
  const [limitPriceInput, setLimitPriceInput] = useState("");
  const [ticketFeedback, setTicketFeedback] = useState<{
    kind: "error" | "ok";
    text: string;
  } | null>(null);

  // Sub-tab state
  const [subTab, setSubTab] = useState<PaperSubTab>("positions");

  const activePrice =
    activeSnapshot && activeSnapshot.currentPrice > 0
      ? activeSnapshot.currentPrice
      : 0;

  // Keep limit price prefilled sensibly when switching active symbol
  useEffect(() => {
    if (activePrice > 0) {
      setLimitPriceInput(activePrice.toFixed(activeSymbol.pricePrecision));
    } else {
      setLimitPriceInput("");
    }
    setTicketFeedback(null);
  }, [activeSymbol.id, activeSymbol.pricePrecision]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = useMemo(
    () => (account ? computeAccountMetrics(account, markPriceBySymbol) : null),
    [account, markPriceBySymbol]
  );

  const openOrders = useMemo(
    () => (account ? account.orders.filter((o) => o.status === "open") : []),
    [account]
  );

  const activePosition = useMemo(
    () =>
      account?.positions.find((p) => p.symbolId === activeSymbol.id) ?? null,
    [account, activeSymbol.id]
  );

  const activeAvailableSellQty = useMemo(
    () => (account ? getAvailableSellQty(account, activeSymbol.id) : 0),
    [account, activeSymbol.id]
  );

  const activeFrozenSellQty = useMemo(
    () =>
      account ? computeFrozenSellQty(account.orders, activeSymbol.id) : 0,
    [account, activeSymbol.id]
  );

  const parsedLimitPrice = Number(limitPriceInput);
  const parsedQty = Number(quantityInput);
  const effectiveRefPrice =
    orderType === "limit"
      ? Number.isFinite(parsedLimitPrice) && parsedLimitPrice > 0
        ? parsedLimitPrice
        : activePrice
      : activePrice;

  const estimatedNotional =
    Number.isFinite(parsedQty) && parsedQty > 0 && effectiveRefPrice > 0
      ? parsedQty * effectiveRefPrice
      : 0;

  const maxBuyQty =
    metrics && effectiveRefPrice > 0
      ? Math.floor(metrics.availableCash / effectiveRefPrice)
      : 0;

  const handleInitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(setupCashInput);
    if (!Number.isFinite(num) || num <= 0) {
      setSetupError("请输入大于 0 的初始虚拟资金");
      return;
    }
    setSetupError(null);
    initAccount(num);
    onNotify?.(`已创建虚拟资金模拟账户（初始 ${fmtMoney(num, 0)}）`);
  };

  const handleConfirmReset = () => {
    const num = Number(resetCashInput);
    if (!Number.isFinite(num) || num <= 0) {
      setTicketFeedback({ kind: "error", text: "重置初始虚拟资金必须大于 0" });
      return;
    }
    resetAccount(num);
    setResetConfirmOpen(false);
    setTicketFeedback({
      kind: "ok",
      text: `虚拟账户已重置，初始虚拟现金 ${fmtMoney(num, 0)}`,
    });
    onNotify?.("虚拟资金模拟账户已重置");
  };

  const handleApplyPct = (pct: number) => {
    if (!metrics) return;
    if (side === "buy") {
      if (effectiveRefPrice <= 0) return;
      const raw = (metrics.availableCash * pct) / effectiveRefPrice;
      const qty = raw >= 1 ? Math.floor(raw) : Math.floor(raw * 100) / 100;
      if (qty > 0) {
        setQuantityInput(String(qty));
      }
    } else {
      if (activeAvailableSellQty <= 0) {
        setQuantityInput("0");
        return;
      }
      const qty =
        pct >= 1
          ? activeAvailableSellQty
          : activeAvailableSellQty >= 1
          ? Math.max(1, Math.floor(activeAvailableSellQty * pct))
          : Number((activeAvailableSellQty * pct).toFixed(4));
      setQuantityInput(String(Math.min(qty, activeAvailableSellQty)));
    }
  };

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketFeedback(null);

    const qty = Number(quantityInput);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTicketFeedback({ kind: "error", text: "请输入大于 0 的委托数量" });
      return;
    }

    const limitPrice =
      orderType === "limit" ? Number(limitPriceInput) : undefined;
    if (
      orderType === "limit" &&
      (limitPrice === undefined || !Number.isFinite(limitPrice) || limitPrice <= 0)
    ) {
      setTicketFeedback({ kind: "error", text: "限价单必须输入大于 0 的委托价" });
      return;
    }

    const res = placeOrder(
      {
        symbolId: activeSymbol.id,
        ticker: activeSymbol.ticker,
        symbolName: activeSymbol.name,
        currency: activeSymbol.currency,
        pricePrecision: activeSymbol.pricePrecision,
        side,
        type: orderType,
        quantity: qty,
        limitPrice,
        leverage: 1,
        allowShort: false,
      },
      activeSnapshot
    );

    if (!res.ok) {
      setTicketFeedback({ kind: "error", text: res.error ?? "委托提交失败" });
      return;
    }

    const msg = res.message ?? "虚拟委托已处理";
    setTicketFeedback({ kind: "ok", text: msg });
    onNotify?.(msg);
  };

  const handleQuickClosePosition = (symbolId: string) => {
    if (!account) return;
    const pos = account.positions.find((p) => p.symbolId === symbolId);
    if (!pos) return;
    const avail = getAvailableSellQty(account, symbolId);
    if (avail <= 0) {
      setTicketFeedback({
        kind: "error",
        text: `${pos.ticker} 持仓已全部被卖单冻结，请先撤单后再平仓`,
      });
      return;
    }
    const snap: PaperMarketSnapshot | null =
      snapshotsBySymbol[symbolId] ??
      (markPriceBySymbol[symbolId] > 0
        ? {
            symbolId,
            currentPrice: markPriceBySymbol[symbolId],
            mode: "latest",
            bar: null,
            barTimestamp: null,
          }
        : null);

    const res = placeOrder(
      {
        symbolId: pos.symbolId,
        ticker: pos.ticker,
        symbolName: pos.symbolName,
        currency: pos.currency,
        pricePrecision: pos.pricePrecision,
        side: "sell",
        type: "market",
        quantity: avail,
        leverage: 1,
        allowShort: false,
      },
      snap
    );

    if (res.ok) {
      const msg = res.message ?? `已市价平仓 ${pos.ticker}`;
      setTicketFeedback({ kind: "ok", text: msg });
      onNotify?.(msg);
    } else {
      setTicketFeedback({ kind: "error", text: res.error ?? "平仓失败" });
    }
  };

  const handleCancelOrder = (orderId: string) => {
    const ok = cancelOrder(orderId);
    if (ok) {
      onNotify?.("已撤销虚拟限价挂单");
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] tb-text-muted">
        正在读取本地虚拟资金模拟账户...
      </div>
    );
  }

  // First-time Initialization View
  if (!account || !metrics) {
    return (
      <div className="flex h-full flex-col justify-center overflow-y-auto px-3 py-2">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2.5 rounded-md border tb-border bg-[var(--bg-canvas)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold tracking-wide"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.18)",
                  color: "var(--status-delayed)",
                }}
              >
                <IconPaperSim size={13} />
                <span>虚拟资金·模拟</span>
              </span>
              <span className="text-[13px] font-semibold tb-text-primary">
                初始化本地虚拟模拟账户
              </span>
            </div>
            <span className="text-[10px] tb-text-muted">
              仅保存在本机浏览器 localStorage · 1 倍现货 · 禁止卖空
            </span>
          </div>

          <p className="text-[11px] leading-relaxed tb-text-secondary">
            本功能为纯本地虚拟练习账户，使用虚拟计价资金对图表当前可见价或 K 线回放价进行 1 倍现货模拟撮合（仅可用虚拟现金买入、仅可卖出已有持仓），所有记录均留存在本机浏览器中。
          </p>

          <form
            onSubmit={handleInitAccount}
            className="flex flex-wrap items-end gap-2.5"
          >
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium tb-text-muted">
                初始虚拟资金（计价货币）
              </label>
              <input
                type="number"
                min="100"
                step="any"
                value={setupCashInput}
                onChange={(e) => setSetupCashInput(e.target.value)}
                className="tb-border-subtle h-8 w-44 rounded border bg-[var(--bg-input)] px-2.5 text-[12px] tabular-nums tb-text-primary outline-none focus:border-[var(--border-focus)]"
              />
            </div>

            <div className="flex items-center gap-1 pb-0.5">
              {INITIAL_CASH_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setSetupCashInput(String(p.value))}
                  className={`rounded border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                    Number(setupCashInput) === p.value
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium"
                      : "tb-border tb-text-secondary tb-hover"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="h-8 rounded bg-[var(--accent-primary)] px-4 text-[12px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              开启虚拟模拟账户
            </button>
          </form>

          {setupError && (
            <div className="text-[11px] tb-down">{setupError}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Persistent Top Banner: Always visible 「虚拟资金·模拟」 badge + KPIs + Pricing Mode + Reset */}
      <div className="tb-border flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-[var(--bg-canvas)] px-3 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold tracking-wide"
            style={{
              backgroundColor: "rgba(245, 158, 11, 0.2)",
              color: "var(--status-delayed)",
            }}
          >
            <IconPaperSim size={12} />
            <span>虚拟资金·模拟</span>
          </span>

          <div className="flex items-center gap-1 tabular-nums">
            <span className="tb-text-muted">总虚拟权益</span>
            <span className="font-semibold tb-text-primary">
              {fmtMoney(metrics.totalEquity)}
            </span>
            <span className={`text-[10px] font-medium ${pnlColorClass(metrics.totalPnl)}`}>
              ({metrics.totalPnl >= 0 ? "+" : ""}
              {metrics.totalPnlPct.toFixed(2)}%)
            </span>
          </div>

          <div className="flex items-center gap-1 tabular-nums">
            <span className="tb-text-muted">可用现金</span>
            <span className="font-medium tb-text-primary">
              {fmtMoney(metrics.availableCash)}
            </span>
            {metrics.frozenCash > 0 && (
              <span className="text-[10px] tb-text-muted">
                (冻结 {fmtMoney(metrics.frozenCash)})
              </span>
            )}
          </div>

          <div className="hidden xl:flex items-center gap-1 tabular-nums">
            <span className="tb-text-muted">持仓市值</span>
            <span className="font-medium tb-text-primary">
              {fmtMoney(metrics.marketValue)}
            </span>
          </div>

          <div className="flex items-center gap-1 tabular-nums">
            <span className="tb-text-muted">浮动盈亏</span>
            <span className={`font-semibold ${pnlColorClass(metrics.unrealizedPnl)}`}>
              {fmtSignedMoney(metrics.unrealizedPnl)}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-1 tabular-nums">
            <span className="tb-text-muted">已实现盈亏</span>
            <span className={`font-medium ${pnlColorClass(metrics.realizedPnl)}`}>
              {fmtSignedMoney(metrics.realizedPnl)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Active Matching Source Pill */}
          {activeSnapshot && activeSnapshot.currentPrice > 0 ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
              style={
                activeSnapshot.mode === "replay"
                  ? {
                      backgroundColor: "rgba(245, 158, 11, 0.16)",
                      color: "var(--status-delayed)",
                    }
                  : {
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent-primary)",
                    }
              }
              title={
                activeSnapshot.mode === "replay"
                  ? "回放撮合模式：市价单按当前回放根收盘价成交，限价单在后续回放根 high/low 触及后成交"
                  : "非回放撮合模式：按活动图当前品种最新可见行情价格撮合"
              }
            >
              {activeSnapshot.mode === "replay"
                ? `回放价撮合 · ${activeSnapshot.barTimeLabel ?? ""} 收 ${activePrice.toFixed(
                    activeSymbol.pricePrecision
                  )}`
                : `当前可见价 · ${activeSymbol.ticker} ${activePrice.toFixed(
                    activeSymbol.pricePrecision
                  )}`}
            </span>
          ) : (
            <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] tb-text-muted">
              当前品种无可用价格
            </span>
          )}

          {/* Reset Account Trigger */}
          <button
            type="button"
            onClick={() => {
              setResetCashInput(String(account.initialCash));
              setResetConfirmOpen((v) => !v);
            }}
            title="重置本地虚拟资金模拟账户（需二次确认）"
            className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
          >
            <IconRefresh size={11} />
            <span>重置账户</span>
          </button>
        </div>
      </div>

      {/* Inline Reset Confirmation Bar */}
      {resetConfirmOpen && (
        <div
          className="tb-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px]"
          style={{ backgroundColor: "var(--market-down-soft)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tb-down">确认重置虚拟账户？</span>
            <span className="tb-text-primary">
              将清空全部持仓、挂单与成交记录，并重置初始虚拟现金：
            </span>
            <input
              type="number"
              min="100"
              step="any"
              value={resetCashInput}
              onChange={(e) => setResetCashInput(e.target.value)}
              className="tb-border-subtle h-6 w-32 rounded border bg-[var(--bg-input)] px-2 text-[11px] tabular-nums tb-text-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleConfirmReset}
              className="rounded px-2.5 py-0.5 text-[11px] font-semibold text-white cursor-pointer"
              style={{ backgroundColor: "var(--market-down)" }}
            >
              确认重置
            </button>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="tb-border-subtle rounded border bg-[var(--bg-panel)] px-2 py-0.5 text-[11px] tb-text-secondary tb-hover cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Main Split Content: Left Order Ticket | Right Tables */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left: Compact Order Ticket */}
        <form
          onSubmit={handleSubmitOrder}
          className="tb-border flex w-full md:w-[300px] lg:w-[320px] shrink-0 flex-col gap-1.5 overflow-y-auto border-b md:border-b-0 md:border-r px-3 py-2 text-[11px]"
        >
          {/* Active Target Header */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-[12px] tb-text-primary">
                {activeSymbol.ticker}
              </span>
              <span className="tb-text-muted truncate text-[10px]">
                {activeSymbol.name}
              </span>
              <span className="rounded bg-[var(--bg-elevated)] px-1 text-[9px] tb-text-muted">
                {activeSymbol.currency}
              </span>
            </div>
            <span className="shrink-0 text-[10px] tb-text-muted">
              1倍现货 · 禁卖空
            </span>
          </div>

          {/* Buy / Sell & Market / Limit Row */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="grid grid-cols-2 rounded border tb-border p-0.5 bg-[var(--bg-canvas)]">
              <button
                type="button"
                onClick={() => {
                  setSide("buy");
                  setTicketFeedback(null);
                }}
                className={`rounded py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  side === "buy" ? "tb-up-bg" : "tb-text-secondary tb-hover"
                }`}
              >
                虚拟买入
              </button>
              <button
                type="button"
                onClick={() => {
                  setSide("sell");
                  setTicketFeedback(null);
                }}
                className={`rounded py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  side === "sell" ? "tb-down-bg" : "tb-text-secondary tb-hover"
                }`}
              >
                虚拟卖出
              </button>
            </div>

            <div className="grid grid-cols-2 rounded border tb-border p-0.5 bg-[var(--bg-canvas)]">
              <button
                type="button"
                onClick={() => {
                  setOrderType("market");
                  setTicketFeedback(null);
                }}
                className={`rounded py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  orderType === "market"
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-text-secondary tb-hover"
                }`}
              >
                市价单
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderType("limit");
                  if (activePrice > 0 && !limitPriceInput) {
                    setLimitPriceInput(
                      activePrice.toFixed(activeSymbol.pricePrecision)
                    );
                  }
                  setTicketFeedback(null);
                }}
                className={`rounded py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  orderType === "limit"
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-text-secondary tb-hover"
                }`}
              >
                限价单
              </button>
            </div>
          </div>

          {/* Limit Price Input (only when limit) */}
          {orderType === "limit" && (
            <div className="flex items-center gap-1.5">
              <span className="w-11 shrink-0 tb-text-muted">委托价</span>
              <input
                type="number"
                step="any"
                min="0"
                value={limitPriceInput}
                onChange={(e) => setLimitPriceInput(e.target.value)}
                placeholder="输入限价"
                className="tb-border-subtle h-7 min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 text-[11px] tabular-nums tb-text-primary outline-none focus:border-[var(--border-focus)]"
              />
              {activePrice > 0 && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setLimitPriceInput(
                        (activePrice * 0.98).toFixed(activeSymbol.pricePrecision)
                      )
                    }
                    title="设为现价 -2%"
                    className="tb-hover tb-border rounded border px-1 py-0.5 text-[10px] tb-text-muted cursor-pointer"
                  >
                    -2%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLimitPriceInput(
                        activePrice.toFixed(activeSymbol.pricePrecision)
                      )
                    }
                    title="填入当前参考价"
                    className="tb-hover tb-border rounded border px-1 py-0.5 text-[10px] tb-text-secondary cursor-pointer"
                  >
                    现价
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLimitPriceInput(
                        (activePrice * 1.02).toFixed(activeSymbol.pricePrecision)
                      )
                    }
                    title="设为现价 +2%"
                    className="tb-hover tb-border rounded border px-1 py-0.5 text-[10px] tb-text-muted cursor-pointer"
                  >
                    +2%
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quantity Input + Quick Ratio Pills */}
          <div className="flex items-center gap-1.5">
            <span className="w-11 shrink-0 tb-text-muted">数量</span>
            <input
              type="number"
              step="any"
              min="0"
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="输入正数数量"
              className="tb-border-subtle h-7 min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 text-[11px] tabular-nums tb-text-primary outline-none focus:border-[var(--border-focus)]"
            />
            <div className="flex items-center gap-0.5 shrink-0">
              {[
                { label: "25%", pct: 0.25 },
                { label: "50%", pct: 0.5 },
                { label: "全仓", pct: 1 },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => handleApplyPct(b.pct)}
                  className="tb-hover tb-border rounded border px-1.5 py-0.5 text-[10px] tb-text-secondary cursor-pointer"
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Constraints & Notional Preview */}
          <div className="flex items-center justify-between text-[10px] tb-text-muted tabular-nums">
            <span>
              预计金额：
              <strong className="tb-text-primary font-medium">
                {estimatedNotional > 0 ? fmtMoney(estimatedNotional) : "—"}
              </strong>
            </span>
            {side === "buy" ? (
              <span>最大可买：{fmtQty(maxBuyQty)}</span>
            ) : (
              <span>
                可用持仓：{fmtQty(activeAvailableSellQty)}
                {activeFrozenSellQty > 0
                  ? ` (冻结 ${fmtQty(activeFrozenSellQty)})`
                  : activePosition
                  ? ""
                  : " (无持仓)"}
              </span>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={activePrice <= 0}
            className="h-7 w-full rounded text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{
              backgroundColor:
                side === "buy" ? "var(--market-up)" : "var(--market-down)",
            }}
          >
            {side === "buy" ? "虚拟买入" : "虚拟卖出"} {activeSymbol.ticker}（
            {orderType === "market" ? "市价" : "限价"}）
          </button>

          {/* Rule Hint or Feedback */}
          {ticketFeedback ? (
            <div
              className={`text-[10px] leading-snug ${
                ticketFeedback.kind === "error"
                  ? "tb-down"
                  : "text-[var(--accent-primary)]"
              }`}
            >
              {ticketFeedback.text}
            </div>
          ) : (
            <div className="text-[10px] leading-snug tb-text-muted">
              {activeSnapshot?.mode === "replay"
                ? "回放撮合：市价按当前回放根收盘价成交；限价单在后续回放根高低价触及后成交。"
                : "当前价撮合：市价按最新可见价成交；未成交限价单随新行情或回放步进自动尝试成交。"}
            </div>
          )}
        </form>

        {/* Right: Positions / Open Orders / Fills / Rules */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Sub-tab Strip */}
          <div className="tb-border flex h-[28px] shrink-0 items-center justify-between border-b px-2.5 text-[11px]">
            <div className="flex items-center gap-1">
              {(
                [
                  {
                    id: "positions" as const,
                    label: `持仓 (${account.positions.length})`,
                  },
                  {
                    id: "orders" as const,
                    label: `挂单 (${openOrders.length})`,
                  },
                  {
                    id: "fills" as const,
                    label: `成交记录 (${account.fills.length})`,
                  },
                  { id: "rules" as const, label: "模拟规则" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    subTab === tab.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "tb-text-secondary tb-hover"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="hidden lg:inline text-[10px] tb-text-muted">
              单一虚拟计价货币（跨市场按面值 1:1 记账）
            </span>
          </div>

          {/* Sub-tab Body */}
          <div className="flex-1 overflow-auto px-2.5 py-1.5 text-[11px]">
            {subTab === "positions" && (
              account.positions.length === 0 ? (
                <div className="flex h-full min-h-[110px] flex-col items-center justify-center gap-1 text-center tb-text-muted">
                  <div>当前暂无虚拟持仓</div>
                  <div className="text-[10px]">
                    可在左侧对活动图品种 {activeSymbol.ticker} 下市价单或限价单进行虚拟练习
                  </div>
                </div>
              ) : (
                <table className="w-full min-w-[540px] border-collapse text-left tabular-nums">
                  <thead className="tb-border border-b text-[10px] tb-text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-medium">品种</th>
                      <th className="py-1 px-2 text-right font-medium">持仓数</th>
                      <th className="py-1 px-2 text-right font-medium">成本价</th>
                      <th className="py-1 px-2 text-right font-medium">现价</th>
                      <th className="py-1 px-2 text-right font-medium">市值</th>
                      <th className="py-1 px-2 text-right font-medium">浮动盈亏</th>
                      <th className="py-1 pl-2 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {account.positions.map((pos) => {
                      const live = markPriceBySymbol[pos.symbolId];
                      const mark =
                        typeof live === "number" && live > 0
                          ? live
                          : pos.lastKnownPrice;
                      const value = pos.quantity * mark;
                      const pnl = (mark - pos.avgCost) * pos.quantity;
                      const pnlPct =
                        pos.avgCost > 0
                          ? ((mark - pos.avgCost) / pos.avgCost) * 100
                          : 0;
                      const frozenQty = computeFrozenSellQty(
                        account.orders,
                        pos.symbolId
                      );
                      const isCurrent = pos.symbolId === activeSymbol.id;

                      return (
                        <tr key={pos.symbolId} className="tb-hover">
                          <td className="py-1.5 pr-2">
                            <button
                              type="button"
                              onClick={() => onSelectSymbol(pos.symbolId)}
                              title="点击切换活动图至该品种"
                              className="flex items-center gap-1.5 text-left cursor-pointer"
                            >
                              <span
                                className={`font-semibold ${
                                  isCurrent
                                    ? "text-[var(--accent-primary)]"
                                    : "tb-text-primary"
                                }`}
                              >
                                {pos.ticker}
                              </span>
                              <span className="text-[10px] tb-text-muted truncate max-w-[90px]">
                                {pos.symbolName}
                              </span>
                            </button>
                          </td>
                          <td className="py-1.5 px-2 text-right tb-text-primary">
                            <div>{fmtQty(pos.quantity)}</div>
                            {frozenQty > 0 && (
                              <div className="text-[9px] tb-text-muted">
                                冻结 {fmtQty(frozenQty)}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right tb-text-secondary">
                            {pos.avgCost.toFixed(pos.pricePrecision)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium tb-text-primary">
                            {mark.toFixed(pos.pricePrecision)}
                          </td>
                          <td className="py-1.5 px-2 text-right tb-text-secondary">
                            {fmtMoney(value)}
                          </td>
                          <td
                            className={`py-1.5 px-2 text-right font-semibold ${pnlColorClass(
                              pnl
                            )}`}
                          >
                            <div>{fmtSignedMoney(pnl)}</div>
                            <div className="text-[10px] font-normal">
                              {pnlPct >= 0 ? "+" : ""}
                              {pnlPct.toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickClosePosition(pos.symbolId)
                              }
                              className="tb-border-subtle tb-hover rounded border px-1.5 py-0.5 text-[10px] tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              市价平仓
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}

            {subTab === "orders" && (
              openOrders.length === 0 ? (
                <div className="flex h-full min-h-[110px] flex-col items-center justify-center gap-1 text-center tb-text-muted">
                  <div>当前暂无未成交限价挂单</div>
                  <div className="text-[10px]">
                    限价单在价格未立即触及时会保留在此，随最新行情或回放步进自动撮合
                  </div>
                </div>
              ) : (
                <table className="w-full min-w-[540px] border-collapse text-left tabular-nums">
                  <thead className="tb-border border-b text-[10px] tb-text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-medium">品种</th>
                      <th className="py-1 px-2 font-medium">方向 / 类型</th>
                      <th className="py-1 px-2 text-right font-medium">委托价</th>
                      <th className="py-1 px-2 text-right font-medium">数量</th>
                      <th className="py-1 px-2 text-right font-medium">冻结</th>
                      <th className="py-1 px-2 font-medium">下单时间</th>
                      <th className="py-1 pl-2 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {openOrders.map((ord) => (
                      <tr key={ord.id} className="tb-hover">
                        <td className="py-1.5 pr-2">
                          <button
                            type="button"
                            onClick={() => onSelectSymbol(ord.symbolId)}
                            className="font-semibold tb-text-primary hover:text-[var(--accent-primary)] cursor-pointer"
                          >
                            {ord.ticker}
                          </button>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                              ord.side === "buy" ? "tb-up-bg" : "tb-down-bg"
                            }`}
                          >
                            {ord.side === "buy" ? "买入" : "卖出"} · 限价
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium tb-text-primary">
                          {ord.limitPrice !== undefined
                            ? ord.limitPrice.toFixed(ord.pricePrecision)
                            : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right tb-text-primary">
                          {fmtQty(ord.quantity)}
                        </td>
                        <td className="py-1.5 px-2 text-right tb-text-secondary">
                          {ord.side === "buy" && ord.limitPrice
                            ? `现金 ${fmtMoney(ord.limitPrice * ord.quantity)}`
                            : `持仓 ${fmtQty(ord.quantity)}`}
                        </td>
                        <td className="py-1.5 px-2 text-[10px] tb-text-muted">
                          {fmtLocalTime(ord.createdAt)}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(ord.id)}
                            className="tb-border-subtle tb-hover inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] tb-text-secondary hover:text-[var(--market-down)] cursor-pointer"
                          >
                            <IconClose size={10} />
                            <span>撤单</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {subTab === "fills" && (
              account.fills.length === 0 ? (
                <div className="flex h-full min-h-[110px] flex-col items-center justify-center gap-1 text-center tb-text-muted">
                  <div>暂无虚拟成交记录</div>
                </div>
              ) : (
                <table className="w-full min-w-[580px] border-collapse text-left tabular-nums">
                  <thead className="tb-border border-b text-[10px] tb-text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-medium">成交时间</th>
                      <th className="py-1 px-2 font-medium">品种</th>
                      <th className="py-1 px-2 font-medium">方向 / 类型</th>
                      <th className="py-1 px-2 text-right font-medium">成交价</th>
                      <th className="py-1 px-2 text-right font-medium">数量</th>
                      <th className="py-1 px-2 text-right font-medium">成交额</th>
                      <th className="py-1 px-2 font-medium">撮合来源</th>
                      <th className="py-1 pl-2 text-right font-medium">实现盈亏</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {account.fills.map((f) => (
                      <tr key={f.id} className="tb-hover">
                        <td className="py-1.5 pr-2 text-[10px] tb-text-muted whitespace-nowrap">
                          <div>{fmtLocalTime(f.filledAt)}</div>
                          {f.matchMode === "replay" && f.barTimeLabel && (
                            <div className="text-[9px] text-[var(--status-delayed)]">
                              K线 {f.barTimeLabel}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <button
                            type="button"
                            onClick={() => onSelectSymbol(f.symbolId)}
                            className="font-semibold tb-text-primary hover:text-[var(--accent-primary)] cursor-pointer"
                          >
                            {f.ticker}
                          </button>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                              f.side === "buy" ? "tb-up-bg" : "tb-down-bg"
                            }`}
                          >
                            {f.side === "buy" ? "买入" : "卖出"} ·{" "}
                            {f.type === "market" ? "市价" : "限价"}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-medium tb-text-primary">
                          {f.price.toFixed(f.pricePrecision)}
                        </td>
                        <td className="py-1.5 px-2 text-right tb-text-primary">
                          {fmtQty(f.quantity)}
                        </td>
                        <td className="py-1.5 px-2 text-right tb-text-secondary">
                          {fmtMoney(f.notional)}
                        </td>
                        <td className="py-1.5 px-2 text-[10px] whitespace-nowrap">
                          <span
                            className="rounded px-1.5 py-0.2"
                            style={
                              f.matchMode === "replay"
                                ? {
                                    backgroundColor: "rgba(245, 158, 11, 0.16)",
                                    color: "var(--status-delayed)",
                                  }
                                : {
                                    backgroundColor: "var(--bg-elevated)",
                                    color: "var(--text-secondary)",
                                  }
                            }
                          >
                            {f.matchMode === "replay" ? "回放撮合" : "当前价"}
                          </span>
                        </td>
                        <td
                          className={`py-1.5 pl-2 text-right font-medium ${
                            f.realizedPnl === null
                              ? "tb-text-muted"
                              : pnlColorClass(f.realizedPnl)
                          }`}
                        >
                          {f.realizedPnl === null
                            ? "—"
                            : fmtSignedMoney(f.realizedPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {subTab === "rules" && (
              <div className="space-y-1.5 rounded border tb-border bg-[var(--bg-canvas)] p-2.5 text-[11px] leading-relaxed tb-text-secondary">
                <div className="font-semibold tb-text-primary">
                  虚拟资金·模拟盘运行规则（纯本机学习练习）
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    <strong className="tb-text-primary">纯本地存储</strong>
                    ：账户现金、持仓、挂单与成交记录仅保存在当前浏览器{" "}
                    <code className="tb-text-primary">localStorage</code>
                    ，不上传任何服务器，刷新页面后自动恢复。
                  </li>
                  <li>
                    <strong className="tb-text-primary">严格 1 倍现货与禁止卖空</strong>
                    ：买入受可用虚拟现金全额约束（限价买单冻结对应资金），卖出仅可卖出当前已有可用持仓（限价卖单冻结对应数量），校验层写死 1 倍现货，拒绝一切超额或卖空委托。
                  </li>
                  <li>
                    <strong className="tb-text-primary">非回放撮合</strong>
                    ：市价单按活动图当前品种最新可见行情价即时成交；限价单若当前价已满足限价条件则即时成交，否则保留为挂单，随后续行情价格触及或新 K 线高低价触及后自动成交。
                  </li>
                  <li>
                    <strong className="tb-text-primary">K 线回放撮合</strong>
                    ：回放中严格只使用当前回放 K 线，绝不提前读取未来数据。市价单按当前回放根收盘价成交；限价单在后续步进/播放的新 K 线中，若买单满足{" "}
                    <code className="tb-text-primary">low ≤ 委托价</code>（按{" "}
                    <code className="tb-text-primary">min(open, 委托价)</code>{" "}
                    成交）或卖单满足{" "}
                    <code className="tb-text-primary">high ≥ 委托价</code>（按{" "}
                    <code className="tb-text-primary">max(open, 委托价)</code>{" "}
                    成交）时自动成交。
                  </li>
                  <li>
                    <strong className="tb-text-primary">跨品种记账</strong>
                    ：切换品种或多图活动窗格不会丢失账户数据；多市场品种按虚拟计价单位面值 1:1 统一统计，不计手续费、滑点与汇率折算。
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
