"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  Chart,
  Crosshair,
  DeepPartial,
  Period,
  Styles,
} from "klinecharts";
import type {
  ChartType,
  ColorScheme,
  DataProvenance,
  DrawingToolId,
  DrawnOverlayRecord,
  IndicatorId,
  Interval,
  NormalizedBar,
  SymbolMeta,
  ThemeMode,
} from "@trade-buddy/shared-types";
import { getChartPalette, IconClose } from "@trade-buddy/ui-tokens";

export interface KLineChartHandle {
  startDrawing: (
    tool: DrawingToolId,
    magnet: boolean,
    annotationText?: string
  ) => void;
  removeOverlayById: (id: string) => void;
  clearAllOverlays: () => void;
  fitRange: (barCount: number | "all") => void;
}

interface KLineChartStageProps {
  symbol: SymbolMeta;
  interval: Interval;
  bars: NormalizedBar[];
  provenance: DataProvenance;
  loading: boolean;
  theme: ThemeMode;
  colorScheme: ColorScheme;
  chartType: ChartType;
  activeIndicators: IndicatorId[];
  activeTool: DrawingToolId;
  annotationText: string;
  onChangeAnnotationText: (val: string) => void;
  onCancelDrawingTool: () => void;
  onCrosshairChange: (bar: NormalizedBar | null, prevClose: number | null) => void;
  onOverlayCreated: (record: DrawnOverlayRecord) => void;
  onRemoveIndicator: (id: IndicatorId) => void;
}

const TOOL_TO_OVERLAY: Partial<
  Record<DrawingToolId, { name: string; label: string; hint: string }>
> = {
  trendline: {
    name: "segment",
    label: "趋势线",
    hint: "请在主图依次点击起点与终点（Esc 返回光标）",
  },
  horizontal: {
    name: "horizontalStraightLine",
    label: "水平线",
    hint: "请在主图点击目标价位放置水平线",
  },
  ray: {
    name: "rayLine",
    label: "射线",
    hint: "请在主图依次点击起点与方向点",
  },
  channel: {
    name: "parallelStraightLine",
    label: "平行通道",
    hint: "请在主图依次点击 3 个点确定平行通道",
  },
  rectangle: {
    name: "tbRect",
    label: "矩形区域",
    hint: "请在主图点击左上与右下角绘制支撑/阻力区",
  },
  fibonacci: {
    name: "fibonacciLine",
    label: "斐波那契回撤",
    hint: "请在主图依次点击波段高点与低点",
  },
  text: {
    name: "simpleAnnotation",
    label: "文字标注",
    hint: "输入注释文本后点击主图任意位置放置",
  },
};

function toKlinePeriod(interval: Interval): Period {
  switch (interval) {
    case "60m":
      return { span: 1, type: "hour" };
    case "1W":
      return { span: 1, type: "week" };
    case "1M":
      return { span: 1, type: "month" };
    case "1D":
    default:
      return { span: 1, type: "day" };
  }
}

