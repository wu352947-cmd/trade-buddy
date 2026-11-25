"use client";

import React from "react";
import type {
  DataProvenance,
  DrawnOverlayRecord,
  IndicatorId,
  Interval,
  NormalizedBar,
  SymbolMeta,
} from "@trade-buddy/shared-types";
import { BUILTIN_INDICATORS } from "@trade-buddy/shared-types";
import { IconClose, IconTrash } from "@trade-buddy/ui-tokens";

interface DataWindowAndTreeProps {
  mode: "data" | "tree";
  onChangeMode: (mode: "data" | "tree") => void;
  symbol: SymbolMeta;
  interval: Interval;
  provenance: DataProvenance;
  hoveredBar: NormalizedBar | null;
  prevBarClose: number | null;
  activeIndicators: IndicatorId[];
  drawings: DrawnOverlayRecord[];
  onRemoveIndicator: (id: IndicatorId) => void;
  onRemoveDrawing: (id: string) => void;
  onClearDrawings: () => void;
}

function formatDate(ts: number, interval: Interval): string {
  const dt = new Date(ts);
  if (interval === "60m") {
    return dt.toISOString().slice(0, 16).replace("T", " ");
  }
  return dt.toISOString().slice(0, 10);
}

function formatVol(vol: number): string {
  if (!vol) return "—";
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(1)}万`;
  return String(Math.round(vol));
}

export function DataWindowAndTree({
  mode,
  onChangeMode,
  symbol,
  interval,
  provenance,
  hoveredBar,
  prevBarClose,
  activeIndicators,
  drawings,
  onRemoveIndicator,
  onRemoveDrawing,
  onClearDrawings,
}: DataWindowAndTreeProps) {
  const prec = symbol.pricePrecision;
  const bar = hoveredBar;
  const refClose = prevBarClose ?? bar?.open ?? 0;
  const chg = bar ? bar.close - refClose : 0;
  const chgPct = bar && refClose > 0 ? (chg / refClose) * 100 : 0;
  const isUp = chg >= 0;

  const mainInds = activeIndicators.filter((id) =>
    ["MA", "EMA", "BOLL"].includes(id)
  );
  const subInds = activeIndicators.filter((id) =>
    ["VOL", "RSI", "MACD"].includes(id)
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Segmented Toggle Header */}
      <div className="tb-border flex h-[38px] shrink-0 items-center justify-center border-b px-2.5">
        <div
          className="grid w-full grid-cols-2 rounded p-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--bg-canvas)" }}
        >
          <button
            type="button"
            onClick={() => onChangeMode("data")}
            className={`rounded py-1 transition-colors cursor-pointer ${
              mode === "data"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            数据窗口
          </button>
          <button
            type="button"
            onClick={() => onChangeMode("tree")}
            className={`rounded py-1 transition-colors cursor-pointer ${
              mode === "tree"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            对象树 ({activeIndicators.length + drawings.length})
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 text-[12px]">
        {mode === "data" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] tb-text-muted">
              <span>日期 / 时间</span>
              <span className="tabular-nums tb-text-primary font-medium">
                {bar ? formatDate(bar.timestamp, interval) : "移动光标查看"}
              </span>
            </div>

            <div className="tb-border border-t pt-2.5">
              <div className="mb-2 text-[11px] font-semibold tb-text-primary">
                {symbol.ticker} · {interval} · {symbol.exchange}
              </div>
              <div className="space-y-1.5 text-[12px]">
                {(
                  [
                    ["开盘 (Open)", bar ? bar.open.toFixed(prec) : "—"],
                    ["最高 (High)", bar ? bar.high.toFixed(prec) : "—"],
                    ["最低 (Low)", bar ? bar.low.toFixed(prec) : "—"],
                    ["收盘 (Close)", bar ? bar.close.toFixed(prec) : "—"],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="tb-text-secondary">{label}</span>
                    <span
                      className={`tabular-nums font-medium ${
                        bar ? (isUp ? "tb-up" : "tb-down") : "tb-text-muted"
                      }`}
                    >
                      {val}
                    </span>
                  </div>
                ))}

                <div className="flex justify-between">
                  <span className="tb-text-secondary">涨跌 (Change)</span>
                  <span
                    className={`tabular-nums font-medium ${
                      bar ? (isUp ? "tb-up" : "tb-down") : "tb-text-muted"
                    }`}
                  >
                    {bar
                      ? `${isUp ? "+" : ""}${chg.toFixed(prec)} (${
                          isUp ? "+" : ""
                        }${chgPct.toFixed(2)}%)`
                      : "—"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="tb-text-secondary">成交量 (Vol)</span>
                  <span className="tabular-nums font-medium tb-text-primary">
                    {bar ? formatVol(bar.volume) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Active Indicators Summary */}
            <div className="tb-border border-t pt-2.5">
              <div className="mb-1.5 text-[11px] font-semibold tb-text-primary">
                当前开启指标
              </div>
              <div className="space-y-1">
                {activeIndicators.map((indId) => {
                  const meta = BUILTIN_INDICATORS.find((b) => b.id === indId);
                  return (
                    <div
                      key={indId}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="tb-text-secondary">
                        {meta?.shortName ?? indId}
                      </span>
                      <span className="tabular-nums tb-text-muted">
                        ({meta?.defaultParams})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Provenance Box */}
            <div className="tb-border border-t pt-2.5 text-[11px]">
              <div className="font-semibold tb-text-primary mb-1">
                数据来源与延迟
              </div>
              <div className="tb-text-secondary">{provenance.provider}</div>
              <div className="tb-text-muted mt-0.5 leading-relaxed">
                {provenance.delayNote}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Main Pane Group */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tb-text-muted uppercase tracking-wider">
                主图窗格 ({symbol.ticker})
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between rounded px-2 py-1.5 bg-[var(--bg-canvas)] text-[12px]">
                  <span className="tb-text-primary font-medium">
                    K 线主图 ({symbol.ticker})
                  </span>
                  <span className="text-[10px] tb-text-muted">主序列</span>
                </div>

                {mainInds.map((indId) => (
                  <div
                    key={indId}
                    className="tb-hover flex items-center justify-between rounded px-2 py-1.5 text-[12px]"
                  >
                    <span className="tb-text-primary">{indId} 指标</span>
                    <button
                      type="button"
                      onClick={() => onRemoveIndicator(indId)}
                      title={`关闭 ${indId}`}
                      className="tb-text-muted hover:text-[#F2485B] cursor-pointer"
                    >
                      <IconClose size={13} />
                    </button>
                  </div>
                ))}

                {drawings.map((d) => (
                  <div
                    key={d.id}
                    className="tb-hover flex items-center justify-between rounded px-2 py-1.5 text-[12px]"
                  >
                    <span className="tb-text-secondary truncate">
                      画线 · {d.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveDrawing(d.id)}
                      title="删除此画线"
                      className="tb-text-muted hover:text-[#F2485B] cursor-pointer"
                    >
                      <IconClose size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub Panes Group */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tb-text-muted uppercase tracking-wider">
                副图指标窗格
              </div>
              {subInds.length === 0 ? (
                <div className="text-[11px] tb-text-muted px-2">
                  无开启的副图指标
                </div>
              ) : (
                <div className="space-y-1">
                  {subInds.map((indId) => (
                    <div
                      key={indId}
                      className="tb-hover flex items-center justify-between rounded px-2 py-1.5 text-[12px]"
                    >
                      <span className="tb-text-primary">{indId} 副图</span>
                      <button
                        type="button"
                        onClick={() => onRemoveIndicator(indId)}
                        title={`关闭 ${indId}`}
                        className="tb-text-muted hover:text-[#F2485B] cursor-pointer"
                      >
                        <IconClose size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {drawings.length > 0 && (
              <button
                type="button"
                onClick={onClearDrawings}
                className="tb-border-subtle flex w-full items-center justify-center gap-1.5 rounded border py-1.5 text-[11px] tb-text-secondary hover:text-[#F2485B] cursor-pointer"
              >
                <IconTrash size={13} />
                <span>清空全部 {drawings.length} 条画线</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
