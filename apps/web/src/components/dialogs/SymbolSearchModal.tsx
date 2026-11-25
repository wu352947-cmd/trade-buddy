"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketCategory,
  WatchlistGroup,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";
import { MARKET_GROUP_LABELS } from "@trade-buddy/shared-types";
import {
  IconCheck,
  IconClose,
  IconPlus,
  IconSearch,
} from "@trade-buddy/ui-tokens";

interface SymbolSearchModalProps {
  open: boolean;
  initialQuery?: string;
  items: WatchlistSummaryItem[];
  currentSymbolId: string;
  watchlistGroups?: WatchlistGroup[];
  initialTargetGroupId?: string | null;
  onToggleSymbolInGroup?: (groupId: string, symbolId: string) => void;
  onSelect: (symbolId: string) => void;
  onClose: () => void;
}

const FILTER_TABS: Array<{ id: "ALL" | MarketCategory; label: string }> = [
  { id: "ALL", label: "全部" },
  { id: "US", label: MARKET_GROUP_LABELS.US },
  { id: "CN", label: MARKET_GROUP_LABELS.CN },
  { id: "HK", label: MARKET_GROUP_LABELS.HK },
  { id: "FUTURES_INDEX", label: MARKET_GROUP_LABELS.FUTURES_INDEX },
];

export function SymbolSearchModal({
  open,
  initialQuery = "",
  items,
  currentSymbolId,
  watchlistGroups = [],
  initialTargetGroupId = null,
  onToggleSymbolInGroup,
  onSelect,
  onClose,
}: SymbolSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [marketFilter, setMarketFilter] = useState<"ALL" | MarketCategory>("ALL");
  const [targetGroupId, setTargetGroupId] = useState<string>("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setHighlightIdx(0);
      const preferred =
        initialTargetGroupId &&
        watchlistGroups.some((g) => g.id === initialTargetGroupId)
          ? initialTargetGroupId
          : watchlistGroups[0]?.id ?? "";
      setTargetGroupId(preferred);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open, initialQuery, initialTargetGroupId, watchlistGroups]);

  const activeTargetGroup = useMemo(
    () => watchlistGroups.find((g) => g.id === targetGroupId) ?? watchlistGroups[0] ?? null,
    [watchlistGroups, targetGroupId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (marketFilter !== "ALL" && item.symbol.market !== marketFilter) {
        return false;
      }
      if (!q) return true;
      const s = item.symbol;
      return (
        s.ticker.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.nameEn?.toLowerCase().includes(q) ?? false) ||
        (s.sector?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, marketFilter]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, marketFilter]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && filtered[highlightIdx]) {
      e.preventDefault();
      onSelect(filtered[highlightIdx].symbol.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tb-elevated tb-border-subtle flex w-full max-w-[640px] flex-col overflow-hidden rounded-lg border shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header / Search input */}
        <div className="tb-border flex items-center gap-2.5 border-b px-4 py-3">
          <IconSearch size={17} className="tb-text-secondary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索代码或中英文名称（如 AAPL、600519、腾讯、QQQ、SP500）..."
            className="w-full bg-transparent text-[14px] tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={onClose}
            className="tb-hover rounded p-1 tb-text-secondary cursor-pointer"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Market Filter Pills + Target Watchlist Group Picker */}
        <div className="tb-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex items-center gap-1.5">
            {FILTER_TABS.map((tab) => {
              const active = marketFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMarketFilter(tab.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--accent-primary)] text-white"
                      : "tb-text-secondary tb-hover"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {onToggleSymbolInGroup && watchlistGroups.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="tb-text-muted">加入分组：</span>
              <select
                value={activeTargetGroup?.id ?? ""}
                onChange={(e) => setTargetGroupId(e.target.value)}
                aria-label="选择目标自选分组"
                className="tb-border-subtle rounded border bg-[var(--bg-input)] px-2 py-0.5 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
              >
                {watchlistGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.symbolIds.length})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--border-hairline)]">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px] tb-text-muted">
              未找到匹配的内置品种，请尝试输入 AAPL、600519、00700 或 SP500
            </div>
          ) : (
            filtered.map((item, idx) => {
              const s = item.symbol;
              const isSelected = s.id === currentSymbolId;
              const isHighlighted = idx === highlightIdx;
              const isUp = item.quote.change >= 0;
              const isInTargetGroup = Boolean(
                activeTargetGroup?.symbolIds.includes(s.id)
              );
              return (
                <div
                  key={s.id}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(s.id);
                      onClose();
                    }
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors cursor-pointer ${
                    isHighlighted ? "bg-[var(--bg-hover)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: "var(--bg-active)",
                        color: "var(--accent-primary)",
                      }}
                    >
                      {s.market === "FUTURES_INDEX" ? "IDX" : s.market}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] tb-text-primary">
                          {s.ticker}
                        </span>
                        <span className="text-[12px] tb-text-secondary truncate">
                          {s.name}
                        </span>
                        {s.nameEn && (
                          <span className="text-[11px] tb-text-muted truncate hidden sm:inline">
                            {s.nameEn}
                          </span>
                        )}
                        {isSelected && (
                          <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10px] text-[var(--accent-primary)]">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] tb-text-muted">
                        {s.sector} · {item.provenance.badge}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right tabular-nums">
                      <div className="text-[12px] font-medium tb-text-primary">
                        {item.quote.last > 0
                          ? item.quote.last.toFixed(s.pricePrecision)
                          : "—"}
                      </div>
                      <div
                        className={`text-[11px] ${
                          item.quote.last > 0
                            ? isUp
                              ? "tb-up"
                              : "tb-down"
                            : "tb-text-muted"
                        }`}
                      >
                        {item.quote.last > 0
                          ? `${isUp ? "+" : ""}${item.quote.changePercent.toFixed(2)}%`
                          : "联网加载"}
                      </div>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium tb-text-secondary"
                      style={{ backgroundColor: "var(--bg-panel)" }}
                    >
                      {s.exchange}
                    </span>
                    {onToggleSymbolInGroup && activeTargetGroup && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSymbolInGroup(activeTargetGroup.id, s.id);
                        }}
                        title={
                          isInTargetGroup
                            ? `从「${activeTargetGroup.name}」移除`
                            : `加入「${activeTargetGroup.name}」`
                        }
                        className={`flex items-center gap-0.5 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                          isInTargetGroup
                            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                            : "tb-border-subtle tb-text-secondary hover:text-[var(--text-primary)] tb-hover"
                        }`}
                      >
                        {isInTargetGroup ? (
                          <>
                            <IconCheck size={11} />
                            <span>已加入</span>
                          </>
                        ) : (
                          <>
                            <IconPlus size={11} />
                            <span>自选</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer tip */}
        <div className="tb-border tb-panel flex items-center justify-between border-t px-4 py-1.5 text-[11px] tb-text-muted">
          <span>↑↓ 选择 · Enter 切换主图 · Esc 关闭</span>
          <span>内置 {items.length} 个四大市场核心研究品种</span>
        </div>
      </div>
    </div>
  );
}