function buildChartStyles(
  theme: ThemeMode,
  colorScheme: ColorScheme,
  chartType: ChartType
): DeepPartial<Styles> {
  const p = getChartPalette(theme, colorScheme);
  const isLine = chartType === "line";
  const klineCandleType =
    chartType === "line" ? "area" : chartType;

  return {
    grid: {
      show: true,
      horizontal: {
        show: true,
        size: 1,
        color: p.gridColor,
        style: "dashed",
        dashedValue: [3, 3],
      },
      vertical: {
        show: true,
        size: 1,
        color: p.gridColor,
        style: "dashed",
        dashedValue: [3, 3],
      },
    },
    candle: {
      type: klineCandleType,
      bar: {
        compareRule: "current_open",
        upColor: p.upColor,
        downColor: p.downColor,
        noChangeColor: p.noChangeColor,
        upBorderColor: p.upColor,
        downBorderColor: p.downColor,
        noChangeBorderColor: p.noChangeColor,
        upWickColor: p.upColor,
        downWickColor: p.downColor,
        noChangeWickColor: p.noChangeColor,
      },
      area: {
        lineSize: 2,
        lineColor: p.areaLineColor,
        value: "close",
        smooth: false,
        backgroundColor: isLine
          ? "transparent"
          : [
              { offset: 0, color: p.areaTopColor },
              { offset: 1, color: p.areaBottomColor },
            ],
        point: {
          show: false,
        },
      },
      priceMark: {
        show: true,
        high: {
          show: true,
          color: p.axisTickTextColor,
          textSize: 10,
        },
        low: {
          show: true,
          color: p.axisTickTextColor,
          textSize: 10,
        },
        last: {
          show: true,
          upColor: p.upColor,
          downColor: p.downColor,
          noChangeColor: p.noChangeColor,
          line: {
            show: true,
            style: "dashed",
            dashedValue: [4, 4],
            size: 1,
          },
          text: {
            show: true,
            size: 11,
            paddingLeft: 5,
            paddingTop: 3,
            paddingRight: 5,
            paddingBottom: 3,
            color: "#FFFFFF",
            borderRadius: 2,
          },
        },
      },
      tooltip: {
        showRule: "none",
      },
    },
    indicator: {
      ohlc: {
        upColor: p.upVolColor,
        downColor: p.downVolColor,
        noChangeColor: p.noChangeColor,
      },
      bars: [
        {
          style: "fill",
          borderStyle: "solid",
          borderSize: 1,
          borderDashedValue: [2, 2],
          upColor: p.upVolColor,
          downColor: p.downVolColor,
          noChangeColor: p.noChangeColor,
        },
      ],
      lines: [
        { style: "solid", smooth: false, size: 1.3, dashedValue: [2, 2], color: p.indColors[0] },
        { style: "solid", smooth: false, size: 1.3, dashedValue: [2, 2], color: p.indColors[1] },
        { style: "solid", smooth: false, size: 1.3, dashedValue: [2, 2], color: p.indColors[2] },
        { style: "solid", smooth: false, size: 1.3, dashedValue: [2, 2], color: p.indColors[3] },
      ],
      tooltip: {
        showRule: "always",
        showType: "standard",
        offsetTop: 32,
        offsetLeft: 10,
        title: {
          show: true,
          size: 11,
          color: p.tooltipTextColor,
          showName: true,
          showParams: true,
        },
        legend: {
          size: 11,
          color: p.tooltipTextColor,
        },
      },
    },
    xAxis: {
      show: true,
      axisLine: { show: true, color: p.axisLineColor, size: 1 },
      tickLine: { show: true, size: 1, length: 3, color: p.axisLineColor },
      tickText: { show: true, color: p.axisTickTextColor, size: 11 },
    },
    yAxis: {
      show: true,
      axisLine: { show: true, color: p.axisLineColor, size: 1 },
      tickLine: { show: true, size: 1, length: 3, color: p.axisLineColor },
      tickText: { show: true, color: p.axisTickTextColor, size: 11 },
    },
    separator: {
      size: 1,
      color: p.axisLineColor,
      fill: true,
      activeBackgroundColor: "rgba(59, 130, 246, 0.25)",
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: {
          show: true,
          style: "dashed",
          dashedValue: [4, 2],
          size: 1,
          color: p.crosshairLineColor,
        },
        text: {
          show: true,
          size: 11,
          color: p.crosshairLabelText,
          backgroundColor: p.crosshairLabelBg,
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 3,
          paddingBottom: 3,
        },
      },
      vertical: {
        show: true,
        line: {
          show: true,
          style: "dashed",
          dashedValue: [4, 2],
          size: 1,
          color: p.crosshairLineColor,
        },
        text: {
          show: true,
          size: 11,
          color: p.crosshairLabelText,
          backgroundColor: p.crosshairLabelBg,
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 3,
          paddingBottom: 3,
        },
      },
    },
    overlay: {
      line: {
        style: "solid",
        smooth: false,
        color: "#3B82F6",
        size: 1.5,
        dashedValue: [3, 3],
      },
      polygon: {
        style: "stroke_fill",
        color: "rgba(59, 130, 246, 0.14)",
        borderColor: "#3B82F6",
        borderSize: 1.5,
        borderStyle: "solid",
        borderDashedValue: [2, 2],
      },
      text: {
        style: "fill",
        color: "#E6EDF7",
        size: 11,
        backgroundColor: "rgba(30, 41, 59, 0.9)",
        borderColor: "#3B82F6",
        borderSize: 1,
        borderRadius: 3,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 3,
        paddingBottom: 3,
      },
    },
  };
}

