"use client";

import React, { useMemo, useState } from "react";
import type { BacktestEquityPoint, Interval } from "@trade-buddy/shared-types";
import { formatBarTimestamp } from "@/lib/chart-sync";

interface BacktestEquityChartProps {
  series: BacktestEquityPoint[];
  initialCash: number;
  interval: Interval;
}

function fmtMoneyShort(val: number): string {
  if (!Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toFixed(0);
}

function fmtMoneyFull(val: number): string {
  if (!Number.isFinite(val)) return "—";
  return val.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function BacktestEquityChart({
  series,
  initialCash,
  interval,
}: BacktestEquityChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 620;
  const height = 148;
  const padLeft = 58;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const geometry = useMemo(() => {
    if (series.length === 0) return null;

    let minVal = initialCash;
    let maxVal = initialCash;
    for (const pt of series) {
      if (pt.equity < minVal) minVal = pt.equity;
      if (pt.equity > maxVal) maxVal = pt.equity;
      if (pt.benchmarkEquity < minVal) minVal = pt.benchmarkEquity;
      if (pt.benchmarkEquity > maxVal) maxVal = pt.benchmarkEquity;
    }

    const span = maxVal - minVal;
    const padVal =
      span > 1e-6 ? span * 0.12 : Math.max(initialCash * 0.02, 100);
    const yMin = minVal - padVal;
    const yMax = maxVal + padVal;
    const ySpan = Math.max(yMax - yMin, 1e-6);

    const toX = (idx: number) =>
      series.length <= 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (series.length - 1)) * plotW;
    const toY = (val: number) => padTop + ((yMax - val) / ySpan) * plotH;

    const coords = series.map((pt, idx) => ({
      x: toX(idx),
      stratY: toY(pt.equity),
      benchY: toY(pt.benchmarkEquity),
      point: pt,
    }));

    const stratPath =
      coords.length === 1
        ? `M ${padLeft} ${coords[0].stratY} L ${padLeft + plotW} ${coords[0].stratY}`
        : coords
            .map(
              (c, i) =>
                `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.stratY.toFixed(2)}`
            )
            .join(" ");

    const benchPath =
      coords.length === 1
        ? `M ${padLeft} ${coords[0].benchY} L ${padLeft + plotW} ${coords[0].benchY}`
        : coords
            .map(
              (c, i) =>
                `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.benchY.toFixed(2)}`
            )
            .join(" ");

    const stratAreaPath =
      coords.length <= 1
        ? ""
        : `${stratPath} L ${coords[coords.length - 1].x.toFixed(2)} ${(
            padTop + plotH
          ).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(padTop + plotH).toFixed(
            2
          )} Z`;

    const last = series[series.length - 1];
    const isProfit = last.equity >= initialCash - 1e-6;

    return {
      coords,
      stratPath,
      benchPath,
      stratAreaPath,
      baselineY: toY(initialCash),
      yMin,
      yMax,
      isProfit,
    };
  }, [series, initialCash, plotW, plotH]);

  if (!geometry) {
    return (
      <div className="rounded border tb-border bg-[var(--bg-canvas)] p-4 text-center text-[11px] tb-text-muted">
        暂无足够 K 线数据生成权益曲线
      </div>
    );
  }

  const active =
    hoverIndex !== null && geometry.coords[hoverIndex]
      ? geometry.coords[hoverIndex]
      : geometry.coords[geometry.coords.length - 1];

  const stratRetPct =
    initialCash > 0
      ? ((active.point.equity - initialCash) / initialCash) * 100
      : 0;
  const benchRetPct =
    initialCash > 0
      ? ((active.point.benchmarkEquity - initialCash) / initialCash) * 100
      : 0;
  const excessPct = stratRetPct - benchRetPct;

  const stratStroke = "#38BDF8";
  const stratFill = "rgba(56, 189, 248, 0.12)";
  const benchStroke = "#F59E0B";

  return (
    <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-3">
          <span className="font-semibold tb-text-primary">
            权益曲线 vs 买入持有基准
          </span>
          <span className="inline-flex items-center gap-1 tb-text-secondary">
            <span
              className="inline-block h-[2px] w-3 rounded"
              style={{ backgroundColor: stratStroke }}
            />
            策略权益
          </span>
          <span className="inline-flex items-center gap-1 tb-text-secondary">
            <span
              className="inline-block h-0 w-3 border-t border-dashed"
              style={{ borderColor: benchStroke }}
            />
            买入持有
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span className="tb-text-muted">
            {formatBarTimestamp(active.point.timestamp, interval)}
          </span>
          <span className="font-semibold" style={{ color: stratStroke }}>
            策略 {fmtMoneyFull(active.point.equity)} ({stratRetPct >= 0 ? "+" : ""}
            {stratRetPct.toFixed(2)}%)
          </span>
          <span className="font-medium" style={{ color: benchStroke }}>
            基准 {fmtMoneyFull(active.point.benchmarkEquity)} (
            {benchRetPct >= 0 ? "+" : ""}
            {benchRetPct.toFixed(2)}%)
          </span>
          <span
            className={
              excessPct >= 0 ? "tb-up font-medium" : "tb-down font-medium"
            }
          >
            超额 {excessPct >= 0 ? "+" : ""}
            {excessPct.toFixed(2)}%
          </span>
          {active.point.drawdownPct > 0.005 && (
            <span className="tb-down">
              回撤 -{active.point.drawdownPct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[144px] w-full select-none"
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
            const val = geometry.yMax - t * (geometry.yMax - geometry.yMin);
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
            strokeDasharray="2 3"
            opacity={0.65}
          />

          {/* Strategy area fill */}
          {geometry.stratAreaPath && (
            <path d={geometry.stratAreaPath} fill={stratFill} />
          )}

          {/* Buy & Hold benchmark line (dashed amber) */}
          <path
            d={geometry.benchPath}
            fill="none"
            stroke={benchStroke}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            opacity={0.9}
          />

          {/* Strategy equity line (solid sky-blue) */}
          <path
            d={geometry.stratPath}
            fill="none"
            stroke={stratStroke}
            strokeWidth={1.9}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hover vertical guide & dual dots */}
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
                cy={geometry.coords[hoverIndex].benchY}
                r={3.2}
                fill={benchStroke}
                stroke="var(--bg-canvas)"
                strokeWidth={1.2}
              />
              <circle
                cx={geometry.coords[hoverIndex].x}
                cy={geometry.coords[hoverIndex].stratY}
                r={3.8}
                fill={stratStroke}
                stroke="var(--bg-canvas)"
                strokeWidth={1.4}
              />
            </g>
          )}

          {/* X-axis start / end labels */}
          <text
            x={padLeft}
            y={height - 5}
            textAnchor="start"
            fontSize="9"
            fill="var(--text-muted)"
          >
            {formatBarTimestamp(series[0].timestamp, interval)}
          </text>
          <text
            x={padLeft + plotW}
            y={height - 5}
            textAnchor="end"
            fontSize="9"
            fill="var(--text-muted)"
          >
            {formatBarTimestamp(series[series.length - 1].timestamp, interval)}（
            {series.length} 根）
          </text>
        </svg>
      </div>
    </div>
  );
}
