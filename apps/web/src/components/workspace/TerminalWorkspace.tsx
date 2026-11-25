"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  BarsResponse,
  ChartType,
  ColorScheme,
  DrawingToolId,
  DrawnOverlayRecord,
  IndicatorId,
  Interval,
  NormalizedBar,
  ThemeMode,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";
import type { AdapterEnvStatus } from "@trade-buddy/market-adapters";

import { TopBar } from "./TopBar";
import { LeftDrawingBar } from "./LeftDrawingBar";
import { RightIconRail, type RightPanelTab } from "./RightIconRail";
import { BottomDock } from "./BottomDock";
import {
  KLineChartStage,
  type KLineChartHandle,
} from "@/components/chart/KLineChartStage";
import { WatchlistAndDetails } from "@/components/panels/WatchlistAndDetails";
import { DataWindowAndTree } from "@/components/panels/DataWindowAndTree";
import { SymbolSearchModal } from "@/components/dialogs/SymbolSearchModal";
import { IndicatorModal } from "@/components/dialogs/IndicatorModal";

interface TerminalWorkspaceProps {
  initialData: BarsResponse;
  initialWatchlist: WatchlistSummaryItem[];
  envStatus: AdapterEnvStatus;
}

export function TerminalWorkspace({
  initialData,
  initialWatchlist,
  envStatus,
}: TerminalWorkspaceProps) {
  const chartRef = useRef<KLineChartHandle>(null);

  // Market & Chart Data State
  const [chartData, setChartData] = useState<BarsResponse>(initialData);
  const [watchlist, setWatchlist] =
    useState<WatchlistSummaryItem[]>(initialWatchlist);
  const [loading, setLoading] = useState(false);

  // Visual & Preference State (Dark + Intl Green-Up/Red-Down Default)
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("intl");
  const [chartType, setChartType] = useState<ChartType>("candle_solid");

  // Indicators & Drawings State
  const [activeIndicators, setActiveIndicators] = useState<IndicatorId[]>([
    "MA",
    "VOL",
  ]);
  const [activeTool, setActiveTool] = useState<DrawingToolId>("cursor");
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [annotationText, setAnnotationText] = useState("关键观察位");
  const [drawings, setDrawings] = useState<DrawnOverlayRecord[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Panels & Dialogs State
  const [rightTab, setRightTab] = useState<RightPanelTab | null>("watchlist");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [indicatorOpen, setIndicatorOpen] = useState(false);

  // Crosshair Live Hover State (shared with Data Window)
  const [hoveredBar, setHoveredBar] = useState<NormalizedBar | null>(
    initialData.bars[initialData.bars.length - 1] ?? null
  );
  const [hoveredPrevClose, setHoveredPrevClose] = useState<number | null>(
    initialData.bars.length >= 2
      ? initialData.bars[initialData.bars.length - 2].close
      : null
  );

  // Sync HTML data-theme & data-color-scheme tokens
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-color-scheme", colorScheme);
  }, [theme, colorScheme]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // Load new symbol / interval via local Next.js API Route
  const fetchBars = useCallback(
    async (symbolId: string, interval: Interval) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/bars?symbol=${encodeURIComponent(
            symbolId
          )}&interval=${encodeURIComponent(interval)}`
        );
        if (!res.ok) throw new Error("Failed to load bars");
        const nextData = (await res.json()) as BarsResponse;
        setChartData(nextData);
        // Update matching watchlist row if live quote refreshed (e.g. FRED SP500)
        setWatchlist((prev) =>
          prev.map((item) =>
            item.symbol.id === nextData.symbol.id
              ? {
                  ...item,
                  quote: nextData.quote,
                  provenance: nextData.provenance,
                }
              : item
          )
        );
        // Clear previous symbol overlays when switching ticker
        if (symbolId !== chartData.symbol.id) {
          chartRef.current?.clearAllOverlays();
          setDrawings([]);
          setActiveTool("cursor");
        }
      } catch {
        showToast("加载行情失败，已保持当前数据");
      } finally {
        setLoading(false);
      }
    },
    [chartData.symbol.id, showToast]
  );

  const handleSelectSymbol = useCallback(
    (symbolId: string) => {
      const target = watchlist.find((w) => w.symbol.id === symbolId)?.symbol;
      const nextInterval: Interval =
        target && target.supportedIntervals.includes(chartData.interval)
          ? chartData.interval
          : "1D";
      void fetchBars(symbolId, nextInterval);
    },
    [watchlist, chartData.interval, fetchBars]
  );

  const handleChangeInterval = useCallback(
    (nextInterval: Interval) => {
      if (nextInterval === chartData.interval) return;
      void fetchBars(chartData.symbol.id, nextInterval);
    },
    [chartData.interval, chartData.symbol.id, fetchBars]
  );

  const handleToggleIndicator = useCallback((id: IndicatorId) => {
    setActiveIndicators((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const handleSelectDrawingTool = useCallback(
    (tool: DrawingToolId) => {
      if (tool === "cursor") {
        setActiveTool("cursor");
        return;
      }
      if (tool === "measure") {
        showToast("测距尺工具将在后续批次完善，目前可使用趋势线/斐波那契/矩形等 7 种画线工具");
        return;
      }
      setActiveTool(tool);
      chartRef.current?.startDrawing(tool, magnetEnabled, annotationText);
    },
    [magnetEnabled, annotationText, showToast]
  );

  const handleRemoveDrawing = useCallback((id: string) => {
    chartRef.current?.removeOverlayById(id);
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleClearDrawings = useCallback(() => {
    chartRef.current?.clearAllOverlays();
    setDrawings([]);
    setActiveTool("cursor");
  }, []);

  const handleSelectRightTab = useCallback((tab: RightPanelTab) => {
    setRightTab((prev) => (prev === tab ? null : tab));
  }, []);

  // Desktop keyboard shortcuts (type letter/digit -> symbol search, '/' -> indicators, Esc -> cursor)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setSearchOpen(false);
        setIndicatorOpen(false);
        setActiveTool("cursor");
        return;
      }

      if (isEditing || searchOpen || indicatorOpen) return;

      if (e.key === "/") {
        e.preventDefault();
        setIndicatorOpen(true);
        return;
      }

      if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "t") {
          e.preventDefault();
          handleSelectDrawingTool("trendline");
        } else if (k === "h") {
          e.preventDefault();
          handleSelectDrawingTool("horizontal");
        } else if (k === "r") {
          e.preventDefault();
          handleSelectDrawingTool("rectangle");
        } else if (k === "f") {
          e.preventDefault();
          handleSelectDrawingTool("fibonacci");
        }
        return;
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        /^[a-zA-Z0-9]$/.test(e.key)
      ) {
        e.preventDefault();
        setSearchInitialQuery(e.key);
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, indicatorOpen, handleSelectDrawingTool]);

  return (
    <div className="tb-canvas flex h-screen w-screen flex-col overflow-hidden">
      {/* Zone 1: TopBar (40px) */}
      <TopBar
        symbol={chartData.symbol}
        interval={chartData.interval}
        chartType={chartType}
        activeIndicators={activeIndicators}
        colorScheme={colorScheme}
        theme={theme}
        onOpenSearch={() => {
          setSearchInitialQuery("");
          setSearchOpen(true);
        }}
        onChangeInterval={handleChangeInterval}
        onChangeChartType={setChartType}
        onOpenIndicators={() => setIndicatorOpen(true)}
        onToggleColorScheme={() =>
          setColorScheme((prev) => (prev === "intl" ? "cn" : "intl"))
        }
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
      />

      {/* Main 5-Zone Middle Shell */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Zone 2: Left Drawing Toolbar (48px) */}
        <LeftDrawingBar
          activeTool={activeTool}
          magnetEnabled={magnetEnabled}
          drawingCount={drawings.length}
          onSelectTool={handleSelectDrawingTool}
          onToggleMagnet={() => setMagnetEnabled((v) => !v)}
          onClearDrawings={handleClearDrawings}
        />

        {/* Zone 3 + Zone 5: Center Chart Stage + Bottom Dock */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <KLineChartStage
            ref={chartRef}
            symbol={chartData.symbol}
            interval={chartData.interval}
            bars={chartData.bars}
            provenance={chartData.provenance}
            loading={loading}
            theme={theme}
            colorScheme={colorScheme}
            chartType={chartType}
            activeIndicators={activeIndicators}
            activeTool={activeTool}
            annotationText={annotationText}
            onChangeAnnotationText={setAnnotationText}
            onCancelDrawingTool={() => setActiveTool("cursor")}
            onCrosshairChange={(bar, prevClose) => {
              setHoveredBar(bar);
              setHoveredPrevClose(prevClose);
            }}
            onOverlayCreated={(rec) =>
              setDrawings((prev) => [...prev, rec])
            }
            onRemoveIndicator={handleToggleIndicator}
          />

          {/* Zone 5: Bottom Collapsible Research Notes / Provenance Dock */}
          <BottomDock
            symbol={chartData.symbol}
            provenance={chartData.provenance}
            envStatus={envStatus}
          />
        </div>

        {/* Zone 4: Right Collapsible Panel (304px) */}
        {rightTab && (
          <aside className="tb-panel tb-border flex w-[288px] xl:w-[312px] shrink-0 flex-col border-l overflow-hidden">
            {rightTab === "watchlist" && (
              <WatchlistAndDetails
                watchlist={watchlist}
                activeSymbol={chartData.symbol}
                activeQuote={chartData.quote}
                activeProvenance={chartData.provenance}
                onSelectSymbol={handleSelectSymbol}
              />
            )}

            {(rightTab === "data" || rightTab === "tree") && (
              <DataWindowAndTree
                mode={rightTab}
                onChangeMode={(m) => setRightTab(m)}
                symbol={chartData.symbol}
                interval={chartData.interval}
                provenance={chartData.provenance}
                hoveredBar={hoveredBar}
                prevBarClose={hoveredPrevClose}
                activeIndicators={activeIndicators}
                drawings={drawings}
                onRemoveIndicator={handleToggleIndicator}
                onRemoveDrawing={handleRemoveDrawing}
                onClearDrawings={handleClearDrawings}
              />
            )}

            {(rightTab === "news" || rightTab === "calendar") && (
              <div className="flex h-full flex-col">
                <div className="tb-border flex h-[36px] items-center justify-between border-b px-3">
                  <span className="text-[12px] font-semibold tb-text-primary">
                    {rightTab === "news" ? "财经资讯流" : "宏观与财报日历"}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.16)",
                      color: "var(--status-delayed)",
                    }}
                  >
                    占位 · 后续批次
                  </span>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center p-5 text-center text-[12px] tb-text-secondary">
                  <div className="font-semibold tb-text-primary mb-1.5">
                    {rightTab === "news"
                      ? "财经新闻流模块（规划第 1 期后续批次）"
                      : "宏观经济与财报日历（规划第 1 期后续批次）"}
                  </div>
                  <p className="text-[11px] tb-text-muted leading-relaxed">
                    本批为本地首版看盘终端，暂以占位面板呈现。后续将按规划接入合法免费资讯源（Finnhub Free / 官方公开 RSS / FRED 宏观日历），仅展示标题、来源与外链原文。
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Rightmost Narrow Icon Rail (42px) */}
        <RightIconRail
          activeTab={rightTab}
          onSelectTab={handleSelectRightTab}
        />
      </div>

      {/* Modals */}
      <SymbolSearchModal
        open={searchOpen}
        initialQuery={searchInitialQuery}
        items={watchlist}
        currentSymbolId={chartData.symbol.id}
        onSelect={handleSelectSymbol}
        onClose={() => setSearchOpen(false)}
      />

      <IndicatorModal
        open={indicatorOpen}
        activeIndicators={activeIndicators}
        onToggleIndicator={handleToggleIndicator}
        onClose={() => setIndicatorOpen(false)}
      />

      {/* Lightweight Toast */}
      {toastMsg && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md border tb-border-subtle bg-[var(--bg-elevated)] px-3.5 py-2 text-[12px] tb-text-primary shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
