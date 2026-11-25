"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  ChartType,
  ColorScheme,
  IndicatorId,
  Interval,
  SymbolMeta,
  ThemeMode,
} from "@trade-buddy/shared-types";
import { INTERVAL_LABELS } from "@trade-buddy/shared-types";
import {
  IconAreaChart,
  IconBarsOHLC,
  IconCandles,
  IconChevronDown,
  IconHollowCandles,
  IconIndicators,
  IconLineChart,
  IconMoon,
  IconSearch,
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

interface TopBarProps {
  symbol: SymbolMeta;
  interval: Interval;
  chartType: ChartType;
  activeIndicators: IndicatorId[];
  colorScheme: ColorScheme;
  theme: ThemeMode;
  onOpenSearch: () => void;
  onChangeInterval: (interval: Interval) => void;
  onChangeChartType: (chartType: ChartType) => void;
  onOpenIndicators: () => void;
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
  onOpenSearch,
  onChangeInterval,
  onChangeChartType,
  onOpenIndicators,
  onToggleColorScheme,
  onToggleTheme,
}: TopBarProps) {
  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setChartTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const currentChartType =
    CHART_TYPES.find((c) => c.id === chartType) ?? CHART_TYPES[0];

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
          title="切换或搜索品种（支持直接敲击键盘字母/数字唤起）"
          className="tb-hover flex items-center gap-2 rounded px-2 py-1 text-left transition-colors cursor-pointer"
        >
          <IconSearch size={14} className="tb-text-secondary shrink-0" />
          <span className="font-semibold text-[13px] tb-text-primary tracking-wide">
            {symbol.ticker}
          </span>
          <span className="tb-text-secondary truncate max-w-[140px] hidden md:inline">
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
          title="打开技术指标菜单（快捷键 /）"
          className="tb-hover flex items-center gap-1.5 rounded px-2.5 py-1 tb-text-primary transition-colors cursor-pointer"
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
      </div>

      {/* Right group: Color Scheme + Theme + Research Compliance Badge */}
      <div className="flex items-center gap-1.5 shrink-0">
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
