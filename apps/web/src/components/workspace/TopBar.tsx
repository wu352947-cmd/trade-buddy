"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ChartType,
  ColorScheme,
  IndicatorId,
  Interval,
  LayoutMode,
  LayoutSyncConfig,
  SymbolMeta,
  ThemeMode,
  WorkspaceTemplate,
} from "@trade-buddy/shared-types";
import { INTERVAL_LABELS } from "@trade-buddy/shared-types";
import { WorkspaceTemplateMenu } from "./WorkspaceTemplateMenu";
import {
  IconAreaChart,
  IconBarsOHLC,
  IconBell,
  IconCandles,
  IconChevronDown,
  IconHollowCandles,
  IconIndicators,
  IconLayoutGrid4,
  IconLayoutSingle,
  IconLayoutSplitH,
  IconLayoutSplitV,
  IconLineChart,
  IconLink,
  IconMoon,
  IconReplay,
  IconScreener,
  IconSearch,
  IconSettings,
  IconShield,
  IconSun,
  TradeBuddyLogo,
} from "@trade-buddy/ui-tokens";

const ALL_INTERVALS: Interval[] = ["60m", "1D", "1W", "1M"];

const CHART_TYPES: Array<{
  id: ChartType;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "candle_solid", label: "K 线（实心）", icon: <IconCandles size={15} /> },
  {
    id: "candle_stroke",
    label: "空心 K 线",
    icon: <IconHollowCandles size={15} />,
  },
  { id: "ohlc", label: "美国线 (OHLC)", icon: <IconBarsOHLC size={15} /> },
  { id: "line", label: "折线图", icon: <IconLineChart size={15} /> },
  { id: "area", label: "面积图", icon: <IconAreaChart size={15} /> },
];

const LAYOUT_OPTIONS: Array<{
  id: LayoutMode;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}> = [
  {
    id: "single",
    label: "单图",
    shortLabel: "单图",
    icon: <IconLayoutSingle size={15} />,
  },
  {
    id: "split_h",
    label: "左右 2 图",
    shortLabel: "左右2图",
    icon: <IconLayoutSplitH size={15} />,
  },
  {
    id: "split_v",
    label: "上下 2 图",
    shortLabel: "上下2图",
    icon: <IconLayoutSplitV size={15} />,
  },
  {
    id: "grid_2x2",
    label: "2×2 四图",
    shortLabel: "4宫格",
    icon: <IconLayoutGrid4 size={15} />,
  },
];

