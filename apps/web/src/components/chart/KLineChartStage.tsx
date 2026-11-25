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
  BacktestTrade,
  ChartType,
  ColorScheme,
  DataProvenance,
  DrawingToolId,
  DrawnOverlayRecord,
  IndicatorId,
  Interval,
  LocalAlertRule,
  NormalizedBar,
  PaperFill,
  PaperOrder,
  PaperPosition,
  SymbolMeta,
  TemplateDrawing,
  ThemeMode,
} from "@trade-buddy/shared-types";
import { getChartPalette, IconClose } from "@trade-buddy/ui-tokens";
import {
  findNearestBarByTimestamp,
  formatBarTimestamp,
} from "@/lib/chart-sync";

export interface KLineChartHandle {
  startDrawing: (
    tool: DrawingToolId,
    magnet: boolean,
    annotationText?: string
  ) => void;
  cancelPendingDrawing: () => void;
  removeOverlayById: (id: string) => void;
  clearAllOverlays: () => void;
  exportUserDrawings: (records: DrawnOverlayRecord[]) => TemplateDrawing[];
  restoreUserDrawings: (drawings: TemplateDrawing[]) => DrawnOverlayRecord[];
  fitRange: (barCount: number | "all") => void;
}

export interface PaperChartOverlayData {
  enabled: boolean;
  position: PaperPosition | null;
  openOrders: PaperOrder[];
  fills: PaperFill[];
}

export interface AlertChartOverlayData {
  enabled: boolean;
  priceAlerts: LocalAlertRule[];
}

export interface BacktestChartOverlayData {
  enabled: boolean;
  strategyLabel: string;
  trades: BacktestTrade[];
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
  compact?: boolean;
  externalCrosshairTimestamp?: number | null;
  pickReplayStartMode?: boolean;
  replayBadge?: string | null;
  paperOverlay?: PaperChartOverlayData | null;
  onTogglePaperOverlay?: () => void;
  alertOverlay?: AlertChartOverlayData | null;
  onToggleAlertOverlay?: () => void;
  backtestOverlay?: BacktestChartOverlayData | null;
  onToggleBacktestOverlay?: () => void;
  pendingRestoreDrawings?: TemplateDrawing[] | null;
  onDrawingsRestored?: (records: DrawnOverlayRecord[]) => void;
  onChangeAnnotationText: (val: string) => void;
  onCancelDrawingTool: () => void;
  onCrosshairChange: (bar: NormalizedBar | null, prevClose: number | null) => void;
  onCrosshairTimestampChange?: (timestamp: number | null) => void;
  onPickReplayStart?: (index: number, timestamp: number) => void;
  onCancelPickReplayStart?: () => void;
  onOverlayCreated: (record: DrawnOverlayRecord) => void;
  onOverlayUpdated?: (id: string, label: string) => void;
  onRemoveIndicator: (id: IndicatorId) => void;
}

interface MeasurePaletteState {
  upColor: string;
  downColor: string;
  upFill: string;
  downFill: string;
  cardBg: string;
  cardText: string;
}

const liveMeasurePalette: MeasurePaletteState = {
  upColor: "#16B981",
  downColor: "#F2485B",
  upFill: "rgba(22, 185, 129, 0.14)",
  downFill: "rgba(242, 72, 91, 0.14)",
  cardBg: "rgba(19, 23, 34, 0.94)",
  cardText: "#E6EDF7",
};

function syncLiveMeasurePalette(theme: ThemeMode, colorScheme: ColorScheme) {
  const p = getChartPalette(theme, colorScheme);
  const isDark = theme === "dark";
  const isIntl = colorScheme === "intl";
  const greenFill = isDark
    ? "rgba(22, 185, 129, 0.15)"
    : "rgba(13, 150, 104, 0.14)";
  const redFill = isDark
    ? "rgba(242, 72, 91, 0.15)"
    : "rgba(224, 49, 70, 0.14)";
  liveMeasurePalette.upColor = p.upColor;
  liveMeasurePalette.downColor = p.downColor;
  liveMeasurePalette.upFill = isIntl ? greenFill : redFill;
  liveMeasurePalette.downFill = isIntl ? redFill : greenFill;
  liveMeasurePalette.cardBg = isDark
    ? "rgba(19, 23, 34, 0.94)"
    : "rgba(255, 255, 255, 0.96)";
  liveMeasurePalette.cardText = isDark ? "#E6EDF7" : "#111827";
}

