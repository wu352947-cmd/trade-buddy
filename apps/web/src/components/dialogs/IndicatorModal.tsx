"use client";

import React, { useMemo, useState } from "react";
import type { IndicatorId } from "@trade-buddy/shared-types";
import { BUILTIN_INDICATORS } from "@trade-buddy/shared-types";
import { IconClose, IconSearch } from "@trade-buddy/ui-tokens";

interface IndicatorModalProps {
  open: boolean;
  activeIndicators: IndicatorId[];
  onToggleIndicator: (id: IndicatorId) => void;
  onClose: () => void;
}

export function IndicatorModal({
  open,
  activeIndicators,
  onToggleIndicator,
  onClose,
}: IndicatorModalProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "main" | "sub">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BUILTIN_INDICATORS.filter((ind) => {
      if (tab !== "all" && ind.placement !== tab) return false;
      if (!q) return true;
      return (
        ind.id.toLowerCase().includes(q) ||
        ind.name.toLowerCase().includes(q) ||
        ind.description.toLowerCase().includes(q)
      );
    });
  }, [query, tab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tb-elevated tb-border-subtle flex w-full max-w-[540px] flex-col overflow-hidden rounded-lg border shadow-2xl">
        {/* Header */}
        <div className="tb-border flex items-center justify-between border-b px-4 py-3">
          <span className="text-[14px] font-semibold tb-text-primary">
            技术指标（内置核心指标）
          </span>
          <button
            type="button"
            onClick={onClose}
            className="tb-hover rounded p-1 tb-text-secondary cursor-pointer"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Search + Placement Filter */}
        <div className="tb-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex flex-1 items-center gap-2 rounded bg-[var(--bg-input)] px-2.5 py-1.5 border tb-border-subtle">
            <IconSearch size={14} className="tb-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 MA / EMA / BOLL / RSI / MACD..."
              className="w-full bg-transparent text-[12px] tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ["all", "全部"],
                ["main", "主图"],
                ["sub", "副图"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${
                  tab === k
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-text-secondary tb-hover"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Indicator List */}
        <div className="divide-y divide-[var(--border-hairline)] max-h-[340px] overflow-y-auto">
          {filtered.map((ind) => {
            const active = activeIndicators.includes(ind.id);
            return (
              <div
                key={ind.id}
                onClick={() => onToggleIndicator(ind.id)}
                className="tb-hover flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[13px] tb-text-primary">
                      {ind.name}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.2 text-[10px] font-medium"
                      style={{
                        backgroundColor:
                          ind.placement === "main"
                            ? "var(--accent-soft)"
                            : "var(--bg-active)",
                        color:
                          ind.placement === "main"
                            ? "var(--accent-primary)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {ind.placement === "main" ? "主图叠加" : "副图面板"}
                    </span>
                  </div>
                  <div className="text-[11px] tb-text-muted mt-0.5">
                    {ind.description} · 默认参数 ({ind.defaultParams})
                  </div>
                </div>

                <button
                  type="button"
                  className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "bg-[var(--accent-primary)] text-white"
                      : "tb-border-subtle border tb-text-secondary hover:text-[var(--text-primary)]"
                  }`}
                >
                  {active ? "已开启" : "添加"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="tb-border tb-panel flex items-center justify-between border-t px-4 py-2 text-[11px] tb-text-muted">
          <span>点击指标行即可实时开启或关闭（均由 KLineChart 本地计算渲染）</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