function formatVolShort(v: number): string {
  if (!v) return "—";
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v));
}

export const KLineChartStage = forwardRef<KLineChartHandle, KLineChartStageProps>(
  function KLineChartStage(
    {
      symbol,
      interval,
      bars,
      provenance,
      loading,
      theme,
      colorScheme,
      chartType,
      activeIndicators,
      activeTool,
      annotationText,
      onChangeAnnotationText,
      onCancelDrawingTool,
      onCrosshairChange,
      onOverlayCreated,
      onRemoveIndicator,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<Chart | null>(null);
    const barsRef = useRef<NormalizedBar[]>(bars);
    const indicatorIdsRef = useRef<
      Partial<Record<IndicatorId, { id: string; paneId: string }>>
    >({});
    const [ready, setReady] = useState(false);
    const [pctScale, setPctScale] = useState(false);
    const [clock, setClock] = useState("");
    const [hoverBar, setHoverBar] = useState<NormalizedBar | null>(null);
    const [hoverPrevClose, setHoverPrevClose] = useState<number | null>(null);

    const onCrosshairRef = useRef(onCrosshairChange);
    onCrosshairRef.current = onCrosshairChange;
    const onOverlayCreatedRef = useRef(onOverlayCreated);
    onOverlayCreatedRef.current = onOverlayCreated;
    const onCancelToolRef = useRef(onCancelDrawingTool);
    onCancelToolRef.current = onCancelDrawingTool;

    barsRef.current = bars;

    // Live UTC+8 clock
    useEffect(() => {
      const update = () => {
        setClock(
          new Date().toLocaleTimeString("zh-CN", {
            hour12: false,
            timeZone: "Asia/Shanghai",
          })
        );
      };
      update();
      const t = setInterval(update, 1000);
      return () => clearInterval(t);
    }, []);

    // Initialize KLineChart v10 client-side only
    useEffect(() => {
      let disposed = false;
      let disposeFn: ((c: Chart) => void) | null = null;
      let observer: ResizeObserver | null = null;

      async function boot() {
        const el = containerRef.current;
        if (!el) return;
        const kc = await import("klinecharts");
        if (disposed || !containerRef.current) return;

        // Register custom Trade Buddy Rectangle overlay once
        if (!kc.getSupportedOverlays().includes("tbRect")) {
          kc.registerOverlay({
            name: "tbRect",
            totalStep: 3,
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: true,
            needDefaultYAxisFigure: true,
            createPointFigures: ({ coordinates }) => {
              if (coordinates.length === 2) {
                const [p1, p2] = coordinates;
                return [
                  {
                    type: "polygon",
                    attrs: {
                      coordinates: [
                        { x: p1.x, y: p1.y },
                        { x: p2.x, y: p1.y },
                        { x: p2.x, y: p2.y },
                        { x: p1.x, y: p2.y },
                      ],
                    },
                    styles: {
                      style: "stroke_fill",
                      color: "rgba(168, 85, 247, 0.14)",
                      borderColor: "#A855F7",
                      borderSize: 1.5,
                    },
                  },
                ];
              }
              return [];
            },
          });
        }

        const chart = kc.init(containerRef.current, {
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          styles: buildChartStyles(theme, colorScheme, chartType),
          layout: {
            yAxis: {
              position: "right",
              inside: false,
            },
          },
        });
        if (!chart) return;

        chartRef.current = chart;
        disposeFn = kc.dispose;

        chart.setDataLoader({
          getBars: ({ callback }) => {
            callback(barsRef.current, false);
          },
        });

        chart.setOffsetRightDistance(48);

        chart.subscribeAction("onCrosshairChange", (payload) => {
          const ch = payload as Crosshair | undefined;
          if (ch?.kLineData) {
            const idx = ch.dataIndex ?? -1;
            const prev =
              idx > 0 ? barsRef.current[idx - 1]?.close ?? null : null;
            const b: NormalizedBar = {
              timestamp: ch.kLineData.timestamp,
              open: ch.kLineData.open,
              high: ch.kLineData.high,
              low: ch.kLineData.low,
              close: ch.kLineData.close,
              volume: ch.kLineData.volume ?? 0,
            };
            setHoverBar(b);
            setHoverPrevClose(prev);
            onCrosshairRef.current(b, prev);
          } else {
            setHoverBar(null);
            setHoverPrevClose(null);
            onCrosshairRef.current(null, null);
          }
        });

        observer = new ResizeObserver(() => {
          chartRef.current?.resize();
        });
        observer.observe(containerRef.current);

        setReady(true);
      }

      void boot();

      return () => {
        disposed = true;
        observer?.disconnect();
        if (chartRef.current && disposeFn) {
          disposeFn(chartRef.current);
          chartRef.current = null;
        }
        indicatorIdsRef.current = {};
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Push symbol / interval / bars data updates into KLineChart
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      chart.setSymbol({
        ticker: symbol.id,
        pricePrecision: symbol.pricePrecision,
        volumePrecision: 0,
      });
      chart.setPeriod(toKlinePeriod(interval));
      chart.resetData();

      // Default hover bar to latest bar
      const last = bars[bars.length - 1] ?? null;
      const prev = bars.length >= 2 ? bars[bars.length - 2].close : null;
      setHoverBar(last);
      setHoverPrevClose(prev);
      onCrosshairRef.current(last, prev);
    }, [ready, symbol.id, symbol.pricePrecision, interval, bars]);

    // Sync Theme / ColorScheme / ChartType styles dynamically
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;
      chart.setStyles(buildChartStyles(theme, colorScheme, chartType));
    }, [ready, theme, colorScheme, chartType]);

    // Sync active indicators (add newly enabled, remove newly disabled)
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      const currentMap = indicatorIdsRef.current;
      const desiredSet = new Set<IndicatorId>(activeIndicators);

      // Remove indicators no longer active
      (Object.keys(currentMap) as IndicatorId[]).forEach((indId) => {
        if (!desiredSet.has(indId)) {
          const entry = currentMap[indId];
          if (entry) {
            chart.removeIndicator({ id: entry.id, paneId: entry.paneId });
          }
          delete currentMap[indId];
        }
      });

      // Add newly enabled indicators
      for (const indId of activeIndicators) {
        if (currentMap[indId]) continue;

        if (indId === "MA" || indId === "EMA" || indId === "BOLL") {
          const calcParams =
            indId === "MA"
              ? [5, 10, 20, 60]
              : indId === "EMA"
              ? [6, 12, 20]
              : [20, 2];
          const createdId = chart.createIndicator(
            {
              name: indId,
              paneId: "candle_pane",
              calcParams,
            },
            true
          );
          if (createdId) {
            currentMap[indId] = { id: createdId, paneId: "candle_pane" };
          }
        } else {
          const paneId =
            indId === "VOL"
              ? "pane_vol"
              : indId === "RSI"
              ? "pane_rsi"
              : "pane_macd";
          const createdId = chart.createIndicator(
            {
              name: indId,
              paneId,
            },
            false
          );
          if (createdId) {
            currentMap[indId] = { id: createdId, paneId };
            chart.setPaneOptions({
              id: paneId,
              height: indId === "VOL" ? 96 : 112,
              minHeight: 60,
              dragEnabled: true,
            });
          }
        }
      }
      chart.resize();
    }, [ready, activeIndicators]);

    const fitRange = useCallback((barCount: number | "all") => {
      const chart = chartRef.current;
      const el = containerRef.current;
      if (!chart || !el) return;
      const total = barsRef.current.length;
      if (total === 0) return;
      const target = barCount === "all" ? total : Math.min(barCount, total);
      const width = Math.max(el.clientWidth - 90, 240);
      const barSpace = Math.max(2.2, Math.min(28, width / Math.max(target, 10)));
      chart.setBarSpace(barSpace);
      chart.scrollToRealTime(150);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        startDrawing: (tool, magnet, textVal) => {
          const chart = chartRef.current;
          if (!chart) return;
          const spec = TOOL_TO_OVERLAY[tool];
          if (!spec) return;

          const overlayId = chart.createOverlay({
            name: spec.name,
            paneId: "candle_pane",
            mode: magnet ? "weak_magnet" : "normal",
            extendData:
              tool === "text" ? textVal?.trim() || "关键观察位" : undefined,
            onDrawEnd: ({ overlay }) => {
              onOverlayCreatedRef.current({
                id: overlay.id,
                tool,
                label:
                  tool === "text"
                    ? `文字：${textVal?.trim() || "关键观察位"}`
                    : spec.label,
                klineOverlayName: spec.name,
                createdAt: Date.now(),
              });
              onCancelToolRef.current();
            },
          });

          // Single-step overlays (none currently) or failed creation guard
          if (!overlayId) {
            onCancelToolRef.current();
          }
        },
        removeOverlayById: (id: string) => {
          chartRef.current?.removeOverlay({ id });
        },
        clearAllOverlays: () => {
          chartRef.current?.removeOverlay();
        },
        fitRange,
      }),
      [fitRange]
    );

    const handleTogglePctScale = () => {
      const chart = chartRef.current;
      if (!chart) return;
      const next = !pctScale;
      setPctScale(next);
      chart.overrideYAxis({
        paneId: "candle_pane",
        name: next ? "percentage" : "normal",
      });
    };

    const displayBar = hoverBar ?? bars[bars.length - 1] ?? null;
    const refClose =
      hoverPrevClose ??
      (bars.length >= 2 ? bars[bars.length - 2].close : displayBar?.open ?? 0);
    const diff = displayBar ? displayBar.close - refClose : 0;
    const diffPct = displayBar && refClose > 0 ? (diff / refClose) * 100 : 0;
    const isUp = diff >= 0;
    const prec = symbol.pricePrecision;
    const activeToolSpec = TOOL_TO_OVERLAY[activeTool];

    return (
      <div className="tb-canvas relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Main Canvas Area */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div ref={containerRef} className="h-full w-full" />

          {/* Top-Left Compact Chart Status Legend */}
          <div className="pointer-events-none absolute left-2.5 top-1.5 z-10 flex flex-col gap-1 max-w-[calc(100%-96px)]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight">
              <span className="font-bold text-[12px] tb-text-primary">
                {symbol.ticker}
              </span>
              <span className="tb-text-secondary font-medium">{symbol.name}</span>
              <span className="tb-text-muted">· {interval} · {symbol.exchange}</span>

              {/* Honest Non-Hideable Data Provenance Capsule */}
              <span
                title={`${provenance.provider} — ${provenance.delayNote}`}
                className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: provenance.isProxy
                    ? "rgba(168, 85, 247, 0.18)"
                    : provenance.kind === "official_fred"
                    ? "rgba(16, 185, 129, 0.16)"
                    : "rgba(56, 189, 248, 0.16)",
                  color: provenance.isProxy
                    ? "var(--status-proxy)"
                    : provenance.kind === "official_fred"
                    ? "var(--status-live)"
                    : "var(--status-iex)",
                }}
              >
                {provenance.badge}
                {provenance.dateRange ? ` (${provenance.dateRange})` : ""}
              </span>

              {/* Live OHLCV Hover Readout */}
              {displayBar && (
                <div className="flex items-center gap-1.5 tabular-nums text-[11px]">
                  <span className="tb-text-muted">
                    开{" "}
                    <span className={isUp ? "tb-up" : "tb-down"}>
                      {displayBar.open.toFixed(prec)}
                    </span>
                  </span>
                  <span className="tb-text-muted">
                    高{" "}
                    <span className={isUp ? "tb-up" : "tb-down"}>
                      {displayBar.high.toFixed(prec)}
                    </span>
                  </span>
                  <span className="tb-text-muted">
                    低{" "}
                    <span className={isUp ? "tb-up" : "tb-down"}>
                      {displayBar.low.toFixed(prec)}
                    </span>
                  </span>
                  <span className="tb-text-muted">
                    收{" "}
                    <span className={isUp ? "tb-up" : "tb-down"}>
                      {displayBar.close.toFixed(prec)}
                    </span>
                  </span>
                  <span className={isUp ? "tb-up font-medium" : "tb-down font-medium"}>
                    {isUp ? "+" : ""}
                    {diff.toFixed(prec)} ({isUp ? "+" : ""}
                    {diffPct.toFixed(2)}%)
                  </span>
                  {displayBar.volume > 0 && (
                    <span className="tb-text-muted">
                      量{" "}
                      <span className="tb-text-secondary">
                        {formatVolShort(displayBar.volume)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Quick Active Indicator Chips */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-1">
              {activeIndicators.map((indId) => (
                <span
                  key={indId}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tb-text-secondary border tb-border"
                  style={{ backgroundColor: "rgba(19, 23, 34, 0.78)" }}
                >
                  <span>{indId}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIndicator(indId)}
                    title={`关闭 ${indId}`}
                    className="tb-text-muted hover:text-[#F2485B] cursor-pointer"
                  >
                    <IconClose size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Drawing Tool Active Banner */}
          {activeTool !== "cursor" && activeToolSpec && (
            <div
              className="absolute left-1/2 top-2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-md border tb-border-subtle px-3 py-1 text-[11px] shadow-lg"
              style={{ backgroundColor: "var(--bg-elevated)" }}
            >
              <span className="font-semibold text-[var(--accent-primary)]">
                画线中：{activeToolSpec.label}
              </span>
              {activeTool === "text" ? (
                <input
                  type="text"
                  value={annotationText}
                  onChange={(e) => onChangeAnnotationText(e.target.value)}
                  placeholder="输入标注文字..."
                  className="w-36 rounded border tb-border-subtle bg-[var(--bg-input)] px-2 py-0.5 text-[11px] tb-text-primary outline-none"
                />
              ) : (
                <span className="tb-text-secondary">{activeToolSpec.hint}</span>
              )}
              <button
                type="button"
                onClick={onCancelDrawingTool}
                className="rounded px-1.5 py-0.5 text-[10px] tb-text-muted tb-hover cursor-pointer"
              >
                取消
              </button>
            </div>
          )}

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
              <div className="tb-elevated tb-border-subtle rounded-md border px-4 py-2 text-[12px] tb-text-primary shadow-lg">
                正在加载 {symbol.ticker} ({interval}) K 线数据...
              </div>
            </div>
          )}
        </div>

        {/* Bottom Quick Range & Coordinate Axis Bar */}
        <div className="tb-panel tb-border flex h-[28px] shrink-0 items-center justify-between border-t px-2.5 text-[11px]">
          <div className="flex items-center gap-1">
            {(
              [
                ["1M", 22],
                ["3M", 65],
                ["6M", 130],
                ["1Y", 252],
                ["全部", "all"],
              ] as const
            ).map(([label, count]) => (
              <button
                key={label}
                type="button"
                onClick={() => fitRange(count)}
                className="tb-hover rounded px-1.5 py-0.5 tb-text-secondary hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 tabular-nums tb-text-secondary">
            <span className="hidden sm:inline text-[11px] tb-text-muted">
              {clock ? `${clock} UTC+8` : "UTC+8"}
            </span>
            <div className="h-3 w-px bg-[var(--border-hairline)]" />
            <button
              type="button"
              onClick={handleTogglePctScale}
              title="切换普通价格坐标 / 百分比涨跌幅坐标"
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer ${
                pctScale
                  ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "tb-hover tb-text-secondary"
              }`}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => fitRange(120)}
              title="恢复默认缩放并滚动到最新 K 线"
              className="tb-hover rounded px-1.5 py-0.5 text-[10px] font-semibold tb-text-secondary cursor-pointer"
            >
              AUTO
            </button>
          </div>
        </div>
      </div>
    );
  }
);