interface TopBarProps {
  symbol: SymbolMeta;
  interval: Interval;
  chartType: ChartType;
  activeIndicators: IndicatorId[];
  colorScheme: ColorScheme;
  theme: ThemeMode;
  layout: LayoutMode;
  syncConfig: LayoutSyncConfig;
  replayActive: boolean;
  activePaneBadge?: string | null;
  templates: WorkspaceTemplate[];
  activeTemplateId: string | null;
  alertUnreadCount?: number;
  onSaveNewTemplate: (name: string) => void;
  onApplyTemplate: (template: WorkspaceTemplate) => void;
  onOverwriteTemplate: (templateId: string) => void;
  onRenameTemplate: (templateId: string, nextName: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onExportSingleTemplate: (template: WorkspaceTemplate) => void;
  onExportAllTemplates: () => void;
  onImportTemplatesJson: (rawText: string) => { ok: boolean; error?: string };
  onOpenAlerts: () => void;
  onOpenSearch: () => void;
  onChangeInterval: (interval: Interval) => void;
  onChangeChartType: (chartType: ChartType) => void;
  onOpenIndicators: () => void;
  onChangeLayout: (layout: LayoutMode) => void;
  onToggleSync: (key: keyof LayoutSyncConfig) => void;
  onToggleReplay: () => void;
  onOpenScreener: () => void;
  onToggleColorScheme: () => void;
  onToggleTheme: () => void;
}

export function TopBar({
  symbol,
  interval,
  chartType,
  activeIndicators,
  colorScheme,
  theme,
  layout,
  syncConfig,
  replayActive,
  activePaneBadge,
  templates,
  activeTemplateId,
  alertUnreadCount = 0,
  onSaveNewTemplate,
  onApplyTemplate,
  onOverwriteTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onExportSingleTemplate,
  onExportAllTemplates,
  onImportTemplatesJson,
  onOpenAlerts,
  onOpenSearch,
  onChangeInterval,
  onChangeChartType,
  onOpenIndicators,
  onChangeLayout,
  onToggleSync,
  onToggleReplay,
  onOpenScreener,
  onToggleColorScheme,
  onToggleTheme,
}: TopBarProps) {
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setChartTypeMenuOpen(false);
      }
      if (
        layoutMenuRef.current &&
        !layoutMenuRef.current.contains(e.target as Node)
      ) {
        setLayoutMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const currentChartType =
    CHART_TYPES.find((c) => c.id === chartType) ?? CHART_TYPES[0];
  const currentLayout =
    LAYOUT_OPTIONS.find((l) => l.id === layout) ?? LAYOUT_OPTIONS[0];
  const activeSyncCount =
    Number(syncConfig.symbol) +
    Number(syncConfig.interval) +
    Number(syncConfig.crosshair);

  return (
    <header className="tb-panel tb-border flex h-[40px] shrink-0 items-center justify-between border-b px-2.5 text-[12px]">
      {/* Left group: Brand + Symbol + Interval + Chart Type + Indicators */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-2 border-r tb-border shrink-0">
          <TradeBuddyLogo size={22} />
          <span className="font-semibold tracking-tight text-[13px] tb-text-primary hidden xl:inline">
            Trade Buddy
          </span>
        </div>

        {/* Symbol Search Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          title="切换或搜索品种（作用于当前活动图；支持直接敲击键盘字母/数字唤起）"
          className="tb-hover flex items-center gap-1.5 rounded px-2 py-1 text-left transition-colors cursor-pointer"
        >
          <IconSearch size={14} className="tb-text-secondary shrink-0" />
          {activePaneBadge && (
            <span
              className="rounded px-1 py-0.2 text-[10px] font-semibold"
              style={{
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent-primary)",
              }}
            >
              {activePaneBadge}
            </span>
          )}
          <span className="font-semibold text-[13px] tb-text-primary tracking-wide">
            {symbol.ticker}
          </span>
          <span className="tb-text-secondary truncate max-w-[120px] hidden xl:inline">
            {symbol.name}
          </span>
          <span
            className="rounded px-1 py-0.5 text-[10px] font-medium tb-text-muted"
            style={{ backgroundColor: "var(--bg-elevated)" }}
          >
            {symbol.exchange}
          </span>
        </button>

        <div className="h-4 w-px tb-border bg-[var(--border-hairline)] mx-0.5" />

        {/* Intervals */}
        <div className="flex items-center gap-0.5" role="group" aria-label="周期切换">
          {ALL_INTERVALS.map((intv) => {
            const supported = symbol.supportedIntervals.includes(intv);
            const active = interval === intv;
            return (
              <button
                key={intv}
                type="button"
                disabled={!supported}
                onClick={() => supported && onChangeInterval(intv)}
                title={
                  supported
                    ? `切换至 ${INTERVAL_LABELS[intv]}`
                    : "当前品种仅提供日线/周线/月线样本（无免费盘中分钟线）"
                }
                className={`rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                  active
                    ? "text-[var(--accent-primary)] bg-[var(--accent-soft)]"
                    : supported
                    ? "tb-text-secondary tb-hover cursor-pointer"
                    : "tb-text-muted opacity-40 cursor-not-allowed"
                }`}
              >
                {intv}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5" />

        {/* Chart Type Picker */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setChartTypeMenuOpen((v) => !v)}
            title="切换图表类型"
            className="tb-hover flex items-center gap-1.5 rounded px-2 py-1 tb-text-primary transition-colors cursor-pointer"
          >
            {currentChartType.icon}
            <span className="hidden lg:inline text-[12px]">
              {currentChartType.label}
            </span>
            <IconChevronDown size={13} className="tb-text-secondary" />
          </button>

          {chartTypeMenuOpen && (
            <div className="tb-elevated tb-border-subtle absolute left-0 top-[34px] z-40 w-44 rounded-md border py-1 shadow-xl">
              {CHART_TYPES.map((item) => {
                const selected = item.id === chartType;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChangeChartType(item.id);
                      setChartTypeMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer ${
                      selected
                        ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium"
                        : "tb-text-primary tb-hover"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5" />

        {/* Indicators Button */}
        <button
          type="button"
          onClick={onOpenIndicators}
          title="打开技术指标菜单（作用于活动图，快捷键 /）"
          className="tb-hover flex items-center gap-1.5 rounded px-2 py-1 tb-text-primary transition-colors cursor-pointer"
        >
          <IconIndicators size={15} className="text-[var(--accent-primary)]" />
          <span>指标</span>
          <span
            className="tabular-nums rounded-full px-1.5 py-0.2 text-[10px] font-semibold"
            style={{
              backgroundColor: "var(--accent-soft)",
              color: "var(--accent-primary)",
            }}
          >
            {activeIndicators.length}
          </span>
        </button>

        <div className="h-4 w-px bg-[var(--border-hairline)] mx-0.5" />

        {/* Bar Replay Toggle */}
        <button
          type="button"
          onClick={onToggleReplay}
          title={
            replayActive
              ? "退出 K 线回放模式并恢复全部 K 线"
              : "开启 K 线回放（按可见前缀重算指标，无未来函数）"
          }
          className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
            replayActive
              ? "bg-[rgba(245,158,11,0.18)] text-[var(--status-delayed)]"
              : "tb-hover tb-text-primary"
          }`}
        >
          <IconReplay size={15} />
          <span>回放</span>
        </button>

        {/* Screener Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenScreener}
          title="打开选股筛选器（按市场、涨跌幅、价格、成交量、MA20/MA60 筛选排序并切换活动图）"
          className="tb-hover flex items-center gap-1.5 rounded px-2 py-1 font-medium tb-text-primary transition-colors cursor-pointer"
        >
          <IconScreener size={14} className="text-[var(--accent-primary)]" />
          <span>筛选器</span>
        </button>

        {/* Local Alerts Quick Trigger */}
        <button
          type="button"
          onClick={onOpenAlerts}
          title="打开本地提醒面板（仅本页面打开时生效）"
          className="tb-hover relative flex items-center gap-1 rounded px-2 py-1 font-medium tb-text-primary transition-colors cursor-pointer"
        >
          <IconBell size={14} className="text-[var(--status-delayed)]" />
          <span className="hidden xl:inline">提醒</span>
          {alertUnreadCount > 0 && (
            <span className="rounded-full bg-[#F2485B] px-1 text-[9px] font-bold text-white tabular-nums">
              {alertUnreadCount > 9 ? "9+" : alertUnreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Right group: Layout & Sync + Workspace Templates + Color Scheme + Theme + Settings */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Workspace Templates Menu */}
        <WorkspaceTemplateMenu
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSaveNew={onSaveNewTemplate}
          onApplyTemplate={onApplyTemplate}
          onOverwriteTemplate={onOverwriteTemplate}
          onRenameTemplate={onRenameTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onExportSingle={onExportSingleTemplate}
          onExportAll={onExportAllTemplates}
          onImportJsonText={onImportTemplatesJson}
        />

        {/* Multi-Chart Layout & Link Menu */}
        <div className="relative" ref={layoutMenuRef}>
          <button
            type="button"
            onClick={() => setLayoutMenuOpen((v) => !v)}
            title="切换多图布局（单图 / 左右2图 / 上下2图 / 4宫格）及品种/周期/光标联动开关"
            className={`tb-border-subtle flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
              layout !== "single"
                ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                : "tb-hover tb-text-primary"
            }`}
          >
            {currentLayout.icon}
            <span className="hidden md:inline">{currentLayout.shortLabel}</span>
            {layout !== "single" && (
              <span
                className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] tabular-nums"
                style={{ backgroundColor: "rgba(59, 130, 246, 0.16)" }}
                title={`已开启 ${activeSyncCount}/3 项全局联动`}
              >
                <IconLink size={10} />
                {activeSyncCount}
              </span>
            )}
            <IconChevronDown size={12} className="opacity-75" />
          </button>

          {layoutMenuOpen && (
            <div className="tb-elevated tb-border-subtle absolute right-0 top-[34px] z-50 w-64 rounded-md border p-2.5 shadow-2xl">
              <div className="mb-1.5 text-[11px] font-semibold tb-text-secondary">
                多图宫格布局
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUT_OPTIONS.map((opt) => {
                  const selected = opt.id === layout;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeLayout(opt.id);
                      }}
                      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer ${
                        selected
                          ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                          : "tb-border tb-text-primary tb-hover"
                      }`}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="my-2.5 h-px bg-[var(--border-hairline)]" />

              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold tb-text-secondary">
                  全局联动开关
                </span>
                <span className="text-[10px] tb-text-muted">
                  {activeSyncCount}/3 已开启
                </span>
              </div>

              <div className="space-y-1">
                {(
                  [
                    {
                      key: "symbol" as const,
                      label: "品种联动",
                      desc: "在已联动图表间同步切换品种",
                    },
                    {
                      key: "interval" as const,
                      label: "周期联动",
                      desc: "在已联动图表间同步切换周期",
                    },
                    {
                      key: "crosshair" as const,
                      label: "十字光标联动",
                      desc: "按时间戳对齐光标（无则落最近）",
                    },
                  ] as const
                ).map((item) => {
                  const enabled = syncConfig[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onToggleSync(item.key)}
                      className="tb-hover flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium tb-text-primary">
                          {item.label}
                        </div>
                        <div className="text-[10px] tb-text-muted truncate">
                          {item.desc}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          enabled
                            ? "bg-[var(--accent-primary)] text-white"
                            : "bg-[var(--bg-canvas)] tb-text-muted border tb-border"
                        }`}
                      >
                        {enabled ? "开" : "关"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 rounded bg-[var(--bg-canvas)] px-2 py-1.5 text-[10px] leading-relaxed tb-text-muted">
                多图模式下，可在每个宫格顶栏单独点击「品种 / 周期 / 光标」解除或恢复该图联动。
              </div>
            </div>
          )}
        </div>
        {/* Intl / CN Color Scheme Toggle */}
        <button
          type="button"
          onClick={onToggleColorScheme}
          title="一键切换涨跌配色（默认国际绿涨红跌 / 可切 A 股红涨绿跌）"
          className="tb-hover tb-border-subtle flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium tb-text-primary transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-0.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--market-up)" }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "var(--market-down)" }}
            />
          </span>
          <span>{colorScheme === "intl" ? "绿涨红跌" : "红涨绿跌"}</span>
        </button>

        {/* Theme Mode Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
          className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-1 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          <span className="hidden xl:inline">
            {theme === "dark" ? "浅色" : "深色"}
          </span>
        </button>

        {/* Settings Page Entry */}
        <Link
          href="/settings"
          title="打开设置页（数据源布尔状态、外观配色与默认市场偏好）"
          className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-1 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] transition-colors"
        >
          <IconSettings size={14} />
          <span className="hidden xl:inline">设置</span>
        </Link>

        {/* Minor-protection Research-only Compliance Tag */}
        <div
          title="Trade Buddy 仅用于行情学习、图表分析与研究复盘，严禁任何真实交易、券商下单或杠杆功能"
          className="hidden lg:flex items-center gap-1 rounded px-2 py-1 text-[11px] tb-text-secondary"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          <IconShield size={13} className="text-[#16B981]" />
          <span>仅研究 · 无实盘</span>
        </div>
      </div>
    </header>
  );
}