function formatMeasureDuration(diffMs: number, barCount: number, interval: Interval): string {
  if (diffMs <= 0) {
    if (barCount === 0) return "同根 K 线";
    return interval === "60m"
      ? `${barCount} 小时`
      : interval === "1W"
      ? `${barCount} 周`
      : interval === "1M"
      ? `${barCount} 个月`
      : `${barCount} 交易日`;
  }
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = diffMs / 3_600_000;
  if (hours < 24) return `${hours.toFixed(1).replace(/\.0$/, "")} 小时`;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 30) return `${days} 天`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    const remDays = days % 30;
    return remDays > 0 ? `${months} 个月 ${remDays} 天` : `${months} 个月`;
  }
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years} 年 ${remMonths} 个月` : `${years} 年`;
}

interface MeasureExtendData {
  pricePrecision: number;
  interval: Interval;
}

interface PaperPriceLineExtendData {
  kind: "cost" | "buy_limit" | "sell_limit";
  label: string;
  priceText: string;
  lineColor: string;
  badgeBg: string;
  badgeText: string;
  lineStyle: "solid" | "dashed";
  dashedValue: [number, number];
}

interface PaperFillMarkerExtendData {
  side: "buy" | "sell";
  label: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

interface AlertPriceLineExtendData {
  direction: "above" | "below";
  label: string;
  priceText: string;
  lineColor: string;
  badgeBg: string;
  badgeText: string;
}

interface BacktestMarkerExtendData {
  side: "buy" | "sell";
  label: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

const USER_DRAWING_GROUP_ID = "tb_user_drawings";
const PAPER_OVERLAY_GROUP_ID = "tb_paper_overlays";
const ALERT_OVERLAY_GROUP_ID = "tb_alert_overlays";
const BACKTEST_OVERLAY_GROUP_ID = "tb_backtest_overlays";

function formatOverlayQty(qty: number): string {
  if (!Number.isFinite(qty)) return "0";
  if (Math.abs(qty - Math.round(qty)) < 1e-6) {
    return String(Math.round(qty));
  }
  return Number(qty.toFixed(4)).toString();
}

function computeMeasureStats(
  points: Array<{ value?: number; timestamp?: number; dataIndex?: number }>,
  dataList: Array<{ timestamp: number }>,
  prec: number,
  interval: Interval
): {
  diff: number;
  pct: number;
  isUp: boolean;
  barCount: number;
  duration: string;
  badgeText: string;
  shortLabel: string;
} {
  const pt1 = points[0] ?? {};
  const pt2 = points[1] ?? {};
  const v1 = pt1.value ?? 0;
  const v2 = pt2.value ?? 0;
  const diff = v2 - v1;
  const pct = v1 !== 0 ? (diff / v1) * 100 : 0;
  const isUp = diff >= 0;

  let idx1 = pt1.dataIndex;
  let idx2 = pt2.dataIndex;
  if (
    (typeof idx1 !== "number" || typeof idx2 !== "number") &&
    pt1.timestamp &&
    pt2.timestamp &&
    dataList.length > 0
  ) {
    idx1 = dataList.findIndex((d) => d.timestamp === pt1.timestamp);
    idx2 = dataList.findIndex((d) => d.timestamp === pt2.timestamp);
  }
  const barCount =
    typeof idx1 === "number" && typeof idx2 === "number" && idx1 >= 0 && idx2 >= 0
      ? Math.abs(idx2 - idx1)
      : 0;

  const ts1 =
    pt1.timestamp ??
    (typeof idx1 === "number" ? dataList[idx1]?.timestamp : undefined);
  const ts2 =
    pt2.timestamp ??
    (typeof idx2 === "number" ? dataList[idx2]?.timestamp : undefined);
  const diffMs =
    typeof ts1 === "number" && typeof ts2 === "number"
      ? Math.abs(ts2 - ts1)
      : 0;

  const duration = formatMeasureDuration(diffMs, barCount, interval);
  const sign = isUp ? "+" : "";
  const badgeText = `${sign}${diff.toFixed(prec)} (${sign}${pct.toFixed(2)}%) · ${barCount}根 · ${duration}`;
  const shortLabel = `测距尺 (${sign}${pct.toFixed(2)}% · ${barCount}根)`;
  return { diff, pct, isUp, barCount, duration, badgeText, shortLabel };
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
  measure: {
    name: "tbMeasure",
    label: "涨跌幅测距尺",
    hint: "请依次点击起点与终点测量价差、涨跌幅及 K 线跨度（Esc 退出）",
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
      compact = false,
      externalCrosshairTimestamp = null,
      pickReplayStartMode = false,
      replayBadge = null,
      paperOverlay = null,
      onTogglePaperOverlay,
      alertOverlay = null,
      onToggleAlertOverlay,
      backtestOverlay = null,
      onToggleBacktestOverlay,
      pendingRestoreDrawings = null,
      onDrawingsRestored,
      onChangeAnnotationText,
      onCancelDrawingTool,
      onCrosshairChange,
      onCrosshairTimestampChange,
      onPickReplayStart,
      onCancelPickReplayStart,
      onOverlayCreated,
      onOverlayUpdated,
      onRemoveIndicator,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<Chart | null>(null);
    const barsRef = useRef<NormalizedBar[]>(bars);
    const renderedBarsRef = useRef<NormalizedBar[]>([]);
    const prevSeriesKeyRef = useRef<string>("");
    const subscribeBarCbRef = useRef<((data: NormalizedBar) => void) | null>(
      null
    );
    const pendingOverlayIdRef = useRef<string | null>(null);
    const paperOverlaySigRef = useRef<string>("");
    const alertOverlaySigRef = useRef<string>("");
    const backtestOverlaySigRef = useRef<string>("");
    const hadExternalCrosshairRef = useRef(false);
    const indicatorIdsRef = useRef<
      Partial<Record<IndicatorId, { id: string; paneId: string }>>
    >({});
    const [ready, setReady] = useState(false);
    const [pctScale, setPctScale] = useState(false);
    const [clock, setClock] = useState("");
    const [hoverBar, setHoverBar] = useState<NormalizedBar | null>(null);
    const [hoverPrevClose, setHoverPrevClose] = useState<number | null>(null);
    const [syncAlignNotice, setSyncAlignNotice] = useState<{
      text: string;
      title: string;
    } | null>(null);

    const onCrosshairRef = useRef(onCrosshairChange);
    onCrosshairRef.current = onCrosshairChange;
    const onCrosshairTsRef = useRef(onCrosshairTimestampChange);
    onCrosshairTsRef.current = onCrosshairTimestampChange;
    const onOverlayCreatedRef = useRef(onOverlayCreated);
    onOverlayCreatedRef.current = onOverlayCreated;
    const onOverlayUpdatedRef = useRef(onOverlayUpdated);
    onOverlayUpdatedRef.current = onOverlayUpdated;
    const onCancelToolRef = useRef(onCancelDrawingTool);
    onCancelToolRef.current = onCancelDrawingTool;
    const symbolPrecRef = useRef(symbol.pricePrecision);
    symbolPrecRef.current = symbol.pricePrecision;
    const intervalRef = useRef(interval);
    intervalRef.current = interval;
    const compactRef = useRef(compact);
    compactRef.current = compact;

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

        // Register custom Trade Buddy Measure Ruler overlay once
        if (!kc.getSupportedOverlays().includes("tbMeasure")) {
          kc.registerOverlay<MeasureExtendData>({
            name: "tbMeasure",
            totalStep: 3,
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: true,
            needDefaultYAxisFigure: true,
            createPointFigures: ({ overlay, coordinates, bounding, chart }) => {
              if (coordinates.length !== 2 || overlay.points.length < 2) {
                return [];
              }
              const [p1, p2] = coordinates;
              const ext = overlay.extendData ?? {
                pricePrecision: 2,
                interval: "1D" as Interval,
              };
              const stats = computeMeasureStats(
                overlay.points,
                chart.getDataList(),
                ext.pricePrecision,
                ext.interval
              );
              const strokeColor = stats.isUp
                ? liveMeasurePalette.upColor
                : liveMeasurePalette.downColor;
              const fillColor = stats.isUp
                ? liveMeasurePalette.upFill
                : liveMeasurePalette.downFill;

              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              const topY = Math.min(p1.y, p2.y);
              const bottomY = Math.max(p1.y, p2.y);

              const placeBelow = bottomY + 34 < bounding.height;
              const labelY = placeBelow ? bottomY + 8 : Math.max(10, topY - 28);
              const clampedX = Math.max(
                bounding.left + 125,
                Math.min(bounding.left + bounding.width - 125, midX)
              );

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
                    color: fillColor,
                    borderColor: strokeColor,
                    borderSize: 1.5,
                  },
                },
                {
                  type: "line",
                  attrs: {
                    coordinates: [
                      { x: p1.x, y: midY },
                      { x: p2.x, y: midY },
                    ],
                  },
                  styles: {
                    style: "dashed",
                    color: strokeColor,
                    size: 1,
                    dashedValue: [4, 3],
                  },
                  ignoreEvent: true,
                },
                {
                  type: "line",
                  attrs: {
                    coordinates: [
                      { x: midX, y: p1.y },
                      { x: midX, y: p2.y },
                    ],
                  },
                  styles: {
                    style: "dashed",
                    color: strokeColor,
                    size: 1,
                    dashedValue: [4, 3],
                  },
                  ignoreEvent: true,
                },
                {
                  type: "text",
                  attrs: {
                    x: clampedX,
                    y: labelY,
                    text: stats.badgeText,
                    align: "center",
                    baseline: "top",
                  },
                  styles: {
                    style: "stroke_fill",
                    color: liveMeasurePalette.cardText,
                    size: 11,
                    weight: "bold",
                    backgroundColor: liveMeasurePalette.cardBg,
                    borderColor: strokeColor,
                    borderSize: 1,
                    borderRadius: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 4,
                    paddingBottom: 4,
                  },
                  ignoreEvent: true,
                },
              ];
            },
          });
        }

        // Register custom Trade Buddy Paper Price Line overlay (position cost & limit orders)
        if (!kc.getSupportedOverlays().includes("tbPaperPriceLine")) {
          kc.registerOverlay<PaperPriceLineExtendData>({
            name: "tbPaperPriceLine",
            totalStep: 2,
            lock: true,
            needDefaultPointFigure: false,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: ({ overlay, coordinates, bounding }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.y) || !ext) return [];
              const y = pt.y;
              const labelY = y > 22 ? y - 3 : y + 16;
              return [
                {
                  type: "line",
                  attrs: {
                    coordinates: [
                      { x: 0, y },
                      { x: bounding.width, y },
                    ],
                  },
                  styles: {
                    style: ext.lineStyle,
                    color: ext.lineColor,
                    size: ext.kind === "cost" ? 1.5 : 1.25,
                    dashedValue: ext.dashedValue,
                  },
                  ignoreEvent: true,
                },
                {
                  type: "text",
                  attrs: {
                    x: Math.max(8, bounding.width - 8),
                    y: labelY,
                    text: ext.label,
                    align: "right",
                    baseline: y > 22 ? "bottom" : "top",
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.badgeText,
                    size: 10,
                    weight: "bold",
                    backgroundColor: ext.badgeBg,
                    borderColor: ext.lineColor,
                    borderSize: 1,
                    borderRadius: 3,
                    paddingLeft: 6,
                    paddingRight: 6,
                    paddingTop: 2,
                    paddingBottom: 2,
                  },
                  ignoreEvent: true,
                },
              ];
            },
            createYAxisFigures: ({ overlay, coordinates, bounding, yAxis }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.y) || !ext) return [];
              const isFromZero = yAxis?.isFromZero() ?? false;
              return {
                type: "text",
                attrs: {
                  x: isFromZero ? 0 : bounding.width,
                  y: pt.y,
                  text: ext.priceText,
                  align: isFromZero ? "left" : "right",
                  baseline: "middle",
                },
                styles: {
                  style: "fill",
                  color: "#FFFFFF",
                  size: 10,
                  weight: "bold",
                  backgroundColor: ext.lineColor,
                  borderRadius: 2,
                  paddingLeft: 4,
                  paddingRight: 4,
                  paddingTop: 2,
                  paddingBottom: 2,
                },
                ignoreEvent: true,
              };
            },
          });
        }

        // Register custom Trade Buddy Paper Fill Marker overlay (buy / sell arrows on K-lines)
        if (!kc.getSupportedOverlays().includes("tbPaperFillMarker")) {
          kc.registerOverlay<PaperFillMarkerExtendData>({
            name: "tbPaperFillMarker",
            totalStep: 2,
            lock: true,
            needDefaultPointFigure: false,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: ({ overlay, coordinates }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !ext) {
                return [];
              }
              const isBuy = ext.side === "buy";
              const tipY = isBuy ? pt.y + 6 : pt.y - 6;
              const baseY = isBuy ? pt.y + 14 : pt.y - 14;
              const labelY = isBuy ? pt.y + 17 : pt.y - 17;

              return [
                {
                  type: "polygon",
                  attrs: {
                    coordinates: [
                      { x: pt.x, y: tipY },
                      { x: pt.x - 5, y: baseY },
                      { x: pt.x + 5, y: baseY },
                    ],
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.color,
                    borderColor: ext.badgeBg,
                    borderSize: 1,
                  },
                  ignoreEvent: true,
                },
                {
                  type: "text",
                  attrs: {
                    x: pt.x,
                    y: labelY,
                    text: ext.label,
                    align: "center",
                    baseline: isBuy ? "top" : "bottom",
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.badgeText,
                    size: 10,
                    weight: "bold",
                    backgroundColor: ext.badgeBg,
                    borderColor: ext.color,
                    borderSize: 1,
                    borderRadius: 3,
                    paddingLeft: 5,
                    paddingRight: 5,
                    paddingTop: 2,
                    paddingBottom: 2,
                  },
                  ignoreEvent: true,
                },
              ];
            },
          });
        }

        // Register custom Trade Buddy Local Alert Price Line overlay
        if (!kc.getSupportedOverlays().includes("tbAlertPriceLine")) {
          kc.registerOverlay<AlertPriceLineExtendData>({
            name: "tbAlertPriceLine",
            totalStep: 2,
            lock: true,
            needDefaultPointFigure: false,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: ({ overlay, coordinates, bounding }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.y) || !ext) return [];
              const y = pt.y;
              const labelY = y > 22 ? y - 3 : y + 16;
              return [
                {
                  type: "line",
                  attrs: {
                    coordinates: [
                      { x: 0, y },
                      { x: bounding.width, y },
                    ],
                  },
                  styles: {
                    style: "dashed",
                    color: ext.lineColor,
                    size: 1.5,
                    dashedValue: [5, 3],
                  },
                  ignoreEvent: true,
                },
                {
                  type: "text",
                  attrs: {
                    x: 8,
                    y: labelY,
                    text: ext.label,
                    align: "left",
                    baseline: y > 22 ? "bottom" : "top",
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.badgeText,
                    size: 10,
                    weight: "bold",
                    backgroundColor: ext.badgeBg,
                    borderColor: ext.lineColor,
                    borderSize: 1,
                    borderRadius: 3,
                    paddingLeft: 6,
                    paddingRight: 6,
                    paddingTop: 2,
                    paddingBottom: 2,
                  },
                  ignoreEvent: true,
                },
              ];
            },
            createYAxisFigures: ({ overlay, coordinates, bounding, yAxis }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.y) || !ext) return [];
              const isFromZero = yAxis?.isFromZero() ?? false;
              return {
                type: "text",
                attrs: {
                  x: isFromZero ? 0 : bounding.width,
                  y: pt.y,
                  text: ext.priceText,
                  align: isFromZero ? "left" : "right",
                  baseline: "middle",
                },
                styles: {
                  style: "fill",
                  color: "#FFFFFF",
                  size: 10,
                  weight: "bold",
                  backgroundColor: ext.lineColor,
                  borderRadius: 2,
                  paddingLeft: 4,
                  paddingRight: 4,
                  paddingTop: 2,
                  paddingBottom: 2,
                },
                ignoreEvent: true,
              };
            },
          });
        }

        // Register custom Trade Buddy Backtest Trade Marker overlay (distinct diamond shape + sky/purple palette)
        if (!kc.getSupportedOverlays().includes("tbBacktestMarker")) {
          kc.registerOverlay<BacktestMarkerExtendData>({
            name: "tbBacktestMarker",
            totalStep: 2,
            lock: true,
            needDefaultPointFigure: false,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: ({ overlay, coordinates }) => {
              const pt = coordinates[0];
              const ext = overlay.extendData;
              if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !ext) {
                return [];
              }
              const isBuy = ext.side === "buy";
              const cy = isBuy ? pt.y + 11 : pt.y - 11;
              const r = 4.8;
              const labelY = isBuy ? cy + 8 : cy - 8;

              return [
                {
                  type: "polygon",
                  attrs: {
                    coordinates: [
                      { x: pt.x, y: cy - r },
                      { x: pt.x + r, y: cy },
                      { x: pt.x, y: cy + r },
                      { x: pt.x - r, y: cy },
                    ],
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.color,
                    borderColor: ext.badgeBg,
                    borderSize: 1.2,
                  },
                  ignoreEvent: true,
                },
                {
                  type: "text",
                  attrs: {
                    x: pt.x,
                    y: labelY,
                    text: ext.label,
                    align: "center",
                    baseline: isBuy ? "top" : "bottom",
                  },
                  styles: {
                    style: "stroke_fill",
                    color: ext.badgeText,
                    size: 9.5,
                    weight: "bold",
                    backgroundColor: ext.badgeBg,
                    borderColor: ext.color,
                    borderSize: 1,
                    borderRadius: 9,
                    paddingLeft: 5,
                    paddingRight: 5,
                    paddingTop: 1.5,
                    paddingBottom: 1.5,
                  },
                  ignoreEvent: true,
                },
              ];
            },
          });
        }

        syncLiveMeasurePalette(theme, colorScheme);
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
          subscribeBar: ({ callback }) => {
            subscribeBarCbRef.current = (bar: NormalizedBar) => {
              callback(bar);
            };
          },
          unsubscribeBar: () => {
            subscribeBarCbRef.current = null;
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
            setSyncAlignNotice(null);
            setHoverBar(b);
            setHoverPrevClose(prev);
            onCrosshairRef.current(b, prev);
            onCrosshairTsRef.current?.(b.timestamp);
          } else {
            setHoverBar(null);
            setHoverPrevClose(null);
            onCrosshairRef.current(null, null);
            onCrosshairTsRef.current?.(null);
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
        subscribeBarCbRef.current = null;
        paperOverlaySigRef.current = "";
        alertOverlaySigRef.current = "";
        backtestOverlaySigRef.current = "";
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

      const seriesKey = `${symbol.id}:${symbol.pricePrecision}:${interval}`;
      const seriesChanged = prevSeriesKeyRef.current !== seriesKey;
      const prevBars = renderedBarsRef.current;

      const isSingleBarAppend =
        !seriesChanged &&
        prevBars.length > 0 &&
        bars.length === prevBars.length + 1 &&
        bars[0].timestamp === prevBars[0].timestamp &&
        bars[prevBars.length - 1].timestamp ===
          prevBars[prevBars.length - 1].timestamp &&
        bars[bars.length - 1].timestamp >
          prevBars[prevBars.length - 1].timestamp &&
        subscribeBarCbRef.current !== null;

      if (isSingleBarAppend) {
        subscribeBarCbRef.current?.(bars[bars.length - 1]);
      } else if (seriesChanged) {
        prevSeriesKeyRef.current = seriesKey;
        chart.setSymbol({
          ticker: symbol.id,
          pricePrecision: symbol.pricePrecision,
          volumePrecision: 0,
        });
        chart.setPeriod(toKlinePeriod(interval));
        chart.resetData();
      } else {
        // Same symbol/interval (e.g. replay seek, reset, start, exit):
        // preserve current barSpace while recalculating all indicators on visible prefix
        const savedBarSpace = chart.getBarSpace()?.bar;
        chart.resetData();
        if (typeof savedBarSpace === "number" && savedBarSpace > 0) {
          chart.setBarSpace(savedBarSpace);
        }
      }

      renderedBarsRef.current = bars;

      // Update default legend / hover readout to latest visible bar
      const last = bars[bars.length - 1] ?? null;
      const prev = bars.length >= 2 ? bars[bars.length - 2].close : null;
      setHoverBar(last);
      setHoverPrevClose(prev);
      onCrosshairRef.current(last, prev);
    }, [ready, symbol.id, symbol.pricePrecision, interval, bars]);

    // Sync external linked crosshair by timestamp (exact or nearest bar)
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      if (externalCrosshairTimestamp === null) {
        if (hadExternalCrosshairRef.current) {
          hadExternalCrosshairRef.current = false;
          setSyncAlignNotice(null);
          chart.executeAction("onCrosshairChange", {} as Crosshair);
        }
        return;
      }

      hadExternalCrosshairRef.current = true;

      const currentBars = barsRef.current;
      const match = findNearestBarByTimestamp(
        currentBars,
        externalCrosshairTimestamp
      );
      if (!match) {
        setSyncAlignNotice(null);
        chart.executeAction("onCrosshairChange", {} as Crosshair);
        return;
      }

      const prevClose =
        match.index > 0 ? currentBars[match.index - 1]?.close ?? null : null;
      setHoverBar(match.bar);
      setHoverPrevClose(prevClose);

      const pixel = chart.convertToPixel(
        { dataIndex: match.index, value: match.bar.close },
        { paneId: "candle_pane" }
      );
      const coord = Array.isArray(pixel) ? pixel[0] : pixel;
      const size = chart.getSize("candle_pane", "main");
      const inBounds =
        typeof coord?.x === "number" &&
        Number.isFinite(coord.x) &&
        size !== null &&
        coord.x >= 0 &&
        coord.x <= size.width;

      const matchedLabel = formatBarTimestamp(
        match.bar.timestamp,
        interval,
        compact
      );
      const targetLabel = formatBarTimestamp(
        externalCrosshairTimestamp,
        interval,
        false
      );

      if (inBounds) {
        const clampedY =
          typeof coord.y === "number" && Number.isFinite(coord.y)
            ? Math.max(4, Math.min(size.height - 4, coord.y))
            : Math.round(size.height / 2);
        chart.executeAction("onCrosshairChange", {
          x: coord.x,
          y: clampedY,
          paneId: "candle_pane",
        });

        if (!match.exact) {
          setSyncAlignNotice({
            text: `≈ ${matchedLabel}`,
            title: `无相同时间戳（目标 ${targetLabel}），光标已自动落到最近一根 K 线（${formatBarTimestamp(
              match.bar.timestamp,
              interval,
              false
            )}）`,
          });
        } else {
          setSyncAlignNotice(null);
        }
      } else {
        chart.executeAction("onCrosshairChange", {} as Crosshair);
        setSyncAlignNotice({
          text: match.exact
            ? `视口外 ${matchedLabel}`
            : `视口外 ≈ ${matchedLabel}`,
          title: `联动光标时间戳（${targetLabel}）位于当前视口范围之外，已匹配${
            match.exact ? "同时间戳" : "最近一根"
          } K 线（${formatBarTimestamp(match.bar.timestamp, interval, false)}）`,
        });
      }
    }, [ready, externalCrosshairTimestamp, interval, compact, bars]);

    // Sync Theme / ColorScheme / ChartType styles dynamically
    useEffect(() => {
      syncLiveMeasurePalette(theme, colorScheme);
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
              height: compactRef.current
                ? indId === "VOL"
                  ? 58
                  : 66
                : indId === "VOL"
                ? 96
                : 112,
              minHeight: compactRef.current ? 40 : 60,
              dragEnabled: true,
            });
          }
        }
      }
      chart.resize();
    }, [ready, activeIndicators]);

    // Sync paper trading overlays (position cost line, open limit order lines, buy/sell fill markers)
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      if (!paperOverlay || !paperOverlay.enabled || bars.length === 0) {
        if (paperOverlaySigRef.current !== "") {
          chart.removeOverlay({ groupId: PAPER_OVERLAY_GROUP_ID });
          paperOverlaySigRef.current = "";
        }
        return;
      }

      const palette = getChartPalette(theme, colorScheme);
      const isDark = theme === "dark";
      const badgeBg = isDark
        ? "rgba(19, 23, 34, 0.92)"
        : "rgba(255, 255, 255, 0.95)";
      const badgeText = isDark ? "#E6EDF7" : "#111827";
      const costColor = isDark ? "#F59E0B" : "#D97706";
      const prec = symbol.pricePrecision;
      const unitLabel = symbol.assetType === "STOCK" ? "股" : "份";

      // Aggregate fills by nearest bar timestamp + side so same-bar fills stay clean and readable
      const fillBuckets = new Map<
        string,
        {
          side: "buy" | "sell";
          barTimestamp: number;
          anchorPrice: number;
          count: number;
          totalQty: number;
          weightedPriceSum: number;
        }
      >();

      for (const fill of paperOverlay.fills) {
        const rawTs = fill.barTimestamp ?? Date.parse(fill.filledAt);
        if (!Number.isFinite(rawTs)) continue;
        const match = findNearestBarByTimestamp(bars, rawTs);
        if (!match) continue;

        const key = `${match.bar.timestamp}:${fill.side}`;
        const existing = fillBuckets.get(key);
        if (existing) {
          existing.count += 1;
          existing.totalQty += fill.quantity;
          existing.weightedPriceSum += fill.price * fill.quantity;
        } else {
          fillBuckets.set(key, {
            side: fill.side,
            barTimestamp: match.bar.timestamp,
            anchorPrice:
              fill.side === "buy" ? match.bar.low : match.bar.high,
            count: 1,
            totalQty: fill.quantity,
            weightedPriceSum: fill.price * fill.quantity,
          });
        }
      }

      const pos = paperOverlay.position;
      const openOrders = paperOverlay.openOrders;
      const fillEntries = Array.from(fillBuckets.values());

      // Build lightweight signature to skip redundant canvas overlay recreation during replay ticks
      const sigParts: string[] = [
        symbol.id,
        theme,
        colorScheme,
        pos ? `P:${pos.avgCost}:${pos.quantity}` : "P:none",
        openOrders
          .map((o) => `O:${o.id}:${o.side}:${o.limitPrice}:${o.quantity}`)
          .join("|"),
        fillEntries
          .map(
            (f) =>
              `F:${f.barTimestamp}:${f.side}:${f.count}:${f.totalQty}:${f.weightedPriceSum.toFixed(
                4
              )}`
          )
          .join("|"),
      ];
      const nextSig = sigParts.join("#");
      if (nextSig === paperOverlaySigRef.current) {
        return;
      }

      chart.removeOverlay({ groupId: PAPER_OVERLAY_GROUP_ID });

      const toCreate: Array<{
        name: string;
        groupId: string;
        paneId: string;
        lock: boolean;
        zLevel: number;
        fixedZLevel: boolean;
        points: Array<{ timestamp?: number; value?: number }>;
        extendData: PaperPriceLineExtendData | PaperFillMarkerExtendData;
      }> = [];

      // 1. Position Average Cost Line
      if (pos && pos.avgCost > 0 && pos.quantity > 0) {
        const priceText = pos.avgCost.toFixed(prec);
        toCreate.push({
          name: "tbPaperPriceLine",
          groupId: PAPER_OVERLAY_GROUP_ID,
          paneId: "candle_pane",
          lock: true,
          zLevel: -1,
          fixedZLevel: true,
          points: [{ value: pos.avgCost }],
          extendData: {
            kind: "cost",
            label: `成本 ${priceText} · ${formatOverlayQty(pos.quantity)}${unitLabel}`,
            priceText,
            lineColor: costColor,
            badgeBg,
            badgeText,
            lineStyle: "solid",
            dashedValue: [4, 4],
          },
        });
      }

      // 2. Open Limit Order Lines (buy vs sell distinct dash pattern & color)
      for (const ord of openOrders) {
        if (ord.limitPrice === undefined || ord.limitPrice <= 0) continue;
        const isBuy = ord.side === "buy";
        const priceText = ord.limitPrice.toFixed(prec);
        const lineColor = isBuy ? palette.upColor : palette.downColor;
        toCreate.push({
          name: "tbPaperPriceLine",
          groupId: PAPER_OVERLAY_GROUP_ID,
          paneId: "candle_pane",
          lock: true,
          zLevel: -1,
          fixedZLevel: true,
          points: [{ value: ord.limitPrice }],
          extendData: {
            kind: isBuy ? "buy_limit" : "sell_limit",
            label: `限价${isBuy ? "买" : "卖"} ${priceText} · ${formatOverlayQty(
              ord.quantity
            )}${unitLabel}`,
            priceText,
            lineColor,
            badgeBg,
            badgeText,
            lineStyle: "dashed",
            dashedValue: isBuy ? [6, 3] : [2, 3],
          },
        });
      }

      // 3. Buy / Sell Fill Markers on corresponding K-lines
      for (const entry of fillEntries) {
        const isBuy = entry.side === "buy";
        const avgPx =
          entry.totalQty > 0 ? entry.weightedPriceSum / entry.totalQty : 0;
        const color = isBuy ? palette.upColor : palette.downColor;
        const label =
          entry.count > 1
            ? `${isBuy ? "买" : "卖"}×${entry.count} @${avgPx.toFixed(prec)}`
            : `${isBuy ? "买" : "卖"} ${avgPx.toFixed(prec)}`;
        toCreate.push({
          name: "tbPaperFillMarker",
          groupId: PAPER_OVERLAY_GROUP_ID,
          paneId: "candle_pane",
          lock: true,
          zLevel: -1,
          fixedZLevel: true,
          points: [
            { timestamp: entry.barTimestamp, value: entry.anchorPrice },
          ],
          extendData: {
            side: entry.side,
            label,
            color,
            badgeBg,
            badgeText: color,
          },
        });
      }

      if (toCreate.length > 0) {
        chart.createOverlay(toCreate);
      }
      paperOverlaySigRef.current = nextSig;
    }, [
      ready,
      symbol.id,
      symbol.pricePrecision,
      symbol.assetType,
      bars,
      theme,
      colorScheme,
      paperOverlay,
    ]);

    // Sync local price alert lines on the main chart (dedicated overlay group)
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      const enabledPriceAlerts =
        alertOverlay && alertOverlay.enabled
          ? alertOverlay.priceAlerts.filter(
              (a) =>
                a.enabled &&
                a.threshold !== undefined &&
                Number.isFinite(a.threshold) &&
                a.threshold > 0
            )
          : [];

      if (enabledPriceAlerts.length === 0 || bars.length === 0) {
        if (alertOverlaySigRef.current !== "") {
          chart.removeOverlay({ groupId: ALERT_OVERLAY_GROUP_ID });
          alertOverlaySigRef.current = "";
        }
        return;
      }

      const isDark = theme === "dark";
      const badgeBg = isDark
        ? "rgba(19, 23, 34, 0.92)"
        : "rgba(255, 255, 255, 0.95)";
      const badgeText = isDark ? "#E6EDF7" : "#111827";
      const aboveColor = isDark ? "#06B6D4" : "#0891B2";
      const belowColor = isDark ? "#C084FC" : "#9333EA";
      const prec = symbol.pricePrecision;

      const nextSig = [
        symbol.id,
        theme,
        ...enabledPriceAlerts.map(
          (a) => `${a.id}:${a.condition}:${a.threshold}:${a.note ?? ""}`
        ),
      ].join("#");

      if (nextSig === alertOverlaySigRef.current) return;

      chart.removeOverlay({ groupId: ALERT_OVERLAY_GROUP_ID });

      const toCreate = enabledPriceAlerts.map((rule) => {
        const isAbove = rule.condition === "price_cross_above";
        const priceVal = rule.threshold!;
        const priceText = priceVal.toFixed(prec);
        const lineColor = isAbove ? aboveColor : belowColor;
        const shortNote = rule.note ? ` · ${rule.note.slice(0, 12)}` : "";
        return {
          name: "tbAlertPriceLine",
          groupId: ALERT_OVERLAY_GROUP_ID,
          paneId: "candle_pane",
          lock: true,
          zLevel: -1,
          fixedZLevel: true,
          points: [{ value: priceVal }],
          extendData: {
            direction: isAbove ? "above" : "below",
            label: `提醒 ${isAbove ? "↑上穿" : "↓下穿"} ${priceText}${shortNote}`,
            priceText,
            lineColor,
            badgeBg,
            badgeText,
          } satisfies AlertPriceLineExtendData,
        };
      });

      if (toCreate.length > 0) {
        chart.createOverlay(toCreate);
      }
      alertOverlaySigRef.current = nextSig;
    }, [ready, symbol.id, symbol.pricePrecision, bars, theme, alertOverlay]);

    // Sync educational backtest buy/sell diamond markers on the main chart (dedicated overlay group)
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;

      if (
        !backtestOverlay ||
        !backtestOverlay.enabled ||
        backtestOverlay.trades.length === 0 ||
        bars.length === 0
      ) {
        if (backtestOverlaySigRef.current !== "") {
          chart.removeOverlay({ groupId: BACKTEST_OVERLAY_GROUP_ID });
          backtestOverlaySigRef.current = "";
        }
        return;
      }

      const isDark = theme === "dark";
      const badgeBg = isDark
        ? "rgba(15, 23, 42, 0.94)"
        : "rgba(255, 255, 255, 0.96)";
      const buyColor = isDark ? "#38BDF8" : "#0284C7";
      const sellColor = isDark ? "#C084FC" : "#9333EA";
      const prec = symbol.pricePrecision;

      const matchedTrades: Array<{
        trade: BacktestTrade;
        barTimestamp: number;
        anchorPrice: number;
      }> = [];

      for (const trade of backtestOverlay.trades) {
        const match = findNearestBarByTimestamp(bars, trade.timestamp);
        if (!match) continue;
        matchedTrades.push({
          trade,
          barTimestamp: match.bar.timestamp,
          anchorPrice: trade.side === "buy" ? match.bar.low : match.bar.high,
        });
      }

      const nextSig = [
        symbol.id,
        theme,
        backtestOverlay.strategyLabel,
        ...matchedTrades.map(
          (m) =>
            `${m.trade.id}:${m.barTimestamp}:${m.trade.side}:${m.trade.price.toFixed(4)}`
        ),
      ].join("#");

      if (nextSig === backtestOverlaySigRef.current) return;

      chart.removeOverlay({ groupId: BACKTEST_OVERLAY_GROUP_ID });

      const toCreate = matchedTrades.map((m) => {
        const isBuy = m.trade.side === "buy";
        const color = isBuy ? buyColor : sellColor;
        const label = `${isBuy ? "测·买" : "测·卖"} ${m.trade.price.toFixed(
          prec
        )}`;
        return {
          name: "tbBacktestMarker",
          groupId: BACKTEST_OVERLAY_GROUP_ID,
          paneId: "candle_pane",
          lock: true,
          zLevel: -1,
          fixedZLevel: true,
          points: [{ timestamp: m.barTimestamp, value: m.anchorPrice }],
          extendData: {
            side: m.trade.side,
            label,
            color,
            badgeBg,
            badgeText: color,
          } satisfies BacktestMarkerExtendData,
        };
      });

      if (toCreate.length > 0) {
        chart.createOverlay(toCreate);
      }
      backtestOverlaySigRef.current = nextSig;
    }, [ready, symbol.id, symbol.pricePrecision, bars, theme, backtestOverlay]);

    const restoreUserDrawingsImpl = useCallback(
      (drawings: TemplateDrawing[]): DrawnOverlayRecord[] => {
        const chart = chartRef.current;
        if (!chart) return [];
        pendingOverlayIdRef.current = null;
        chart.removeOverlay({ groupId: USER_DRAWING_GROUP_ID });

        const restoredRecords: DrawnOverlayRecord[] = [];
        for (const d of drawings) {
          if (!d.points || d.points.length === 0) continue;
          const worldPoints = d.points
            .filter(
              (pt) =>
                (typeof pt.timestamp === "number" && Number.isFinite(pt.timestamp)) ||
                (typeof pt.value === "number" && Number.isFinite(pt.value))
            )
            .map((pt) => ({
              ...(typeof pt.timestamp === "number" ? { timestamp: pt.timestamp } : {}),
              ...(typeof pt.value === "number" ? { value: pt.value } : {}),
            }));
          if (worldPoints.length === 0) continue;

          const extendData =
            d.tool === "text"
              ? d.annotationText ?? d.label.replace(/^文字：/, "")
              : d.tool === "measure"
              ? ({
                  pricePrecision:
                    d.measurePricePrecision ?? symbolPrecRef.current,
                  interval: d.measureInterval ?? intervalRef.current,
                } satisfies MeasureExtendData)
              : undefined;

          const created = chart.createOverlay({
            name: d.klineOverlayName,
            groupId: USER_DRAWING_GROUP_ID,
            paneId: "candle_pane",
            points: worldPoints,
            extendData,
            onPressedMoveEnd:
              d.tool === "measure"
                ? ({ overlay }) => {
                    const stats = computeMeasureStats(
                      overlay.points,
                      chart.getDataList(),
                      symbolPrecRef.current,
                      intervalRef.current
                    );
                    onOverlayUpdatedRef.current?.(overlay.id, stats.shortLabel);
                  }
                : undefined,
          });
          const createdId = Array.isArray(created) ? created[0] : created;
          if (typeof createdId === "string" && createdId) {
            restoredRecords.push({
              id: createdId,
              tool: d.tool,
              label: d.label,
              klineOverlayName: d.klineOverlayName,
              createdAt: d.createdAt || Date.now(),
            });
          }
        }
        return restoredRecords;
      },
      []
    );

    const onDrawingsRestoredRef = useRef(onDrawingsRestored);
    onDrawingsRestoredRef.current = onDrawingsRestored;

    // Automatically restore queued template drawings once chart & bars are ready
    useEffect(() => {
      if (!ready || loading || !pendingRestoreDrawings || bars.length === 0) {
        return;
      }
      const restored = restoreUserDrawingsImpl(pendingRestoreDrawings);
      onDrawingsRestoredRef.current?.(restored);
    }, [ready, loading, bars, pendingRestoreDrawings, restoreUserDrawingsImpl]);

    // Adjust sub-pane heights smoothly when switching between single and multi-chart layouts
    useEffect(() => {
      const chart = chartRef.current;
      if (!ready || !chart) return;
      const currentMap = indicatorIdsRef.current;
      for (const indId of ["VOL", "RSI", "MACD"] as const) {
        const entry = currentMap[indId];
        if (!entry) continue;
        chart.setPaneOptions({
          id: entry.paneId,
          height: compact
            ? indId === "VOL"
              ? 58
              : 66
            : indId === "VOL"
            ? 96
            : 112,
          minHeight: compact ? 40 : 60,
          dragEnabled: true,
        });
      }
      chart.resize();
    }, [ready, compact]);

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

          // Cancel any unfinished drawing before starting a new one
          if (pendingOverlayIdRef.current) {
            chart.removeOverlay({ id: pendingOverlayIdRef.current });
            pendingOverlayIdRef.current = null;
          }

          const extendData =
            tool === "text"
              ? textVal?.trim() || "关键观察位"
              : tool === "measure"
              ? ({
                  pricePrecision: symbolPrecRef.current,
                  interval: intervalRef.current,
                } satisfies MeasureExtendData)
              : undefined;

          const created = chart.createOverlay({
            name: spec.name,
            groupId: USER_DRAWING_GROUP_ID,
            paneId: "candle_pane",
            mode: magnet ? "weak_magnet" : "normal",
            extendData,
            onDrawEnd: ({ overlay }) => {
              if (pendingOverlayIdRef.current === overlay.id) {
                pendingOverlayIdRef.current = null;
              }
              let label = spec.label;
              if (tool === "text") {
                label = `文字：${textVal?.trim() || "关键观察位"}`;
              } else if (tool === "measure") {
                const stats = computeMeasureStats(
                  overlay.points,
                  chart.getDataList(),
                  symbolPrecRef.current,
                  intervalRef.current
                );
                label = stats.shortLabel;
              }
              onOverlayCreatedRef.current({
                id: overlay.id,
                tool,
                label,
                klineOverlayName: spec.name,
                createdAt: Date.now(),
              });
              onCancelToolRef.current();
            },
            onPressedMoveEnd:
              tool === "measure"
                ? ({ overlay }) => {
                    const stats = computeMeasureStats(
                      overlay.points,
                      chart.getDataList(),
                      symbolPrecRef.current,
                      intervalRef.current
                    );
                    onOverlayUpdatedRef.current?.(overlay.id, stats.shortLabel);
                  }
                : undefined,
          });

          const overlayId = Array.isArray(created) ? created[0] : created;
          if (typeof overlayId === "string" && overlayId) {
            pendingOverlayIdRef.current = overlayId;
          } else {
            onCancelToolRef.current();
          }
        },
        cancelPendingDrawing: () => {
          const chart = chartRef.current;
          if (chart && pendingOverlayIdRef.current) {
            chart.removeOverlay({ id: pendingOverlayIdRef.current });
            pendingOverlayIdRef.current = null;
          }
        },
        removeOverlayById: (id: string) => {
          if (pendingOverlayIdRef.current === id) {
            pendingOverlayIdRef.current = null;
          }
          chartRef.current?.removeOverlay({ id });
        },
        clearAllOverlays: () => {
          pendingOverlayIdRef.current = null;
          chartRef.current?.removeOverlay({ groupId: USER_DRAWING_GROUP_ID });
        },
        exportUserDrawings: (records: DrawnOverlayRecord[]): TemplateDrawing[] => {
          const chart = chartRef.current;
          if (!chart) return [];
          const overlays = chart.getOverlays({ groupId: USER_DRAWING_GROUP_ID });
          const byId = new Map(overlays.map((o) => [o.id, o]));
          const result: TemplateDrawing[] = [];

          for (const rec of records) {
            const ov = byId.get(rec.id);
            if (!ov || !ov.points || ov.points.length === 0) continue;
            const worldPoints = ov.points
              .map((pt) => {
                const ts =
                  typeof pt.timestamp === "number" && Number.isFinite(pt.timestamp)
                    ? pt.timestamp
                    : typeof pt.dataIndex === "number" &&
                      barsRef.current[pt.dataIndex]
                    ? barsRef.current[pt.dataIndex].timestamp
                    : undefined;
                const val =
                  typeof pt.value === "number" && Number.isFinite(pt.value)
                    ? pt.value
                    : undefined;
                return {
                  ...(ts !== undefined ? { timestamp: ts } : {}),
                  ...(val !== undefined ? { value: val } : {}),
                };
              })
              .filter(
                (pt) => pt.timestamp !== undefined || pt.value !== undefined
              );

            if (worldPoints.length === 0) continue;

            const item: TemplateDrawing = {
              id: rec.id,
              tool: rec.tool,
              label: rec.label,
              klineOverlayName: rec.klineOverlayName,
              points: worldPoints,
              createdAt: rec.createdAt,
            };

            if (rec.tool === "text") {
              item.annotationText =
                typeof ov.extendData === "string"
                  ? ov.extendData
                  : rec.label.replace(/^文字：/, "");
            } else if (rec.tool === "measure") {
              const ext = ov.extendData as MeasureExtendData | undefined;
              item.measurePricePrecision =
                ext?.pricePrecision ?? symbolPrecRef.current;
              item.measureInterval = ext?.interval ?? intervalRef.current;
            }
            result.push(item);
          }

          return result;
        },
        restoreUserDrawings: restoreUserDrawingsImpl,
        fitRange,
      }),
      [fitRange, restoreUserDrawingsImpl]
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

    const handleCanvasClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!pickReplayStartMode || !onPickReplayStart) return;
        const chart = chartRef.current;
        const el = containerRef.current;
        const currentBars = barsRef.current;
        if (!chart || !el || currentBars.length === 0) return;

        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const converted = chart.convertFromPixel([{ x, y }], {
          paneId: "candle_pane",
        });
        const pt = Array.isArray(converted) ? converted[0] : converted;
        let idx = typeof pt?.dataIndex === "number" ? Math.round(pt.dataIndex) : -1;
        if (idx < 0 && typeof pt?.timestamp === "number") {
          const match = findNearestBarByTimestamp(currentBars, pt.timestamp);
          idx = match ? match.index : -1;
        }
        if (idx < 0) return;
        const clamped = Math.max(0, Math.min(idx, currentBars.length - 1));
        onPickReplayStart(clamped, currentBars[clamped].timestamp);
      },
      [pickReplayStartMode, onPickReplayStart]
    );

    const handleCanvasMouseLeave = useCallback(() => {
      onCrosshairTsRef.current?.(null);
    }, []);

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
        <div
          className={`relative min-h-0 flex-1 overflow-hidden ${
            pickReplayStartMode ? "cursor-crosshair" : ""
          }`}
          onClick={handleCanvasClick}
          onMouseLeave={handleCanvasMouseLeave}
        >
          <div ref={containerRef} className="h-full w-full" />

          {/* Top-Left Compact Chart Status Legend */}
          <div
            className={`pointer-events-none absolute left-2 top-1 z-10 flex flex-col gap-0.5 ${
              compact ? "max-w-[calc(100%-74px)]" : "max-w-[calc(100%-96px)]"
            }`}
          >
            <div
              className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight ${
                compact ? "text-[10px]" : "text-[11px]"
              }`}
            >
              {!compact && (
                <>
                  <span className="font-bold text-[12px] tb-text-primary">
                    {symbol.ticker}
                  </span>
                  <span className="tb-text-secondary font-medium">
                    {symbol.name}
                  </span>
                  <span className="tb-text-muted">
                    · {interval} · {symbol.exchange}
                  </span>
                </>
              )}

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
                {!compact && provenance.dateRange
                  ? ` (${provenance.dateRange})`
                  : ""}
              </span>

              {/* Replay Status Badge */}
              {replayBadge && (
                <span
                  className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.18)",
                    color: "var(--status-delayed)",
                  }}
                >
                  {replayBadge}
                </span>
              )}

              {/* Crosshair Sync Nearest/Offscreen Alignment Notice */}
              {syncAlignNotice && (
                <span
                  title={syncAlignNotice.title}
                  className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent-primary)",
                  }}
                >
                  光标 {syncAlignNotice.text}
                </span>
              )}

              {/* Live OHLCV Hover Readout */}
              {displayBar && (
                <div
                  className={`flex items-center gap-1.5 tabular-nums ${
                    compact ? "text-[10px]" : "text-[11px]"
                  }`}
                >
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
                  <span
                    className={
                      isUp ? "tb-up font-medium" : "tb-down font-medium"
                    }
                  >
                    {compact
                      ? `${isUp ? "+" : ""}${diffPct.toFixed(2)}%`
                      : `${isUp ? "+" : ""}${diff.toFixed(prec)} (${
                          isUp ? "+" : ""
                        }${diffPct.toFixed(2)}%)`}
                  </span>
                  {displayBar.volume > 0 && !compact && (
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
                  style={{
                    backgroundColor:
                      theme === "dark"
                        ? "rgba(19, 23, 34, 0.78)"
                        : "rgba(247, 249, 252, 0.86)",
                  }}
                >
                  <span>{indId}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveIndicator(indId);
                    }}
                    title={`关闭 ${indId}`}
                    className="tb-text-muted hover:text-[#F2485B] cursor-pointer"
                  >
                    <IconClose size={10} />
                  </button>
                </span>
              ))}

              {/* Quick Toggle for Paper Trading Chart Overlays (visible when this symbol has position/orders/fills) */}
              {paperOverlay &&
                onTogglePaperOverlay &&
                (paperOverlay.position ||
                  paperOverlay.openOrders.length > 0 ||
                  paperOverlay.fills.length > 0) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePaperOverlay();
                    }}
                    title="开关主图模拟盘标记（持仓成本线、限价挂单线、买卖点）"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer"
                    style={
                      paperOverlay.enabled
                        ? {
                            backgroundColor: "rgba(245, 158, 11, 0.16)",
                            borderColor: "rgba(245, 158, 11, 0.45)",
                            color: "var(--status-delayed)",
                          }
                        : {
                            backgroundColor:
                              theme === "dark"
                                ? "rgba(19, 23, 34, 0.78)"
                                : "rgba(247, 249, 252, 0.86)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    <span>
                      模拟盘标记：{paperOverlay.enabled ? "开" : "关"}
                    </span>
                  </button>
                )}

              {/* Quick Toggle for Local Price Alert Lines */}
              {alertOverlay &&
                onToggleAlertOverlay &&
                alertOverlay.priceAlerts.some((a) => a.enabled) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAlertOverlay();
                    }}
                    title="开关主图价格提醒线"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer"
                    style={
                      alertOverlay.enabled
                        ? {
                            backgroundColor: "rgba(6, 182, 212, 0.16)",
                            borderColor: "rgba(6, 182, 212, 0.45)",
                            color: "#06B6D4",
                          }
                        : {
                            backgroundColor:
                              theme === "dark"
                                ? "rgba(19, 23, 34, 0.78)"
                                : "rgba(247, 249, 252, 0.86)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    <span>
                      提醒线：{alertOverlay.enabled ? "开" : "关"} (
                      {alertOverlay.priceAlerts.filter((a) => a.enabled).length})
                    </span>
                  </button>
                )}

              {/* Quick Toggle for Educational Backtest Buy/Sell Markers */}
              {backtestOverlay &&
                onToggleBacktestOverlay &&
                backtestOverlay.trades.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBacktestOverlay();
                    }}
                    title={`开关主图回测买卖点（${backtestOverlay.strategyLabel}）`}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer"
                    style={
                      backtestOverlay.enabled
                        ? {
                            backgroundColor: "rgba(56, 189, 248, 0.16)",
                            borderColor: "rgba(56, 189, 248, 0.45)",
                            color: "#38BDF8",
                          }
                        : {
                            backgroundColor:
                              theme === "dark"
                                ? "rgba(19, 23, 34, 0.78)"
                                : "rgba(247, 249, 252, 0.86)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }
                    }
                  >
                    <span>
                      回测买卖点：{backtestOverlay.enabled ? "开" : "关"} (
                      {backtestOverlay.trades.length})
                    </span>
                  </button>
                )}
            </div>
          </div>

          {/* Replay Pick-Start Active Banner */}
          {pickReplayStartMode && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 top-2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-md border px-3 py-1 text-[11px] shadow-lg"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--status-delayed)",
              }}
            >
              <span
                className="font-semibold"
                style={{ color: "var(--status-delayed)" }}
              >
                点选回放起点
              </span>
              <span className="tb-text-secondary">
                点击任意一根 K 线位置从此处开始回放（Esc 取消）
              </span>
              {onCancelPickReplayStart && (
                <button
                  type="button"
                  onClick={onCancelPickReplayStart}
                  className="rounded px-1.5 py-0.5 text-[10px] tb-text-muted tb-hover cursor-pointer"
                >
                  取消
                </button>
              )}
            </div>
          )}

          {/* Drawing Tool Active Banner */}
          {!pickReplayStartMode && activeTool !== "cursor" && activeToolSpec && (
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

          {/* Empty Data Overlay (e.g. online-only FRED index when offline) */}
          {!loading && bars.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="tb-elevated tb-border-subtle max-w-md rounded-lg border px-4 py-3 text-center shadow-lg">
                <div className="text-[13px] font-semibold tb-text-primary">
                  暂未获取到 {symbol.ticker}（{symbol.name}）的历史 K 线
                </div>
                <p className="mt-1 text-[11px] leading-relaxed tb-text-secondary">
                  {provenance.fallbackReason ||
                    "当前处于离线环境或上游公开源暂不可达，请检查网络连接后重新点击该品种，或切换其他已捆绑历史样本的品种。"}
                </p>
              </div>
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
        <div
          className={`tb-panel tb-border flex shrink-0 items-center justify-between border-t px-2 ${
            compact ? "h-[22px] text-[10px]" : "h-[28px] px-2.5 text-[11px]"
          }`}
        >
          <div className="flex items-center gap-0.5">
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

          <div className="flex items-center gap-2 tabular-nums tb-text-secondary">
            {!compact && (
              <>
                <span className="hidden sm:inline text-[11px] tb-text-muted">
                  {clock ? `${clock} UTC+8` : "UTC+8"}
                </span>
                <div className="h-3 w-px bg-[var(--border-hairline)]" />
              </>
            )}
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
