"use client";

import React, { useMemo, useState } from "react";
import type { PaperEquityPoint } from "@trade-buddy/shared-types";

interface PaperEquityChartProps {
  series: PaperEquityPoint[];
  initialCash: number;
}

function fmtMoneyShort(val: number): string {
  if (!Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
}

function fmtMoneyFull(val: number): string {
  if (!Number.isFinite(val)) return "—";
  return val.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtTimeCompact(iso: string): string {
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

export function PaperEquityChart({
  series,
  initialCash,
}: PaperEquityChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 560;
  const height = 128;
  const padLeft = 58;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 20;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const geometry = useMemo(() => {
    const pts =
      series.length > 0
        ? series
        : [
            {
              timestamp: Date.now(),
              recordedAt: new Date().toISOString(),
              equity: initialCash,
              cash: initialCash,
              marketValue: 0,
              realizedPnl: 0,
              totalFees: 0,
              reason: "init" as const,
              label: "账户初始化",
            },
          ];

    let minVal = initialCash;
    let maxVal = initialCash;
    let peak = pts[0].equity;
    const drawdowns: number[] = [];

    for (const p of pts) {
      if (p.equity < minVal) minVal = p.equity;
      if (p.equity > maxVal) maxVal = p.equity;
      if (p.equity > peak) peak = p.equity;
      drawdowns.push(peak > 0 ? ((peak - p.equity) / peak) * 100 : 0);
    }

    const span = maxVal - minVal;
    const padVal = span > 1e-6 ? span * 0.14 : Math.max(initialCash * 0.01, 100);
    const yMin = minVal - padVal;
    const yMax = maxVal + padVal;
    const ySpan = Math.max(yMax - yMin, 1e-6);

    const toX = (idx: number) =>
      pts.length <= 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (pts.length - 1)) * plotW;
    const toY = (val: number) =>
      padTop + ((yMax - val) / ySpan) * plotH;

    const coords = pts.map((p, idx) => ({
      x: toX(idx),
      y: toY(p.equity),
      point: p,
      ddPct: drawdowns[idx],
    }));

    const linePath =
      coords.length === 1
        ? `M ${padLeft} ${coords[0].y} L ${padLeft + plotW} ${coords[0].y}`
        : coords
            .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
            .join(" ");

    const baselineY = toY(initialCash);
    const areaPath =
      coords.length === 1
        ? ""
        : `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${(
            padTop + plotH
          ).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padTop + plotH).toFixed(
            2
          )} Z`;

    const lastEquity = pts[pts.length - 1].equity;
    const isProfit = lastEquity >= initialCash - 1e-6;

    return {
      coords,
      linePath,
      areaPath,
      baselineY,
      yMin,
      yMax,
      isProfit,
    };
  }, [series, initialCash, plotW, plotH]);

  const activeItem =
    hoverIndex !== null && geometry.coords[hoverIndex]
      ? geometry.coords[hoverIndex]
      : geometry.coords[geometry.coords.length - 1];

  const strokeColor = geometry.isProfit
    ? "var(--market-up)"
    : "var(--market-down)";
  const fillColor = geometry.isProfit
    ? "var(--market-up-soft)"
    : "var(--market-down-soft)";

  const activeRetPct =
    initialCash > 0
      ? ((activeItem.point.equity - initialCash) / initialCash) * 100
      : 0;

  return (
    <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold tb-text-primary">虚拟权益曲线</span>
          <span className="tb-text-muted tabular-nums">
            ({series.length} 个采样点)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span className="tb-text-muted">
            {activeItem.point.label || fmtTimeCompact(activeItem.point.recordedAt)}
          </span>
          <span className="font-semibold tb-text-primary">
            权益 {fmtMoneyFull(activeItem.point.equity)}
          </span>
          <span
            className={
              activeRetPct >= 0 ? "tb-up font-medium" : "tb-down font-medium"
            }
          >
            {activeRetPct >= 0 ? "+" : ""}
            {activeRetPct.toFixed(2)}%
          </span>
          {activeItem.ddPct > 0.005 && (
            <span className="tb-down">
              回撤 -{activeItem.ddPct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[124px] w-full select-none"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            if (geometry.coords.length <= 1) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const ratio = Math.max(
              0,
              Math.min(1, (relX - padLeft) / Math.max(plotW, 1))
            );
            const idx = Math.round(ratio * (geometry.coords.length - 1));
            setHoverIndex(idx);
          }}
        >
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((t) => {
            const y = padTop + t * plotH;
            const val =
              geometry.yMax - t * (geometry.yMax - geometry.yMin);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="var(--text-muted)"
                >
                  {fmtMoneyShort(val)}
                </text>
              </g>
            );
          })}

          {/* Initial cash baseline */}
          <line
            x1={padLeft}
            y1={geometry.baselineY}
            x2={padLeft + plotW}
            y2={geometry.baselineY}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />

          {/* Area fill */}
          {geometry.areaPath && (
            <path d={geometry.areaPath} fill={fillColor} opacity={0.65} />
          )}

          {/* Equity line */}
          <path
            d={geometry.linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Highlight fill event points (up to 60 markers to stay crisp) */}
          {geometry.coords.length <= 80 &&
            geometry.coords.map((c, idx) =>
              c.point.reason === "fill" ? (
                <circle
                  key={`${c.point.recordedAt}-${idx}`}
                  cx={c.x}
                  cy={c.y}
                  r={2.4}
                  fill={strokeColor}
                  stroke="var(--bg-canvas)"
                  strokeWidth={1}
                />
              ) : null
            )}

          {/* Hover vertical guide & active dot */}
          {hoverIndex !== null && geometry.coords[hoverIndex] && (
            <g>
              <line
                x1={geometry.coords[hoverIndex].x}
                y1={padTop}
                x2={geometry.coords[hoverIndex].x}
                y2={padTop + plotH}
                stroke="var(--chart-crosshair)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle
                cx={geometry.coords[hoverIndex].x}
                cy={geometry.coords[hoverIndex].y}
                r={3.8}
                fill={strokeColor}
                stroke="var(--bg-canvas)"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* X-axis start / end labels */}
          {geometry.coords.length > 0 && (
            <>
              <text
                x={padLeft}
                y={height - 4}
                textAnchor="start"
                fontSize="9"
                fill="var(--text-muted)"
              >
                起点 {fmtTimeCompact(geometry.coords[0].point.recordedAt)}
              </text>
              <text
                x={padLeft + plotW}
                y={height - 4}
                textAnchor="end"
                fontSize="9"
                fill="var(--text-muted)"
              >
                {geometry.coords.length > 1
                  ? `最新 ${fmtTimeCompact(
                      geometry.coords[geometry.coords.length - 1].point
                        .recordedAt
                    )}`
                  : "完成首笔成交后自动展开曲线"}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
