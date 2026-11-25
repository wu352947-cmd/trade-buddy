"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ALERT_CONDITION_LABELS,
  INTERVAL_LABELS,
  type AlertConditionType,
  type AlertFrequency,
  type Interval,
  type NormalizedQuote,
  type SymbolMeta,
  type WatchlistSummaryItem,
} from "@trade-buddy/shared-types";
import {
  IconBell,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@trade-buddy/ui-tokens";
import {
  formatAlertRuleSummary,
  isChangePctAlertCondition,
  isMaAlertCondition,
  isPriceAlertCondition,
  isRsiAlertCondition,
  LOCAL_ALERTS_OPEN_PAGE_NOTICE,
} from "@/lib/local-alerts";
import { useAlerts } from "@/lib/alerts-store";

interface AlertsPanelProps {
  activeSymbol: SymbolMeta;
  activeInterval: Interval;
  activeQuote: NormalizedQuote;
  watchlist: WatchlistSummaryItem[];
  onSelectSymbol: (symbolId: string) => void;
  onManualCheckAll: () => Promise<{
    triggeredCount: number;
    checkedCount: number;
    skippedReplayCount: number;
    detailsByRuleId: Record<string, string>;
  }>;
  onNotify: (msg: string) => void;
}

const CONDITION_GROUPS: Array<{
  group: string;
  items: AlertConditionType[];
}> = [
  {
    group: "价格线提醒（主图画线）",
    items: ["price_cross_above", "price_cross_below"],
  },
  {
    group: "涨跌幅提醒（相对前收）",
    items: ["change_pct_up", "change_pct_down", "change_pct_abs"],
  },
  {
    group: "均线交叉提醒",
    items: ["ma_golden_cross", "ma_death_cross"],
  },
  {
    group: "RSI 指标提醒",
    items: ["rsi_above", "rsi_below"],
  },
];

function formatDateTimeShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function AlertsPanel({
  activeSymbol,
  activeInterval,
  activeQuote,
  watchlist,
  onSelectSymbol,
  onManualCheckAll,
  onNotify,
}: AlertsPanelProps) {
  const {
    rules,
    history,
    settings,
    unreadCount,
    browserPermission,
    addRule,
    toggleRuleEnabled,
    deleteRule,
    updateSettings,
    requestBrowserNotificationPermission,
    markAllHistoryRead,
    clearHistory,
  } = useAlerts();

  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [formOpen, setFormOpen] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheckDetails, setLastCheckDetails] = useState<
    Record<string, string>
  >({});

  // Create form state
  const [selectedSymbolId, setSelectedSymbolId] = useState(activeSymbol.id);
  const [interval, setIntervalVal] = useState<Interval>(activeInterval);
  const [condition, setCondition] =
    useState<AlertConditionType>("price_cross_above");
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [maFastInput, setMaFastInput] = useState("5");
  const [maSlowInput, setMaSlowInput] = useState("20");
  const [rsiPeriodInput, setRsiPeriodInput] = useState("14");
  const [frequency, setFrequency] = useState<AlertFrequency>("once");
  const [noteInput, setNoteInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () =>
      watchlist.find((w) => w.symbol.id === selectedSymbolId) ??
      watchlist.find((w) => w.symbol.id === activeSymbol.id) ??
      null,
    [watchlist, selectedSymbolId, activeSymbol.id]
  );

  const selectedMeta = selectedItem?.symbol ?? activeSymbol;
  const selectedQuote =
    selectedMeta.id === activeSymbol.id
      ? activeQuote
      : selectedItem?.quote ?? activeQuote;

  // Keep form synced with active symbol when user switches chart (only if form hasn't been manually edited to another price)
  useEffect(() => {
    setSelectedSymbolId(activeSymbol.id);
    setIntervalVal(activeInterval);
  }, [activeSymbol.id, activeInterval]);

  // Suggest sensible default threshold when condition or symbol changes
  useEffect(() => {
    const prec = selectedMeta.pricePrecision;
    if (isPriceAlertCondition(condition)) {
      if (selectedQuote.last > 0) {
        setThresholdInput(selectedQuote.last.toFixed(prec));
      } else {
        setThresholdInput("");
      }
    } else if (isChangePctAlertCondition(condition)) {
      setThresholdInput("2.0");
    } else if (condition === "rsi_above") {
      setThresholdInput("70");
    } else if (condition === "rsi_below") {
      setThresholdInput("30");
    }
    setFormError(null);
  }, [condition, selectedMeta.id, selectedMeta.pricePrecision, selectedQuote.last]);

  // Ensure selected interval is supported by selected symbol
  useEffect(() => {
    if (!selectedMeta.supportedIntervals.includes(interval)) {
      setIntervalVal(selectedMeta.supportedIntervals[0] ?? "1D");
    }
  }, [selectedMeta, interval]);

  // Mark history read when opening history tab
  useEffect(() => {
    if (tab === "history" && unreadCount > 0) {
      markAllHistoryRead();
    }
  }, [tab, unreadCount, markAllHistoryRead]);

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isPriceAlertCondition(condition)) {
      const val = Number(thresholdInput);
      if (!Number.isFinite(val) || val <= 0) {
        setFormError("请输入大于 0 的目标触发价格");
        return;
      }
      addRule({
        symbolId: selectedMeta.id,
        ticker: selectedMeta.ticker,
        symbolName: selectedMeta.name,
        pricePrecision: selectedMeta.pricePrecision,
        interval,
        condition,
        threshold: val,
        frequency,
        note: noteInput,
      });
    } else if (isChangePctAlertCondition(condition)) {
      const val = Math.abs(Number(thresholdInput));
      if (!Number.isFinite(val) || val <= 0 || val > 500) {
        setFormError("请输入有效的涨跌幅百分比阈值（0 ~ 500）");
        return;
      }
      addRule({
        symbolId: selectedMeta.id,
        ticker: selectedMeta.ticker,
        symbolName: selectedMeta.name,
        pricePrecision: selectedMeta.pricePrecision,
        interval,
        condition,
        threshold: val,
        frequency,
        note: noteInput,
      });
    } else if (isMaAlertCondition(condition)) {
      const fast = Math.round(Number(maFastInput));
      const slow = Math.round(Number(maSlowInput));
      if (
        !Number.isFinite(fast) ||
        !Number.isFinite(slow) ||
        fast < 2 ||
        slow < 3 ||
        fast >= slow ||
        slow > 500
      ) {
        setFormError("均线周期需满足 2 ≤ 快周期 < 慢周期 ≤ 500");
        return;
      }
      addRule({
        symbolId: selectedMeta.id,
        ticker: selectedMeta.ticker,
        symbolName: selectedMeta.name,
        pricePrecision: selectedMeta.pricePrecision,
        interval,
        condition,
        maFastPeriod: fast,
        maSlowPeriod: slow,
        frequency,
        note: noteInput,
      });
    } else if (isRsiAlertCondition(condition)) {
      const period = Math.round(Number(rsiPeriodInput));
      const val = Number(thresholdInput);
      if (!Number.isFinite(period) || period < 2 || period > 100) {
        setFormError("RSI 周期需在 2 ~ 100 之间");
        return;
      }
      if (!Number.isFinite(val) || val <= 0 || val >= 100) {
        setFormError("RSI 阈值需在 1 ~ 99 之间");
        return;
      }
      addRule({
        symbolId: selectedMeta.id,
        ticker: selectedMeta.ticker,
        symbolName: selectedMeta.name,
        pricePrecision: selectedMeta.pricePrecision,
        interval,
        condition,
        rsiPeriod: period,
        threshold: val,
        frequency,
        note: noteInput,
      });
    }

    setNoteInput("");
    onNotify(`已新建本地提醒：${selectedMeta.ticker} · ${ALERT_CONDITION_LABELS[condition]}`);
  };

  const handleRunManualCheck = async () => {
    setChecking(true);
    try {
      const res = await onManualCheckAll();
      setLastCheckDetails(res.detailsByRuleId);
      if (res.triggeredCount > 0) {
        onNotify(`检查完成：触发 ${res.triggeredCount} 条本地提醒`);
      } else if (res.checkedCount === 0 && res.skippedReplayCount > 0) {
        onNotify("当前处于回放模式且未开启「回放触发」，未检查提醒");
      } else if (res.checkedCount === 0) {
        onNotify("暂无已启用的提醒规则");
      } else {
        onNotify(`已检查 ${res.checkedCount} 条启用提醒，暂未达到触发条件`);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleToggleBrowserNotify = async () => {
    if (browserPermission === "unsupported") {
      onNotify("当前浏览器环境不支持桌面 Notification API");
      return;
    }
    if (browserPermission === "denied") {
      onNotify("浏览器已拒绝通知权限，请在浏览器地址栏站点设置中重新允许");
      return;
    }
    if (browserPermission === "default") {
      const res = await requestBrowserNotificationPermission();
      if (res === "granted") {
        onNotify("已开启浏览器桌面通知");
      } else {
        onNotify("未授予浏览器通知权限，仍将正常展示页内通知");
      }
      return;
    }
    updateSettings({
      browserNotificationEnabled: !settings.browserNotificationEnabled,
    });
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="tb-border flex h-[36px] shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5">
          <IconBell size={14} className="text-[var(--status-delayed)]" />
          <span className="text-[12px] font-semibold tb-text-primary">
            本地提醒
          </span>
          <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 text-[10px] tabular-nums tb-text-secondary">
            {enabledCount}/{rules.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={checking || enabledCount === 0}
            onClick={handleRunManualCheck}
            title="立即按当前已加载行情/K 线检查全部启用中的提醒"
            className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tb-text-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <IconRefresh size={11} className={checking ? "animate-spin" : ""} />
            <span>{checking ? "检查中" : "立即检查"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("rules");
              setFormOpen((v) => !v);
            }}
            className="flex items-center gap-0.5 rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            <IconPlus size={11} />
            <span>{formOpen ? "收起" : "新建"}</span>
          </button>
        </div>
      </div>

      {/* Prominent Mandatory Open-Page-Only Disclaimer */}
      <div
        role="note"
        className="shrink-0 border-b px-3 py-2 text-[11px] font-semibold leading-snug"
        style={{
          backgroundColor: "rgba(245, 158, 11, 0.14)",
          borderColor: "rgba(245, 158, 11, 0.35)",
          color: "var(--status-delayed)",
        }}
      >
        ⚠ {LOCAL_ALERTS_OPEN_PAGE_NOTICE}
      </div>

      {/* Segmented Tabs: Rules vs Notification Center */}
      <div className="tb-border flex shrink-0 items-center border-b px-2.5 py-1.5">
        <div
          className="grid w-full grid-cols-2 rounded p-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--bg-canvas)" }}
        >
          <button
            type="button"
            onClick={() => setTab("rules")}
            className={`rounded py-1 transition-colors cursor-pointer ${
              tab === "rules"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            提醒规则 ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex items-center justify-center gap-1 rounded py-1 transition-colors cursor-pointer ${
              tab === "history"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            <span>通知中心 ({history.length})</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#F2485B] px-1.5 text-[9px] font-bold text-white tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {tab === "rules" ? (
          <>
            {/* Compact Settings Strip */}
            <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="tb-text-secondary">浏览器桌面通知</span>
                <button
                  type="button"
                  onClick={handleToggleBrowserNotify}
                  className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                    browserPermission === "granted" &&
                    settings.browserNotificationEnabled
                      ? "bg-[var(--accent-primary)] text-white"
                      : "border tb-border-subtle tb-text-primary tb-hover"
                  }`}
                >
                  {browserPermission === "unsupported"
                    ? "不支持"
                    : browserPermission === "denied"
                    ? "已被拒绝"
                    : browserPermission === "default"
                    ? "点击授权开启"
                    : settings.browserNotificationEnabled
                    ? "已开启"
                    : "已关闭"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="tb-text-secondary">主图显示价格提醒线</span>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ showChartLines: !settings.showChartLines })
                  }
                  className={`rounded-full px-2 py-0.5 font-semibold cursor-pointer ${
                    settings.showChartLines
                      ? "bg-[#06B6D4] text-white"
                      : "border tb-border tb-text-muted"
                  }`}
                >
                  {settings.showChartLines ? "开" : "关"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className="tb-text-secondary"
                  title="默认回放模式下不触发提醒；开启后回放步进时会按当前回放可见 K 线检查触发"
                >
                  回放模式按回放价触发
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      triggerInReplayMode: !settings.triggerInReplayMode,
                    })
                  }
                  className={`rounded-full px-2 py-0.5 font-semibold cursor-pointer ${
                    settings.triggerInReplayMode
                      ? "bg-[var(--status-delayed)] text-[#0b0e14]"
                      : "border tb-border tb-text-muted"
                  }`}
                >
                  {settings.triggerInReplayMode ? "开" : "关（默认）"}
                </button>
              </div>
            </div>

            {/* Create New Alert Form */}
            {formOpen && (
              <form
                onSubmit={handleCreateRule}
                className="rounded border tb-border-subtle bg-[var(--bg-canvas)] p-2.5 space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold tb-text-primary">
                    新建本地提醒
                  </span>
                  <span className="text-[10px] tb-text-muted tabular-nums">
                    现价{" "}
                    {selectedQuote.last > 0
                      ? selectedQuote.last.toFixed(selectedMeta.pricePrecision)
                      : "—"}
                    {selectedQuote.prevClose > 0
                      ? ` · 前收 ${selectedQuote.prevClose.toFixed(
                          selectedMeta.pricePrecision
                        )}`
                      : ""}
                  </span>
                </div>

                {/* Symbol + Interval */}
                <div className="grid grid-cols-[1.4fr_0.9fr] gap-1.5">
                  <select
                    value={selectedMeta.id}
                    onChange={(e) => setSelectedSymbolId(e.target.value)}
                    aria-label="提醒品种"
                    className="tb-border-subtle rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
                  >
                    {watchlist.map((w) => (
                      <option key={w.symbol.id} value={w.symbol.id}>
                        {w.symbol.ticker} · {w.symbol.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={interval}
                    onChange={(e) => setIntervalVal(e.target.value as Interval)}
                    aria-label="提醒周期"
                    className="tb-border-subtle rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
                  >
                    {selectedMeta.supportedIntervals.map((intv) => (
                      <option key={intv} value={intv}>
                        {INTERVAL_LABELS[intv]} ({intv})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Condition Type */}
                <select
                  value={condition}
                  onChange={(e) =>
                    setCondition(e.target.value as AlertConditionType)
                  }
                  aria-label="提醒条件"
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
                >
                  {CONDITION_GROUPS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.items.map((cond) => (
                        <option key={cond} value={cond}>
                          {ALERT_CONDITION_LABELS[cond]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {/* Dynamic Condition Params */}
                {isPriceAlertCondition(condition) && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(e.target.value)}
                        placeholder="输入目标价格"
                        className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tabular-nums tb-text-primary outline-none focus:border-[var(--border-focus)]"
                      />
                      <span className="text-[10px] tb-text-muted shrink-0">
                        {selectedMeta.currency}
                      </span>
                    </div>
                    {selectedQuote.last > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        <span className="tb-text-muted">快捷：</span>
                        {[
                          { label: "-1%", factor: 0.99 },
                          { label: "现价", factor: 1 },
                          { label: "+1%", factor: 1.01 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              setThresholdInput(
                                (selectedQuote.last * preset.factor).toFixed(
                                  selectedMeta.pricePrecision
                                )
                              )
                            }
                            className="tb-hover rounded border tb-border px-1.5 py-0.2 tb-text-secondary cursor-pointer"
                          >
                            {preset.label}
                          </button>
                        ))}
                        {selectedQuote.prevClose > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setThresholdInput(
                                (
                                  (selectedQuote.last +
                                    selectedQuote.prevClose) /
                                  2
                                ).toFixed(selectedMeta.pricePrecision)
                              )
                            }
                            title="设为现价与前收中点，便于验证上下穿触发"
                            className="tb-hover rounded border tb-border px-1.5 py-0.2 text-[var(--accent-primary)] cursor-pointer"
                          >
                            中点
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isChangePctAlertCondition(condition) && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] tb-text-secondary shrink-0">
                      相对前收阈值
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tabular-nums tb-text-primary outline-none focus:border-[var(--border-focus)]"
                    />
                    <span className="text-[11px] tb-text-muted">%</span>
                  </div>
                )}

                {isMaAlertCondition(condition) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] tb-text-secondary shrink-0">
                        快线 MA
                      </span>
                      <input
                        type="number"
                        min={2}
                        max={250}
                        value={maFastInput}
                        onChange={(e) => setMaFastInput(e.target.value)}
                        className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tabular-nums tb-text-primary outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] tb-text-secondary shrink-0">
                        慢线 MA
                      </span>
                      <input
                        type="number"
                        min={3}
                        max={500}
                        value={maSlowInput}
                        onChange={(e) => setMaSlowInput(e.target.value)}
                        className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tabular-nums tb-text-primary outline-none"
                      />
                    </label>
                  </div>
                )}

                {isRsiAlertCondition(condition) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] tb-text-secondary shrink-0">
                        RSI 周期
                      </span>
                      <input
                        type="number"
                        min={2}
                        max={100}
                        value={rsiPeriodInput}
                        onChange={(e) => setRsiPeriodInput(e.target.value)}
                        className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tabular-nums tb-text-primary outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] tb-text-secondary shrink-0">
                        阈值
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        step="0.5"
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(e.target.value)}
                        className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-1.5 py-1 text-[11px] tabular-nums tb-text-primary outline-none"
                      />
                    </label>
                  </div>
                )}

                {/* Frequency + Note */}
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: "once" as const, label: "单次触发" },
                      { id: "once_per_bar" as const, label: "每根 K 线一次" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFrequency(opt.id)}
                      className={`rounded border py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                        frequency === opt.id
                          ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                          : "tb-border tb-text-secondary tb-hover"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  maxLength={120}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="备注（可选，例如：前高突破观察位）"
                  className="tb-border-subtle w-full rounded border bg-[var(--bg-input)] px-2 py-1 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-muted)]"
                />

                {formError && (
                  <div className="text-[10px] text-[#F2485B]">{formError}</div>
                )}

                <button
                  type="submit"
                  className="w-full rounded bg-[var(--accent-primary)] py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  创建提醒
                </button>
              </form>
            )}

            {/* Rules List */}
            {rules.length === 0 ? (
              <div className="rounded border tb-border bg-[var(--bg-canvas)] px-3 py-6 text-center text-[11px] tb-text-muted">
                暂无本地提醒规则。支持价格上下穿（主图画线）、涨跌幅、均线金叉/死叉与 RSI 阈值。
              </div>
            ) : (
              <div className="space-y-1.5">
                {rules.map((rule) => {
                  const isPrice = isPriceAlertCondition(rule.condition);
                  const checkDetail = lastCheckDetails[rule.id];
                  return (
                    <div
                      key={rule.id}
                      className={`rounded border p-2 text-[11px] transition-opacity ${
                        rule.enabled
                          ? "tb-border-subtle bg-[var(--bg-canvas)]"
                          : "tb-border bg-[var(--bg-canvas)] opacity-60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectSymbol(rule.symbolId)}
                          className="min-w-0 text-left cursor-pointer group"
                          title="点击切换主图到此品种"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold tb-text-primary group-hover:text-[var(--accent-primary)]">
                              {rule.ticker}
                            </span>
                            <span className="rounded bg-[var(--bg-elevated)] px-1 text-[9px] tb-text-secondary">
                              {rule.interval}
                            </span>
                            {isPrice && rule.enabled && (
                              <span
                                className="rounded px-1 text-[9px] font-medium"
                                style={{
                                  backgroundColor:
                                    rule.condition === "price_cross_above"
                                      ? "rgba(6, 182, 212, 0.16)"
                                      : "rgba(192, 132, 252, 0.16)",
                                  color:
                                    rule.condition === "price_cross_above"
                                      ? "#06B6D4"
                                      : "#C084FC",
                                }}
                              >
                                图上画线
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] font-medium tb-text-primary">
                            {formatAlertRuleSummary(rule)}
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleRuleEnabled(rule.id)}
                            title={rule.enabled ? "暂停此提醒" : "重新启用此提醒"}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer ${
                              rule.enabled
                                ? "bg-[rgba(16,185,129,0.16)] text-[#16B981]"
                                : "border tb-border-subtle tb-text-muted tb-hover"
                            }`}
                          >
                            {rule.enabled ? "运行中" : "已暂停"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRule(rule.id)}
                            title="删除提醒"
                            className="tb-hover rounded p-1 tb-text-muted hover:text-[#F2485B] cursor-pointer"
                          >
                            <IconTrash size={12} />
                          </button>
                        </div>
                      </div>

                      {rule.note && (
                        <div className="mt-1 text-[10px] tb-text-secondary truncate">
                          备注：{rule.note}
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center justify-between text-[10px] tb-text-muted">
                        <span>
                          {rule.frequency === "once" ? "单次触发" : "每根K线一次"} ·
                          已触发 {rule.triggeredCount} 次
                        </span>
                        <span className="tabular-nums">
                          {rule.lastTriggeredAt
                            ? formatDateTimeShort(rule.lastTriggeredAt)
                            : "未触发"}
                        </span>
                      </div>

                      {checkDetail && (
                        <div className="mt-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] tb-text-secondary tabular-nums">
                          最近检查：{checkDetail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Notification Center / Trigger History */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="tb-text-muted">
                记录保存在本地 localStorage（最多保留 200 条）
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="tb-hover rounded px-1.5 py-0.5 tb-text-muted hover:text-[#F2485B] cursor-pointer"
                >
                  清空历史
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="rounded border tb-border bg-[var(--bg-canvas)] px-3 py-8 text-center text-[11px] tb-text-muted">
                暂无提醒触发记录。可新建一条接近当前价的价格提醒并点击「立即检查」验证页内通知。
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectSymbol(ev.symbolId)}
                    className="tb-hover w-full rounded border tb-border bg-[var(--bg-canvas)] p-2 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[11px] font-semibold tb-text-primary truncate">
                        {ev.title}
                      </span>
                      <span
                        className="shrink-0 rounded px-1 text-[9px] font-medium"
                        style={{
                          backgroundColor:
                            ev.sourceMode === "replay"
                              ? "rgba(245, 158, 11, 0.16)"
                              : "var(--accent-soft)",
                          color:
                            ev.sourceMode === "replay"
                              ? "var(--status-delayed)"
                              : "var(--accent-primary)",
                        }}
                      >
                        {ev.sourceMode === "replay"
                          ? "回放"
                          : ev.sourceMode === "manual_check"
                          ? "手动检查"
                          : "行情"}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] leading-relaxed tb-text-secondary">
                      {ev.message}
                    </div>
                    <div className="mt-1 text-[9px] tb-text-muted tabular-nums">
                      {formatDateTimeShort(ev.triggeredAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
