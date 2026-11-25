"use client";

import React, { useMemo, useState } from "react";
import type {
  DataProvenance,
  MarketCategory,
  NormalizedQuote,
  SymbolMeta,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";
import { MARKET_GROUP_LABELS } from "@trade-buddy/shared-types";
import { IconChevronDown } from "@trade-buddy/ui-tokens";

const GROUP_ORDER: MarketCategory[] = ["US", "CN", "HK", "FUTURES_INDEX"];

interface WatchlistAndDetailsProps {
  watchlist: WatchlistSummaryItem[];
  activeSymbol: SymbolMeta;
  activeQuote: NormalizedQuote;
  activeProvenance: DataProvenance;
  onSelectSymbol: (symbolId: string) => void;
}

function formatVolume(vol: number): string {
  if (!vol || vol <= 0) return "—";
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(1)}万`;
  return String(Math.round(vol));
}

function ProvenanceMicroBadge({ provenance }: { provenance: DataProvenance }) {
  if (provenance.isProxy) {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1 text-[9px] font-semibold"
        style={{
          backgroundColor: "rgba(168, 85, 247, 0.16)",
          color: "var(--status-proxy)",
        }}
      >
        代理
      </span>
    );
  }
  if (provenance.kind === "official_fred") {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1 text-[9px] font-semibold"
        style={{
          backgroundColor: "rgba(56, 189, 248, 0.16)",
          color: "var(--status-iex)",
        }}
      >
        FRED
      </span>
    );
  }
  return (
    <span
      title={provenance.delayNote}
      className="rounded px-1 text-[9px] font-semibold"
      style={{
        backgroundColor: "rgba(100, 116, 139, 0.22)",
        color: "var(--text-secondary)",
      }}
    >
      {provenance.isSample ? "样本" : "EOD"}
    </span>
  );
}

export function WatchlistAndDetails({
  watchlist,
  activeSymbol,
  activeQuote,
  activeProvenance,
  onSelectSymbol,
}: WatchlistAndDetailsProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<MarketCategory, boolean>
  >({
    US: false,
    CN: false,
    HK: false,
    FUTURES_INDEX: false,
  });

  const grouped = useMemo(() => {
    const map: Record<MarketCategory, WatchlistSummaryItem[]> = {
      US: [],
      CN: [],
      HK: [],
      FUTURES_INDEX: [],
    };
    for (const item of watchlist) {
      map[item.symbol.market].push(item);
    }
    return map;
  }, [watchlist]);

  const toggleGroup = (g: MarketCategory) => {
    setCollapsedGroups((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  const isUp = activeQuote.change >= 0;
  const range52wSpan = Math.max(activeQuote.high52w - activeQuote.low52w, 0.0001);
  const range52wPct = Math.min(
    100,
    Math.max(0, ((activeQuote.last - activeQuote.low52w) / range52wSpan) * 100)
  );

  const perfItems: Array<{ label: string; value?: number }> = [
    { label: "1周", value: activeQuote.perf.w1 },
    { label: "1月", value: activeQuote.perf.m1 },
    { label: "3月", value: activeQuote.perf.m3 },
    { label: "6月", value: activeQuote.perf.m6 },
    { label: "1年", value: activeQuote.perf.y1 },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top Half: Watchlist */}
      <div className="flex min-h-0 flex-[1.2] flex-col overflow-hidden">
        {/* Header */}
        <div className="tb-border flex h-[34px] shrink-0 items-center justify-between border-b px-3">
          <span className="text-[12px] font-semibold tb-text-primary">
            自选列表
          </span>
          <span className="text-[10px] tb-text-muted">4 大核心市场</span>
        </div>

        {/* Column Header */}
        <div className="tb-border grid grid-cols-[1.25fr_0.75fr_0.65fr_0.7fr] border-b px-3 py-1 text-[10px] font-medium tb-text-muted">
          <span>品种</span>
          <span className="text-right">最新</span>
          <span className="text-right">涨跌</span>
          <span className="text-right">涨幅</span>
        </div>

        {/* Grouped Rows */}
        <div className="flex-1 overflow-y-auto">
          {GROUP_ORDER.map((marketKey) => {
            const rows = grouped[marketKey];
            const collapsed = collapsedGroups[marketKey];
            return (
              <div key={marketKey}>
                <button
                  type="button"
                  onClick={() => toggleGroup(marketKey)}
                  className="tb-hover flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold tb-text-secondary cursor-pointer"
                >
                  <span className="flex items-center gap-1">
                    <IconChevronDown
                      size={12}
                      className={`transition-transform ${
                        collapsed ? "-rotate-90" : ""
                      }`}
                    />
                    <span>{MARKET_GROUP_LABELS[marketKey]}</span>
                  </span>
                  <span className="tabular-nums text-[10px] tb-text-muted">
                    {rows.length}
                  </span>
                </button>

                {!collapsed &&
                  rows.map((item) => {
                    const selected = item.symbol.id === activeSymbol.id;
                    const rowUp = item.quote.change >= 0;
                    const prec = item.symbol.pricePrecision;
                    return (
                      <button
                        key={item.symbol.id}
                        type="button"
                        onClick={() => onSelectSymbol(item.symbol.id)}
                        className={`grid w-full grid-cols-[1.25fr_0.75fr_0.65fr_0.7fr] items-center px-3 py-1.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? "bg-[var(--accent-soft)] border-l-2 border-l-[var(--accent-primary)] pl-[10px]"
                            : "tb-hover"
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-[12px] tb-text-primary truncate">
                              {item.symbol.ticker}
                            </span>
                            <ProvenanceMicroBadge provenance={item.provenance} />
                          </div>
                          <div className="truncate text-[10px] tb-text-muted">
                            {item.symbol.name}
                          </div>
                        </div>

                        <div className="tabular-nums text-right text-[12px] font-medium tb-text-primary">
                          {item.quote.last.toFixed(prec)}
                        </div>
                        <div
                          className={`tabular-nums text-right text-[11px] ${
                            rowUp ? "tb-up" : "tb-down"
                          }`}
                        >
                          {rowUp ? "+" : ""}
                          {item.quote.change.toFixed(prec)}
                        </div>
                        <div
                          className={`tabular-nums text-right text-[11px] font-medium ${
                            rowUp ? "tb-up" : "tb-down"
                          }`}
                        >
                          {rowUp ? "+" : ""}
                          {item.quote.changePercent.toFixed(2)}%
                        </div>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Half: Active Symbol Details Card */}
      <div className="tb-border flex min-h-0 flex-1 flex-col overflow-y-auto border-t p-3">
        {/* Title Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold tb-text-primary">
                {activeSymbol.ticker}
              </span>
              <span
                className="rounded px-1.5 py-0.2 text-[10px] font-medium tb-text-secondary"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                {activeSymbol.exchange}
              </span>
            </div>
            <div className="truncate text-[11px] tb-text-secondary mt-0.5">
              {activeSymbol.name}
              {activeSymbol.nameEn ? ` · ${activeSymbol.nameEn}` : ""}
            </div>
          </div>
          <span className="text-[10px] tb-text-muted shrink-0">
            {activeSymbol.currency}
          </span>
        </div>

        {/* Big Price + Change */}
        <div className="mt-2 flex items-baseline gap-2 tabular-nums">
          <span className="text-[22px] font-bold tracking-tight tb-text-primary">
            {activeQuote.last.toFixed(activeSymbol.pricePrecision)}
          </span>
          <span
            className={`text-[12px] font-semibold ${isUp ? "tb-up" : "tb-down"}`}
          >
            {isUp ? "+" : ""}
            {activeQuote.change.toFixed(activeSymbol.pricePrecision)} (
            {isUp ? "+" : ""}
            {activeQuote.changePercent.toFixed(2)}%)
          </span>
        </div>

        {/* Honest Provenance Strip */}
        <div
          className="mt-2 rounded border tb-border px-2 py-1.5 text-[10px] leading-snug"
          style={{ backgroundColor: "var(--bg-canvas)" }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-[var(--status-iex)]">
              {activeProvenance.badge}
            </span>
            <span className="tabular-nums tb-text-muted">
              截止 {activeQuote.updatedAt || "—"}
            </span>
          </div>
          <div className="tb-text-muted mt-0.5">{activeProvenance.provider}</div>
          {activeProvenance.dateRange && (
            <div className="tb-text-muted tabular-nums">
              区间：{activeProvenance.dateRange}
            </div>
          )}
        </div>

        {/* Key Stats Grid */}
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="tb-text-muted">今开</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.open.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">昨收</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.prevClose.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">最高</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.high.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">最低</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.low.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="tb-text-muted">最新成交量</span>
            <span className="tabular-nums tb-text-primary">
              {formatVolume(activeQuote.volume)}
            </span>
          </div>
        </div>

        {/* 52-Week Range Bar */}
        <div className="mt-2.5">
          <div className="flex justify-between text-[10px] tb-text-muted tabular-nums">
            <span>52周低 {activeQuote.low52w.toFixed(activeSymbol.pricePrecision)}</span>
            <span>52周高 {activeQuote.high52w.toFixed(activeSymbol.pricePrecision)}</span>
          </div>
          <div className="relative mt-1 h-1.5 w-full rounded-full bg-[var(--bg-active)]">
            <div
              className="absolute top-0 h-1.5 rounded-full bg-[var(--accent-primary)]"
              style={{ width: `${range52wPct}%` }}
            />
          </div>
        </div>

        {/* Performance Tiles */}
        <div className="mt-3 grid grid-cols-5 gap-1">
          {perfItems.map((p) => {
            const hasVal = typeof p.value === "number";
            const pos = (p.value ?? 0) >= 0;
            return (
              <div
                key={p.label}
                className={`rounded px-1 py-1 text-center tabular-nums ${
                  hasVal
                    ? pos
                      ? "tb-up-bg"
                      : "tb-down-bg"
                    : "bg-[var(--bg-elevated)] tb-text-muted"
                }`}
              >
                <div className="text-[9px] opacity-80">{p.label}</div>
                <div className="text-[10px] font-semibold">
                  {hasVal ? `${pos ? "+" : ""}${p.value!.toFixed(1)}%` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
