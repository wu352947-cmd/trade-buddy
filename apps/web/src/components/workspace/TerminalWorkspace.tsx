"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlertTriggerEvent,
  BarsResponse,
  ChartType,
  ColorScheme,
  DrawingToolId,
  DrawnOverlayRecord,
  IndicatorId,
  Interval,
  LayoutMode,
  LayoutSyncConfig,
  MarketCategory,
  NormalizedBar,
  PaneId,
  PaneLinkOverrides,
  TemplateDrawing,
  ThemeMode,
  WatchlistGroup,
  WatchlistSummaryItem,
  WorkspaceTemplate,
  WorkspaceTemplatesStore,
} from "@trade-buddy/shared-types";
import type { AdapterEnvStatus } from "@trade-buddy/market-adapters";
import {
  IconBell,
  IconClose,
  IconLayoutSingle,
  IconLink,
  IconUnlink,
} from "@trade-buddy/ui-tokens";

import { TopBar } from "./TopBar";
import { LeftDrawingBar } from "./LeftDrawingBar";
import { RightIconRail, type RightPanelTab } from "./RightIconRail";
import { BottomDock } from "./BottomDock";
import { ReplayBar } from "./ReplayBar";
import {
  KLineChartStage,
  type AlertChartOverlayData,
  type BacktestChartOverlayData,
  type KLineChartHandle,
  type PaperChartOverlayData,
} from "@/components/chart/KLineChartStage";
import type { BacktestPublishedOverlay } from "@/components/panels/BacktestPanel";
import { WatchlistAndDetails } from "@/components/panels/WatchlistAndDetails";
import { AlertsPanel } from "@/components/panels/AlertsPanel";
import { DataWindowAndTree } from "@/components/panels/DataWindowAndTree";
import { NewsFlowPanel } from "@/components/panels/NewsFlowPanel";
import { EconomicCalendarPanel } from "@/components/panels/EconomicCalendarPanel";
import { FundamentalsPanel } from "@/components/panels/FundamentalsPanel";
import { ScreenerDrawer } from "@/components/panels/ScreenerDrawer";
import { SymbolSearchModal } from "@/components/dialogs/SymbolSearchModal";
import { IndicatorModal } from "@/components/dialogs/IndicatorModal";
import { ReplayProvider, useReplay } from "@/lib/replay-store";
import {
  PaperTradingProvider,
  usePaperTrading,
} from "@/lib/paper-trading-store";
import type { PaperMarketSnapshot } from "@/lib/paper-trading";
import { AlertsProvider, useAlerts } from "@/lib/alerts-store";
import {
  isPriceAlertCondition,
  type AlertEvaluationFeed,
} from "@/lib/local-alerts";
import {
  addSymbolToWatchlistGroup,
  buildDefaultWatchlistGroups,
  createDefaultWatchlistGroupsStore,
  createWatchlistGroup,
  deleteWatchlistGroup,
  loadWatchlistGroupsStore,
  removeSymbolFromWatchlistGroup,
  renameWatchlistGroup,
  reorderSymbolInWatchlistGroups,
  reorderWatchlistGroups,
  saveWatchlistGroupsStore,
  toggleWatchlistGroupCollapsed,
  WATCHLIST_GROUPS_STORAGE_KEY,
} from "@/lib/watchlist-groups";
import {
  buildNewWorkspaceTemplate,
  createEmptyWorkspaceTemplatesStore,
  loadWorkspaceTemplatesStore,
  overwriteWorkspaceTemplate,
  parseImportedTemplatesJson,
  sanitizeFilenameSegment,
  saveWorkspaceTemplatesStore,
  serializeBundleTemplatesExport,
  serializeSingleTemplateExport,
  triggerJsonDownload,
  WORKSPACE_TEMPLATES_STORAGE_KEY,
  type WorkspaceTemplateSnapshotInput,
} from "@/lib/workspace-templates";
import {
  deriveQuoteFromBars,
  formatBarTimestamp,
  sliceBarsUpToTimestamp,
} from "@/lib/chart-sync";
import {
  applyDocumentPreferences,
  DEFAULT_SYMBOL_BY_MARKET,
  loadUserPreferences,
  patchUserPreferences,
  PREFERENCES_STORAGE_KEY,
} from "@/lib/preferences";

const ALL_PANE_IDS: readonly PaneId[] = ["pane-1", "pane-2", "pane-3", "pane-4"];

const PANE_LABELS: Record<PaneId, string> = {
  "pane-1": "#1",
  "pane-2": "#2",
  "pane-3": "#3",
  "pane-4": "#4",
};

interface ChartPaneState {
  id: PaneId;
  initialized: boolean;
  data: BarsResponse;
  loading: boolean;
  chartType: ChartType;
  activeIndicators: IndicatorId[];
  drawings: DrawnOverlayRecord[];
  pendingRestoreDrawings: TemplateDrawing[] | null;
  links: PaneLinkOverrides;
  hoveredBar: NormalizedBar | null;
  hoveredPrevClose: number | null;
}

interface TerminalWorkspaceProps {
  initialData: BarsResponse;
  initialWatchlist: WatchlistSummaryItem[];
  envStatus: AdapterEnvStatus;
}

function createInitialPanes(
  initialData: BarsResponse
): Record<PaneId, ChartPaneState> {
  const lastBar = initialData.bars[initialData.bars.length - 1] ?? null;
  const prevClose =
    initialData.bars.length >= 2
      ? initialData.bars[initialData.bars.length - 2].close
      : null;

  const makePane = (id: PaneId, initialized: boolean): ChartPaneState => ({
    id,
    initialized,
    data: initialData,
    loading: false,
    chartType: "candle_solid",
    activeIndicators: ["MA", "VOL"],
    drawings: [],
    pendingRestoreDrawings: null,
    links: { symbol: true, interval: true, crosshair: true },
    hoveredBar: lastBar,
    hoveredPrevClose: prevClose,
  });

  return {
    "pane-1": makePane("pane-1", true),
    "pane-2": makePane("pane-2", false),
    "pane-3": makePane("pane-3", false),
    "pane-4": makePane("pane-4", false),
  };
}

function computeVisiblePaneIds(
  layout: LayoutMode,
  activePaneId: PaneId
): PaneId[] {
  if (layout === "single") {
    return [activePaneId];
  }
  if (layout === "split_h" || layout === "split_v") {
    if (activePaneId === "pane-1" || activePaneId === "pane-2") {
      return ["pane-1", "pane-2"];
    }
    return [activePaneId, activePaneId === "pane-3" ? "pane-4" : "pane-1"];
  }
  return ["pane-1", "pane-2", "pane-3", "pane-4"];
}

function pickNextWatchlistSymbols(
  watchlist: WatchlistSummaryItem[],
  usedSymbolIds: Set<string>,
  count: number
): string[] {
  // Prefer symbols with local sample data (quote.last > 0) so multi-chart works smoothly offline
  const sorted = [
    ...watchlist.filter((w) => w.quote.last > 0),
    ...watchlist.filter((w) => w.quote.last <= 0),
  ];
  const picked: string[] = [];
  for (const item of sorted) {
    if (picked.length >= count) break;
    if (!usedSymbolIds.has(item.symbol.id)) {
      usedSymbolIds.add(item.symbol.id);
      picked.push(item.symbol.id);
    }
  }
  // Fallback if watchlist had fewer distinct entries
  for (const item of sorted) {
    if (picked.length >= count) break;
    picked.push(item.symbol.id);
  }
  return picked;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [alertToasts, setAlertToasts] = useState<AlertTriggerEvent[]>([]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const pushAlertToasts = useCallback((events: AlertTriggerEvent[]) => {
    if (events.length === 0) return;
    setAlertToasts((prev) => [...events, ...prev].slice(0, 4));
    for (const ev of events) {
      window.setTimeout(() => {
        setAlertToasts((prev) => prev.filter((item) => item.id !== ev.id));
      }, 9000);
    }
  }, []);

  const dismissAlertToast = useCallback((id: string) => {
    setAlertToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ReplayProvider
      onReachEnd={() => showToast("已回放至最新一根 K 线")}
    >
      <PaperTradingProvider
        onOrderFilled={(fills) => {
          if (fills.length === 1) {
            const f = fills[0];
            showToast(
              `虚拟限价${f.side === "buy" ? "买" : "卖"}单成交：${f.ticker} × ${f.quantity} @ ${f.price.toFixed(
                f.pricePrecision
              )}${f.matchMode === "replay" ? "（回放撮合）" : ""}`
            );
          } else if (fills.length > 1) {
            showToast(`已有 ${fills.length} 笔虚拟限价挂单触发成交`);
          }
        }}
      >
        <AlertsProvider onAlertsTriggered={pushAlertToasts}>
          <TerminalWorkspaceInner
            {...props}
            toastMsg={toastMsg}
            showToast={showToast}
            alertToasts={alertToasts}
            dismissAlertToast={dismissAlertToast}
          />
        </AlertsProvider>
      </PaperTradingProvider>
    </ReplayProvider>
  );
}

interface TerminalWorkspaceInnerProps extends TerminalWorkspaceProps {
  toastMsg: string | null;
  showToast: (msg: string) => void;
  alertToasts: AlertTriggerEvent[];
  dismissAlertToast: (id: string) => void;
}

function TerminalWorkspaceInner({
  initialData,
  initialWatchlist,
  envStatus,
  toastMsg,
  showToast,
  alertToasts,
  dismissAlertToast,
}: TerminalWorkspaceInnerProps) {
  const chartRefs = useRef<Record<PaneId, KLineChartHandle | null>>({
    "pane-1": null,
    "pane-2": null,
    "pane-3": null,
    "pane-4": null,
  });

  // Multi-Chart Layout & Sync State
  const [layout, setLayout] = useState<LayoutMode>("single");
  const [activePaneId, setActivePaneId] = useState<PaneId>("pane-1");
  const [syncConfig, setSyncConfig] = useState<LayoutSyncConfig>({
    symbol: true,
    interval: true,
    crosshair: true,
  });
  const [panes, setPanes] = useState<Record<PaneId, ChartPaneState>>(() =>
    createInitialPanes(initialData)
  );
  const panesRef = useRef(panes);
  panesRef.current = panes;

  // Crosshair Broadcast State
  const [syncedCrosshair, setSyncedCrosshair] = useState<{
    sourcePaneId: PaneId;
    timestamp: number;
  } | null>(null);

  // Watchlist State & Custom Watchlist Groups (B1)
  const [watchlist, setWatchlist] =
    useState<WatchlistSummaryItem[]>(initialWatchlist);
  const [watchlistGroups, setWatchlistGroups] = useState<WatchlistGroup[]>(() =>
    buildDefaultWatchlistGroups(initialWatchlist)
  );
  const [searchTargetGroupId, setSearchTargetGroupId] = useState<string | null>(
    null
  );

  // Workspace Templates State (B2)
  const [templatesStore, setTemplatesStore] = useState<WorkspaceTemplatesStore>(
    () => createEmptyWorkspaceTemplatesStore()
  );

  // Visual & Preference State (Dark + Intl Green-Up/Red-Down Default; hydrated from localStorage)
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("intl");
  const [defaultMarket, setDefaultMarket] = useState<MarketCategory>("US");
  const prefsHydratedRef = useRef(false);

  // Active Drawing Tool State (operates on active pane)
  const [activeTool, setActiveTool] = useState<DrawingToolId>("cursor");
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [annotationText, setAnnotationText] = useState("关键观察位");

  // Panels & Dialogs State
  const [rightTab, setRightTab] = useState<RightPanelTab | null>("watchlist");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const [screenerOpen, setScreenerOpen] = useState(false);

  // Batch 4C: Educational Backtest Main-Chart Marker Overlay State
  const [backtestOverlayState, setBacktestOverlayState] =
    useState<BacktestPublishedOverlay | null>(null);
  const [showBacktestMarkers, setShowBacktestMarkers] = useState(true);
  const handleToggleBacktestMarkers = useCallback(() => {
    setShowBacktestMarkers((v) => !v);
  }, []);

  // Replay, Local Paper Trading & Local Alerts Stores
  const replay = useReplay();
  const paper = usePaperTrading();
  const alerts = useAlerts();

  const visiblePaneIds = useMemo(
    () => computeVisiblePaneIds(layout, activePaneId),
    [layout, activePaneId]
  );
  const isMultiChart = layout !== "single";
  const activePane = panes[activePaneId];

  // Sync HTML data-theme & data-color-scheme tokens
  useEffect(() => {
    applyDocumentPreferences({ theme, colorScheme });
  }, [theme, colorScheme]);

  // Hydrate persisted preferences (theme, colorScheme, defaultMarket) & listen to cross-tab updates
  useEffect(() => {
    const loaded = loadUserPreferences();
    setTheme(loaded.theme);
    setColorScheme(loaded.colorScheme);
    setDefaultMarket(loaded.defaultMarket);
    applyDocumentPreferences(loaded);

    // Hydrate B1 custom watchlist groups & B2 workspace templates
    setWatchlistGroups(
      loadWatchlistGroupsStore(initialWatchlist, loaded.defaultMarket).groups
    );
    setTemplatesStore(loadWorkspaceTemplatesStore());

    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFERENCES_STORAGE_KEY) {
        const updated = loadUserPreferences();
        setTheme(updated.theme);
        setColorScheme(updated.colorScheme);
        setDefaultMarket(updated.defaultMarket);
        applyDocumentPreferences(updated);
      } else if (e.key === WATCHLIST_GROUPS_STORAGE_KEY) {
        const prefs = loadUserPreferences();
        setWatchlistGroups(
          loadWatchlistGroupsStore(initialWatchlist, prefs.defaultMarket).groups
        );
      } else if (e.key === WORKSPACE_TEMPLATES_STORAGE_KEY) {
        setTemplatesStore(loadWorkspaceTemplatesStore());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [initialWatchlist]);

  // Keep replay store synced if target pane's bars/symbol/interval update
  const replayTargetPane = panes[replay.state.targetPaneId as PaneId] ?? activePane;
  useEffect(() => {
    if (!replay.state.active) return;
    replay.syncTargetBars({
      paneId: replayTargetPane.id,
      symbolId: replayTargetPane.data.symbol.id,
      interval: replayTargetPane.data.interval,
      bars: replayTargetPane.data.bars,
    });
  }, [
    replay.state.active,
    replay.syncTargetBars,
    replayTargetPane.id,
    replayTargetPane.data.symbol.id,
    replayTargetPane.data.interval,
    replayTargetPane.data.bars,
  ]);

  // Fetch bars for a specific pane via local Next.js Route Handler
  const fetchBarsForPane = useCallback(
    async (
      paneId: PaneId,
      symbolId: string,
      interval: Interval,
      clearOverlaysOnSymbolChange = true
    ) => {
      const prevSymbolId = panesRef.current[paneId]?.data.symbol.id;
      setPanes((prev) => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          initialized: true,
          loading: true,
        },
      }));

      try {
        const res = await fetch(
          `/api/bars?symbol=${encodeURIComponent(
            symbolId
          )}&interval=${encodeURIComponent(interval)}`
        );
        if (!res.ok) throw new Error("Failed to load bars");
        const nextData = (await res.json()) as BarsResponse;

        const symbolChanged =
          clearOverlaysOnSymbolChange && prevSymbolId !== nextData.symbol.id;
        if (symbolChanged) {
          chartRefs.current[paneId]?.clearAllOverlays();
        }

        const lastBar = nextData.bars[nextData.bars.length - 1] ?? null;
        const prevClose =
          nextData.bars.length >= 2
            ? nextData.bars[nextData.bars.length - 2].close
            : null;

        setPanes((prev) => ({
          ...prev,
          [paneId]: {
            ...prev[paneId],
            initialized: true,
            data: nextData,
            loading: false,
            drawings: symbolChanged ? [] : prev[paneId].drawings,
            hoveredBar: lastBar,
            hoveredPrevClose: prevClose,
          },
        }));

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
      } catch {
        setPanes((prev) => ({
          ...prev,
          [paneId]: {
            ...prev[paneId],
            loading: false,
          },
        }));
        showToast("加载行情失败，已保持当前数据");
      }
    },
    [showToast]
  );

  // On initial mount, if persisted defaultMarket differs from SSR default symbol's market, switch pane-1 automatically
  useEffect(() => {
    if (prefsHydratedRef.current) return;
    prefsHydratedRef.current = true;
    const loaded = loadUserPreferences();
    if (loaded.defaultMarket !== initialData.symbol.market) {
      const targetSym = DEFAULT_SYMBOL_BY_MARKET[loaded.defaultMarket];
      if (targetSym && targetSym !== initialData.symbol.id) {
        void fetchBarsForPane("pane-1", targetSym, "1D", false);
      }
    }
  }, [fetchBarsForPane, initialData.symbol.id, initialData.symbol.market]);

  // Switch layout while preserving existing pane state & filling newly exposed slots
  const handleChangeLayout = useCallback(
    (nextLayout: LayoutMode, overrideActiveId?: PaneId) => {
      const effectiveActiveId = overrideActiveId ?? activePaneId;
      if (overrideActiveId && overrideActiveId !== activePaneId) {
        chartRefs.current[activePaneId]?.cancelPendingDrawing();
        setActiveTool("cursor");
        setActivePaneId(overrideActiveId);
      }
      if (nextLayout === layout) return;
      const nextVisibleIds = computeVisiblePaneIds(nextLayout, effectiveActiveId);
      const currentPanes = panesRef.current;
      const currentActive = currentPanes[effectiveActiveId];

      // Identify newly revealed uninitialized slots
      const uninitializedSlots = nextVisibleIds.filter(
        (id) => !currentPanes[id].initialized
      );

      if (uninitializedSlots.length > 0) {
        const usedSymbols = new Set<string>(
          ALL_PANE_IDS.filter((id) => currentPanes[id].initialized).map(
            (id) => currentPanes[id].data.symbol.id
          )
        );
        const pickedSymbols = pickNextWatchlistSymbols(
          watchlist,
          usedSymbols,
          uninitializedSlots.length
        );

        // Inherit active pane's chartType & indicators for newly opened slots
        setPanes((prev) => {
          const next = { ...prev };
          uninitializedSlots.forEach((slotId) => {
            next[slotId] = {
              ...next[slotId],
              chartType: currentActive.chartType,
              activeIndicators: [...currentActive.activeIndicators],
            };
          });
          return next;
        });

        uninitializedSlots.forEach((slotId, i) => {
          const symId = pickedSymbols[i];
          if (!symId) return;
          const targetMeta = watchlist.find(
            (w) => w.symbol.id === symId
          )?.symbol;
          const intv: Interval =
            targetMeta &&
            targetMeta.supportedIntervals.includes(currentActive.data.interval)
              ? currentActive.data.interval
              : "1D";
          void fetchBarsForPane(slotId, symId, intv, false);
        });
      }

      // If shrinking layout hides the replay target pane, re-anchor replay to effective active pane
      if (
        replay.state.active &&
        !nextVisibleIds.includes(replay.state.targetPaneId as PaneId)
      ) {
        if (currentActive.data.bars.length >= 2) {
          replay.enterReplay({
            paneId: effectiveActiveId,
            symbolId: currentActive.data.symbol.id,
            interval: currentActive.data.interval,
            bars: currentActive.data.bars,
          });
        } else {
          replay.exitReplay();
        }
      }

      setSyncedCrosshair(null);
      setLayout(nextLayout);
    },
    [layout, activePaneId, watchlist, fetchBarsForPane, replay]
  );

  // Activate a chart pane
  const handleActivatePane = useCallback(
    (paneId: PaneId) => {
      if (paneId === activePaneId) return;
      chartRefs.current[activePaneId]?.cancelPendingDrawing();
      setActiveTool("cursor");
      setActivePaneId(paneId);
    },
    [activePaneId]
  );

  // Global sync toggle
  const handleToggleGlobalSync = useCallback(
    (key: keyof LayoutSyncConfig) => {
      setSyncConfig((prev) => {
        const nextVal = !prev[key];
        if (key === "crosshair" && !nextVal) {
          setSyncedCrosshair(null);
        }
        return { ...prev, [key]: nextVal };
      });
    },
    []
  );

  // Per-pane link/unlink toggle
  const handleTogglePaneLink = useCallback(
    (paneId: PaneId, key: keyof PaneLinkOverrides) => {
      setPanes((prev) => {
        const cur = prev[paneId];
        const nextVal = !cur.links[key];
        if (key === "crosshair" && !nextVal) {
          setSyncedCrosshair((s) => (s?.sourcePaneId === paneId ? null : s));
        }
        return {
          ...prev,
          [paneId]: {
            ...cur,
            links: {
              ...cur.links,
              [key]: nextVal,
            },
          },
        };
      });
    },
    []
  );

  // Select symbol (respects global symbol sync + per-pane symbol unlink)
  const handleSelectSymbol = useCallback(
    (symbolId: string) => {
      const currentPanes = panesRef.current;
      const curActive = currentPanes[activePaneId];
      const targetMeta = watchlist.find((w) => w.symbol.id === symbolId)?.symbol;

      const activeIsLinked = syncConfig.symbol && curActive.links.symbol;
      const targetPaneIds: PaneId[] = activeIsLinked
        ? visiblePaneIds.filter((id) => currentPanes[id].links.symbol)
        : [activePaneId];

      if (!targetPaneIds.includes(activePaneId)) {
        targetPaneIds.unshift(activePaneId);
      }

      setActiveTool("cursor");
      targetPaneIds.forEach((pid) => {
        const p = currentPanes[pid];
        const nextInterval: Interval =
          targetMeta && targetMeta.supportedIntervals.includes(p.data.interval)
            ? p.data.interval
            : "1D";
        void fetchBarsForPane(pid, symbolId, nextInterval, true);
      });
    },
    [activePaneId, watchlist, syncConfig.symbol, visiblePaneIds, fetchBarsForPane]
  );

  // Change interval (respects global interval sync + per-pane interval unlink)
  const handleChangeInterval = useCallback(
    (nextInterval: Interval) => {
      const currentPanes = panesRef.current;
      const curActive = currentPanes[activePaneId];

      const activeIsLinked = syncConfig.interval && curActive.links.interval;
      const targetPaneIds: PaneId[] = activeIsLinked
        ? visiblePaneIds.filter((id) => currentPanes[id].links.interval)
        : [activePaneId];

      if (!targetPaneIds.includes(activePaneId)) {
        targetPaneIds.unshift(activePaneId);
      }

      let skippedUnsupported = 0;
      targetPaneIds.forEach((pid) => {
        const p = currentPanes[pid];
        if (!p.data.symbol.supportedIntervals.includes(nextInterval)) {
          skippedUnsupported++;
          return;
        }
        if (p.data.interval === nextInterval) return;
        void fetchBarsForPane(pid, p.data.symbol.id, nextInterval, false);
      });

      if (skippedUnsupported > 0) {
        showToast(
          `${skippedUnsupported} 个联动图品种不支持 ${nextInterval}，已保持原周期`
        );
      }
    },
    [
      activePaneId,
      syncConfig.interval,
      visiblePaneIds,
      fetchBarsForPane,
      showToast,
    ]
  );

  // Change chart type on active pane
  const handleChangeChartType = useCallback(
    (nextType: ChartType) => {
      setPanes((prev) => ({
        ...prev,
        [activePaneId]: {
          ...prev[activePaneId],
          chartType: nextType,
        },
      }));
    },
    [activePaneId]
  );

  // Toggle indicator on a specific pane (defaults to active pane)
  const handleToggleIndicatorForPane = useCallback(
    (paneId: PaneId, id: IndicatorId) => {
      setPanes((prev) => {
        const cur = prev[paneId];
        const exists = cur.activeIndicators.includes(id);
        return {
          ...prev,
          [paneId]: {
            ...cur,
            activeIndicators: exists
              ? cur.activeIndicators.filter((item) => item !== id)
              : [...cur.activeIndicators, id],
          },
        };
      });
    },
    []
  );

  const handleToggleActiveIndicator = useCallback(
    (id: IndicatorId) => {
      handleToggleIndicatorForPane(activePaneId, id);
    },
    [activePaneId, handleToggleIndicatorForPane]
  );

  // Drawing controls (always act on active pane)
  const handleSelectDrawingTool = useCallback(
    (tool: DrawingToolId) => {
      if (tool === "cursor") {
        chartRefs.current[activePaneId]?.cancelPendingDrawing();
        setActiveTool("cursor");
        return;
      }
      if (replay.state.pickStartMode) {
        replay.setPickStartMode(false);
      }
      setActiveTool(tool);
      chartRefs.current[activePaneId]?.startDrawing(
        tool,
        magnetEnabled,
        annotationText
      );
    },
    [activePaneId, magnetEnabled, annotationText, replay]
  );

  const handleCancelDrawingTool = useCallback(() => {
    chartRefs.current[activePaneId]?.cancelPendingDrawing();
    setActiveTool("cursor");
  }, [activePaneId]);

  const handleOverlayCreatedForPane = useCallback(
    (paneId: PaneId, rec: DrawnOverlayRecord) => {
      setPanes((prev) => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          drawings: [...prev[paneId].drawings, rec],
        },
      }));
    },
    []
  );

  const handleOverlayUpdatedForPane = useCallback(
    (paneId: PaneId, id: string, label: string) => {
      setPanes((prev) => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          drawings: prev[paneId].drawings.map((d) =>
            d.id === id ? { ...d, label } : d
          ),
        },
      }));
    },
    []
  );

  const handleRemoveDrawing = useCallback(
    (id: string) => {
      chartRefs.current[activePaneId]?.removeOverlayById(id);
      setPanes((prev) => ({
        ...prev,
        [activePaneId]: {
          ...prev[activePaneId],
          drawings: prev[activePaneId].drawings.filter((d) => d.id !== id),
        },
      }));
    },
    [activePaneId]
  );

  const handleClearDrawings = useCallback(() => {
    chartRefs.current[activePaneId]?.clearAllOverlays();
    setPanes((prev) => ({
      ...prev,
      [activePaneId]: {
        ...prev[activePaneId],
        drawings: [],
      },
    }));
    setActiveTool("cursor");
  }, [activePaneId]);

  const handleSelectRightTab = useCallback((tab: RightPanelTab) => {
    setRightTab((prev) => (prev === tab ? null : tab));
  }, []);

  // === B1: Custom Watchlist Group Handlers ===
  const updateWatchlistGroups = useCallback(
    (updater: (prev: WatchlistGroup[]) => WatchlistGroup[]) => {
      setWatchlistGroups((prev) => {
        const nextGroups = updater(prev);
        saveWatchlistGroupsStore({
          version: 1,
          groups: nextGroups,
          updatedAt: new Date().toISOString(),
        });
        return nextGroups;
      });
    },
    []
  );

  const handleCreateWatchlistGroup = useCallback(
    (name: string, initialSymbolIds: string[] = []) => {
      updateWatchlistGroups((prev) =>
        createWatchlistGroup(prev, name, initialSymbolIds)
      );
      showToast(`已创建自选分组「${name.trim()}」`);
    },
    [updateWatchlistGroups, showToast]
  );

  const handleRenameWatchlistGroup = useCallback(
    (groupId: string, nextName: string) => {
      updateWatchlistGroups((prev) =>
        renameWatchlistGroup(prev, groupId, nextName)
      );
      showToast(`分组已重命名为「${nextName.trim()}」`);
    },
    [updateWatchlistGroups, showToast]
  );

  const handleDeleteWatchlistGroup = useCallback(
    (groupId: string) => {
      updateWatchlistGroups((prev) => deleteWatchlistGroup(prev, groupId));
      showToast("已删除自选分组");
    },
    [updateWatchlistGroups, showToast]
  );

  const handleToggleWatchlistGroupCollapsed = useCallback(
    (groupId: string) => {
      updateWatchlistGroups((prev) =>
        toggleWatchlistGroupCollapsed(prev, groupId)
      );
    },
    [updateWatchlistGroups]
  );

  const handleReorderWatchlistGroups = useCallback(
    (
      sourceGroupId: string,
      targetGroupId: string,
      position: "before" | "after"
    ) => {
      updateWatchlistGroups((prev) =>
        reorderWatchlistGroups(prev, sourceGroupId, targetGroupId, position)
      );
    },
    [updateWatchlistGroups]
  );

  const handleReorderSymbolInGroups = useCallback(
    (params: {
      sourceGroupId: string;
      symbolId: string;
      targetGroupId: string;
      targetSymbolId?: string | null;
      position?: "before" | "after";
    }) => {
      updateWatchlistGroups((prev) =>
        reorderSymbolInWatchlistGroups(prev, params)
      );
    },
    [updateWatchlistGroups]
  );

  const handleAddSymbolToGroup = useCallback(
    (groupId: string, symbolId: string) => {
      updateWatchlistGroups((prev) =>
        addSymbolToWatchlistGroup(prev, groupId, symbolId)
      );
    },
    [updateWatchlistGroups]
  );

  const handleRemoveSymbolFromGroup = useCallback(
    (groupId: string, symbolId: string) => {
      updateWatchlistGroups((prev) =>
        removeSymbolFromWatchlistGroup(prev, groupId, symbolId)
      );
    },
    [updateWatchlistGroups]
  );

  const handleToggleSymbolInGroup = useCallback(
    (groupId: string, symbolId: string) => {
      updateWatchlistGroups((prev) => {
        const target = prev.find((g) => g.id === groupId);
        if (!target) return prev;
        if (target.symbolIds.includes(symbolId)) {
          return removeSymbolFromWatchlistGroup(prev, groupId, symbolId);
        }
        return addSymbolToWatchlistGroup(prev, groupId, symbolId);
      });
    },
    [updateWatchlistGroups]
  );

  const handleResetDefaultWatchlistGroups = useCallback(() => {
    const store = createDefaultWatchlistGroupsStore(watchlist, defaultMarket);
    setWatchlistGroups(store.groups);
    saveWatchlistGroupsStore(store);
    showToast("已恢复默认 4 个市场分组");
  }, [watchlist, defaultMarket, showToast]);

  // === B2: Workspace Templates Handlers ===
  const updateTemplatesStore = useCallback(
    (updater: (prev: WorkspaceTemplatesStore) => WorkspaceTemplatesStore) => {
      setTemplatesStore((prev) => {
        const next = updater(prev);
        const withTs: WorkspaceTemplatesStore = {
          ...next,
          updatedAt: new Date().toISOString(),
        };
        saveWorkspaceTemplatesStore(withTs);
        return withTs;
      });
    },
    []
  );

  const captureCurrentWorkspaceSnapshot =
    useCallback((): WorkspaceTemplateSnapshotInput => {
      const currentPanes = panesRef.current;
      return {
        layout,
        activePaneId,
        syncConfig: { ...syncConfig },
        panes: ALL_PANE_IDS.map((pid) => {
          const pane = currentPanes[pid];
          const exportedDrawings =
            chartRefs.current[pid]?.exportUserDrawings(pane.drawings) ?? [];
          return {
            paneId: pid,
            initialized: pane.initialized,
            symbolId: pane.data.symbol.id,
            interval: pane.data.interval,
            chartType: pane.chartType,
            activeIndicators: [...pane.activeIndicators],
            drawings: exportedDrawings,
            links: { ...pane.links },
          };
        }),
      };
    }, [layout, activePaneId, syncConfig]);

  const handleSaveNewTemplate = useCallback(
    (name: string) => {
      const snap = captureCurrentWorkspaceSnapshot();
      const created = buildNewWorkspaceTemplate(name, snap);
      updateTemplatesStore((prev) => ({
        ...prev,
        activeTemplateId: created.id,
        templates: [created, ...prev.templates],
      }));
      showToast(`已保存工作区模板「${created.name}」`);
    },
    [captureCurrentWorkspaceSnapshot, updateTemplatesStore, showToast]
  );

  const handleOverwriteTemplate = useCallback(
    (templateId: string) => {
      const snap = captureCurrentWorkspaceSnapshot();
      let updatedName = "";
      updateTemplatesStore((prev) => ({
        ...prev,
        activeTemplateId: templateId,
        templates: prev.templates.map((t) => {
          if (t.id !== templateId) return t;
          updatedName = t.name;
          return overwriteWorkspaceTemplate(t, snap);
        }),
      }));
      if (updatedName) {
        showToast(`已用当前工作区覆盖模板「${updatedName}」`);
      }
    },
    [captureCurrentWorkspaceSnapshot, updateTemplatesStore, showToast]
  );

  const handleRenameTemplate = useCallback(
    (templateId: string, nextName: string) => {
      const trimmed = nextName.trim().slice(0, 60);
      if (!trimmed) return;
      updateTemplatesStore((prev) => ({
        ...prev,
        templates: prev.templates.map((t) =>
          t.id === templateId
            ? { ...t, name: trimmed, updatedAt: new Date().toISOString() }
            : t
        ),
      }));
      showToast(`模板已重命名为「${trimmed}」`);
    },
    [updateTemplatesStore, showToast]
  );

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      updateTemplatesStore((prev) => ({
        ...prev,
        activeTemplateId:
          prev.activeTemplateId === templateId ? null : prev.activeTemplateId,
        templates: prev.templates.filter((t) => t.id !== templateId),
      }));
      showToast("已删除工作区模板");
    },
    [updateTemplatesStore, showToast]
  );

  const handleApplyTemplate = useCallback(
    (template: WorkspaceTemplate) => {
      if (replay.state.active) {
        replay.exitReplay();
      }
      chartRefs.current[activePaneId]?.cancelPendingDrawing();
      setActiveTool("cursor");
      setSyncedCrosshair(null);

      const knownIds = new Set(watchlist.map((w) => w.symbol.id));
      const fallbackSymbolId =
        watchlist[0]?.symbol.id ?? initialData.symbol.id;
      const paneSnapMap = new Map(template.panes.map((p) => [p.paneId, p]));
      const currentPanes = panesRef.current;

      const toFetch: Array<{
        paneId: PaneId;
        symbolId: string;
        interval: Interval;
      }> = [];

      setPanes((prev) => {
        const next = { ...prev };
        for (const pid of ALL_PANE_IDS) {
          const snap = paneSnapMap.get(pid);
          const cur = prev[pid];
          if (!snap) continue;
          const resolvedSymId = knownIds.has(snap.symbolId)
            ? snap.symbolId
            : fallbackSymbolId;
          const targetMeta = watchlist.find(
            (w) => w.symbol.id === resolvedSymId
          )?.symbol;
          const resolvedInterval: Interval =
            targetMeta && targetMeta.supportedIntervals.includes(snap.interval)
              ? snap.interval
              : "1D";

          const needsFetch =
            snap.initialized &&
            (!cur.initialized ||
              cur.data.symbol.id !== resolvedSymId ||
              cur.data.interval !== resolvedInterval);

          if (needsFetch) {
            toFetch.push({
              paneId: pid,
              symbolId: resolvedSymId,
              interval: resolvedInterval,
            });
          } else if (snap.drawings.length === 0) {
            chartRefs.current[pid]?.clearAllOverlays();
          }

          next[pid] = {
            ...cur,
            initialized: snap.initialized,
            loading: needsFetch ? true : cur.loading,
            chartType: snap.chartType,
            activeIndicators: [...snap.activeIndicators],
            links: { ...snap.links },
            drawings: snap.drawings.length === 0 ? [] : cur.drawings,
            pendingRestoreDrawings:
              snap.drawings.length > 0 ? [...snap.drawings] : null,
          };
        }
        return next;
      });

      setLayout(template.layout);
      setActivePaneId(template.activePaneId);
      setSyncConfig({ ...template.syncConfig });
      updateTemplatesStore((prev) => ({
        ...prev,
        activeTemplateId: template.id,
      }));

      for (const req of toFetch) {
        const cur = currentPanes[req.paneId];
        void fetchBarsForPane(
          req.paneId,
          req.symbolId,
          req.interval,
          cur.data.symbol.id !== req.symbolId
        );
      }

      showToast(`已切换应用模板「${template.name}」`);
    },
    [
      replay,
      activePaneId,
      watchlist,
      initialData.symbol.id,
      updateTemplatesStore,
      fetchBarsForPane,
      showToast,
    ]
  );

  const handleExportSingleTemplate = useCallback(
    (template: WorkspaceTemplate) => {
      const json = serializeSingleTemplateExport(template);
      const slug = sanitizeFilenameSegment(template.name);
      triggerJsonDownload(`trade-buddy-template-${slug}.json`, json);
      showToast(`已导出模板「${template.name}」JSON`);
    },
    [showToast]
  );

  const handleExportAllTemplates = useCallback(() => {
    if (templatesStore.templates.length === 0) return;
    const json = serializeBundleTemplatesExport(templatesStore.templates);
    triggerJsonDownload("trade-buddy-templates-all.json", json);
    showToast(`已导出全部 ${templatesStore.templates.length} 个模板 JSON`);
  }, [templatesStore.templates, showToast]);

  const handleImportTemplatesJson = useCallback(
    (rawText: string): { ok: boolean; error?: string } => {
      const knownIds = new Set(watchlist.map((w) => w.symbol.id));
      const res = parseImportedTemplatesJson(rawText, knownIds);
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
      updateTemplatesStore((prev) => ({
        ...prev,
        templates: [...res.templates, ...prev.templates],
      }));
      const warnSuffix =
        res.warnings.length > 0 ? `（提示：${res.warnings[0]}）` : "";
      showToast(`成功导入 ${res.templates.length} 个工作区模板${warnSuffix}`);
      return { ok: true };
    },
    [watchlist, updateTemplatesStore, showToast]
  );

  const handlePaneDrawingsRestored = useCallback(
    (paneId: PaneId, restoredRecords: DrawnOverlayRecord[]) => {
      setPanes((prev) => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          drawings: restoredRecords,
          pendingRestoreDrawings: null,
        },
      }));
    },
    []
  );

  // Replay toggle from TopBar
  const handleToggleReplay = useCallback(() => {
    if (replay.state.active) {
      replay.exitReplay();
      return;
    }
    const cur = panesRef.current[activePaneId];
    if (cur.data.bars.length < 2) {
      showToast("当前品种暂无足够 K 线用于回放");
      return;
    }
    chartRefs.current[activePaneId]?.cancelPendingDrawing();
    setActiveTool("cursor");
    replay.enterReplay({
      paneId: cur.id,
      symbolId: cur.data.symbol.id,
      interval: cur.data.interval,
      bars: cur.data.bars,
    });
  }, [activePaneId, replay, showToast]);

  // Can linked panes sync during replay? (Multi-chart + global interval sync + target pane interval linked + at least 1 other interval-linked visible pane)
  const canSyncReplayLinkedPanes = useMemo(() => {
    if (!isMultiChart || !syncConfig.interval) return false;
    const target = panes[replay.state.targetPaneId as PaneId];
    if (!target || !target.links.interval) return false;
    return visiblePaneIds.some(
      (id) => id !== target.id && panes[id].links.interval
    );
  }, [isMultiChart, syncConfig.interval, panes, replay.state.targetPaneId, visiblePaneIds]);

  // Compute visible bars (strict prefix slice during replay, zero future lookahead!)
  const visibleBarsByPane = useMemo(() => {
    const map: Record<
      PaneId,
      { bars: NormalizedBar[]; replayBadge: string | null; isReplaySliced: boolean }
    > = {
      "pane-1": { bars: panes["pane-1"].data.bars, replayBadge: null, isReplaySliced: false },
      "pane-2": { bars: panes["pane-2"].data.bars, replayBadge: null, isReplaySliced: false },
      "pane-3": { bars: panes["pane-3"].data.bars, replayBadge: null, isReplaySliced: false },
      "pane-4": { bars: panes["pane-4"].data.bars, replayBadge: null, isReplaySliced: false },
    };

    if (!replay.state.active) return map;

    const targetId = replay.state.targetPaneId as PaneId;
    for (const pid of ALL_PANE_IDS) {
      const fullBars = panes[pid].data.bars;
      if (pid === targetId) {
        if (replay.state.pickStartMode) {
          // Temporarily show full bars so user can pick any historical bar as new start
          map[pid] = {
            bars: fullBars,
            replayBadge: "点选起点中",
            isReplaySliced: false,
          };
        } else {
          const endExclusive = Math.min(
            replay.state.currentIndex + 1,
            fullBars.length
          );
          map[pid] = {
            bars: fullBars.slice(0, endExclusive),
            replayBadge: replay.state.isPlaying ? "回放播放中" : "回放已暂停",
            isReplaySliced: true,
          };
        }
      } else if (
        canSyncReplayLinkedPanes &&
        replay.state.syncLinkedPanes &&
        !replay.state.pickStartMode &&
        panes[pid].links.interval &&
        replay.state.currentTimestamp !== null
      ) {
        const sliced = sliceBarsUpToTimestamp(
          fullBars,
          replay.state.currentTimestamp
        );
        map[pid] = {
          bars: sliced.bars,
          replayBadge: sliced.clampedToFirst
            ? "同步回放(早于首根)"
            : "同步回放",
          isReplaySliced: true,
        };
      }
    }
    return map;
  }, [
    panes,
    replay.state.active,
    replay.state.targetPaneId,
    replay.state.pickStartMode,
    replay.state.currentIndex,
    replay.state.isPlaying,
    replay.state.syncLinkedPanes,
    replay.state.currentTimestamp,
    canSyncReplayLinkedPanes,
  ]);

  // Active pane quote (replay-scoped when active pane is in replay so no future prices leak)
  const activeDisplayQuote = useMemo(() => {
    const info = visibleBarsByPane[activePaneId];
    if (info.isReplaySliced) {
      return deriveQuoteFromBars(
        activePane.data.quote,
        info.bars,
        activePane.data.interval
      );
    }
    return activePane.data.quote;
  }, [activePaneId, activePane.data.quote, activePane.data.interval, visibleBarsByPane]);

  // Build pure market price snapshots for virtual paper trading (latest visible vs replay bar)
  const {
    paperSnapshotsBySymbol,
    activePaperSnapshot,
    markPriceBySymbol,
  } = useMemo(() => {
    const snaps: Record<string, PaperMarketSnapshot> = {};
    const marks: Record<string, number> = {};

    // 1. Baseline latest quotes from watchlist
    for (const item of watchlist) {
      if (item.quote.last > 0) {
        marks[item.symbol.id] = item.quote.last;
        snaps[item.symbol.id] = {
          symbolId: item.symbol.id,
          currentPrice: item.quote.last,
          mode: "latest",
          bar: null,
          barTimestamp: null,
        };
      }
    }

    // 2. Visible panes (active pane applied last so it always wins for its symbol)
    const orderedPanes: PaneId[] = [
      ...visiblePaneIds.filter((id) => id !== activePaneId),
      activePaneId,
    ];

    for (const pid of orderedPanes) {
      const pane = panes[pid];
      const info = visibleBarsByPane[pid];
      const isPickingReplayStart =
        replay.state.active &&
        replay.state.pickStartMode &&
        replay.state.targetPaneId === pid;
      if (isPickingReplayStart) {
        // While picking a new replay start bar, keep replay current bar so future bars never leak
        const curBar = replay.state.currentBar;
        if (curBar && curBar.close > 0) {
          marks[pane.data.symbol.id] = curBar.close;
          snaps[pane.data.symbol.id] = {
            symbolId: pane.data.symbol.id,
            currentPrice: curBar.close,
            mode: "replay",
            bar: curBar,
            barTimestamp: curBar.timestamp,
            barTimeLabel: formatBarTimestamp(
              curBar.timestamp,
              pane.data.interval
            ),
          };
        }
        continue;
      }

      const lastVisibleBar =
        info.bars.length > 0 ? info.bars[info.bars.length - 1] : null;

      if (info.isReplaySliced) {
        if (lastVisibleBar && lastVisibleBar.close > 0) {
          marks[pane.data.symbol.id] = lastVisibleBar.close;
          snaps[pane.data.symbol.id] = {
            symbolId: pane.data.symbol.id,
            currentPrice: lastVisibleBar.close,
            mode: "replay",
            bar: lastVisibleBar,
            barTimestamp: lastVisibleBar.timestamp,
            barTimeLabel: formatBarTimestamp(
              lastVisibleBar.timestamp,
              pane.data.interval
            ),
          };
        }
      } else {
        const latestPrice =
          pane.data.quote.last > 0
            ? pane.data.quote.last
            : lastVisibleBar?.close ?? 0;
        if (latestPrice > 0) {
          marks[pane.data.symbol.id] = latestPrice;
          snaps[pane.data.symbol.id] = {
            symbolId: pane.data.symbol.id,
            currentPrice: latestPrice,
            mode: "latest",
            bar: lastVisibleBar,
            barTimestamp: lastVisibleBar?.timestamp ?? null,
            barTimeLabel: lastVisibleBar
              ? formatBarTimestamp(lastVisibleBar.timestamp, pane.data.interval)
              : undefined,
          };
        }
      }
    }

    return {
      paperSnapshotsBySymbol: snaps,
      activePaperSnapshot: snaps[activePane.data.symbol.id] ?? null,
      markPriceBySymbol: marks,
    };
  }, [
    watchlist,
    visiblePaneIds,
    activePaneId,
    panes,
    visibleBarsByPane,
    activePane.data.symbol.id,
    replay.state.active,
    replay.state.pickStartMode,
    replay.state.targetPaneId,
    replay.state.currentBar,
  ]);

  // Evaluate resting paper limit orders whenever market prices or replay progress advance
  const prevReplayCursorRef = useRef<{
    paneId: string;
    symbolId: string;
    interval: Interval;
    index: number;
  } | null>(null);

  useEffect(() => {
    if (!paper.hydrated) return;

    if (replay.state.active && replay.state.pickStartMode) {
      return;
    }

    let snapshotsToEval = paperSnapshotsBySymbol;

    if (replay.state.active) {
      const targetId = replay.state.targetPaneId as PaneId;
      const targetPane = panesRef.current[targetId];
      const prevCursor = prevReplayCursorRef.current;

      if (
        targetPane &&
        prevCursor &&
        prevCursor.paneId === targetId &&
        prevCursor.symbolId === targetPane.data.symbol.id &&
        prevCursor.interval === targetPane.data.interval &&
        replay.state.currentIndex > prevCursor.index
      ) {
        const steppedSlice = targetPane.data.bars.slice(
          prevCursor.index + 1,
          replay.state.currentIndex + 1
        );
        const existingSnap = snapshotsToEval[targetPane.data.symbol.id];
        if (existingSnap && steppedSlice.length > 0) {
          snapshotsToEval = {
            ...snapshotsToEval,
            [targetPane.data.symbol.id]: {
              ...existingSnap,
              steppedBars: steppedSlice.map((b) => ({
                bar: b,
                timeLabel: formatBarTimestamp(
                  b.timestamp,
                  targetPane.data.interval
                ),
              })),
            },
          };
        }
      }

      if (targetPane) {
        prevReplayCursorRef.current = {
          paneId: targetId,
          symbolId: targetPane.data.symbol.id,
          interval: targetPane.data.interval,
          index: replay.state.currentIndex,
        };
      }
    } else {
      prevReplayCursorRef.current = null;
    }

    const sampleLabel =
      replay.state.active && replay.state.currentTimestamp !== null
        ? `回放 ${formatBarTimestamp(
            replay.state.currentTimestamp,
            replay.state.interval
          )}`
        : undefined;

    paper.processMarketSnapshots(
      snapshotsToEval,
      markPriceBySymbol,
      sampleLabel
    );
  }, [
    paper.hydrated,
    paper.processMarketSnapshots,
    paperSnapshotsBySymbol,
    markPriceBySymbol,
    replay.state.active,
    replay.state.pickStartMode,
    replay.state.targetPaneId,
    replay.state.currentIndex,
    replay.state.currentTimestamp,
    replay.state.interval,
  ]);

  // === B3: Local Alerts Evaluation Feeds & Auto/Manual Checks ===
  const alertEvaluationFeeds = useMemo<AlertEvaluationFeed[]>(() => {
    const feeds: AlertEvaluationFeed[] = [];
    const seenExact = new Set<string>();

    // 1. Visible panes (active pane first so its loaded bars/quote take precedence)
    const orderedPanes: PaneId[] = [
      activePaneId,
      ...visiblePaneIds.filter((id) => id !== activePaneId),
    ];

    for (const pid of orderedPanes) {
      const pane = panes[pid];
      const info = visibleBarsByPane[pid];
      const exactKey = `${pane.data.symbol.id}::${pane.data.interval}`;
      if (seenExact.has(exactKey)) continue;
      seenExact.add(exactKey);

      const quote = info.isReplaySliced
        ? deriveQuoteFromBars(pane.data.quote, info.bars, pane.data.interval)
        : pane.data.quote;

      feeds.push({
        symbolId: pane.data.symbol.id,
        interval: pane.data.interval,
        bars: info.bars,
        quote,
        isReplay: info.isReplaySliced,
      });
    }

    // 2. Watchlist summary quotes (enables price/change_pct checks even for symbols not currently open)
    for (const item of watchlist) {
      const key = `${item.symbol.id}::1D`;
      if (seenExact.has(key)) continue;
      feeds.push({
        symbolId: item.symbol.id,
        interval: "1D",
        bars: [],
        quote: item.quote,
        isReplay: false,
      });
    }

    return feeds;
  }, [activePaneId, visiblePaneIds, panes, visibleBarsByPane, watchlist]);

  // Auto-evaluate local alerts whenever bars/quotes/replay step update (only while page is open)
  useEffect(() => {
    if (!alerts.hydrated) return;
    if (replay.state.active && replay.state.pickStartMode) return;
    if (!alerts.rules.some((r) => r.enabled)) return;
    alerts.evaluateFeeds(alertEvaluationFeeds);
  }, [
    alerts.hydrated,
    alerts.rules,
    alerts.settings.triggerInReplayMode,
    alerts.evaluateFeeds,
    alertEvaluationFeeds,
    replay.state.active,
    replay.state.pickStartMode,
  ]);

  // Manual check: also fetches /api/bars on demand for enabled rules whose (symbol, interval) isn't loaded on a pane
  const handleManualCheckAlerts = useCallback(async () => {
    const feeds: AlertEvaluationFeed[] = [...alertEvaluationFeeds];
    const loadedExactWithBars = new Set(
      feeds.filter((f) => f.bars.length > 0).map((f) => `${f.symbolId}::${f.interval}`)
    );

    const missingKeys = new Map<string, { symbolId: string; interval: Interval }>();
    for (const rule of alerts.rules) {
      if (!rule.enabled) continue;
      const key = `${rule.symbolId}::${rule.interval}`;
      if (!loadedExactWithBars.has(key) && !missingKeys.has(key)) {
        missingKeys.set(key, { symbolId: rule.symbolId, interval: rule.interval });
      }
    }

    if (missingKeys.size > 0) {
      await Promise.all(
        Array.from(missingKeys.values()).map(async ({ symbolId, interval }) => {
          try {
            const res = await fetch(
              `/api/bars?symbol=${encodeURIComponent(
                symbolId
              )}&interval=${encodeURIComponent(interval)}`
            );
            if (!res.ok) return;
            const data = (await res.json()) as BarsResponse;
            feeds.unshift({
              symbolId: data.symbol.id,
              interval: data.interval,
              bars: data.bars,
              quote: data.quote,
              isReplay: false,
            });
          } catch {
            // Keep existing quote-only feed on fetch failure
          }
        })
      );
    }

    const res = alerts.evaluateFeeds(feeds, { sourceMode: "manual_check" });
    return {
      triggeredCount: res.triggeredEvents.length,
      checkedCount: res.checkedCount,
      skippedReplayCount: res.skippedReplayCount,
      detailsByRuleId: res.detailsByRuleId,
    };
  }, [alertEvaluationFeeds, alerts]);

  // Desktop keyboard shortcuts
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
        setScreenerOpen(false);
        if (replay.state.pickStartMode) {
          replay.setPickStartMode(false);
        }
        chartRefs.current[activePaneId]?.cancelPendingDrawing();
        setActiveTool("cursor");
        return;
      }

      if (isEditing || searchOpen || indicatorOpen || screenerOpen) return;

      if (e.key === " " && replay.state.active) {
        e.preventDefault();
        replay.togglePlay();
        return;
      }

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
        } else if (k === "m") {
          e.preventDefault();
          handleSelectDrawingTool("measure");
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
  }, [
    activePaneId,
    searchOpen,
    indicatorOpen,
    screenerOpen,
    handleSelectDrawingTool,
    replay,
  ]);

  // Grid layout classes
  const gridClass =
    layout === "single"
      ? "grid-cols-1 grid-rows-1"
      : layout === "split_h"
      ? "grid-cols-2 grid-rows-1"
      : layout === "split_v"
      ? "grid-cols-1 grid-rows-2"
      : "grid-cols-2 grid-rows-2";

  const replayTargetLabel = `${
    isMultiChart ? `${PANE_LABELS[replayTargetPane.id]} ` : ""
  }${replayTargetPane.data.symbol.ticker} · ${replayTargetPane.data.interval}`;

  const activePaneSwitch =
    replay.state.active &&
    isMultiChart &&
    activePaneId !== replay.state.targetPaneId
      ? {
          activeLabel: `${PANE_LABELS[activePaneId]} ${activePane.data.symbol.ticker}`,
          onSwitchToActive: () => {
            if (activePane.data.bars.length < 2) {
              showToast("当前活动图暂无足够 K 线用于回放");
              return;
            }
            replay.enterReplay({
              paneId: activePane.id,
              symbolId: activePane.data.symbol.id,
              interval: activePane.data.interval,
              bars: activePane.data.bars,
            });
          },
        }
      : null;

  return (
    <div className="tb-canvas flex h-screen w-screen flex-col overflow-hidden">
      {/* Zone 1: TopBar (40px) */}
      <TopBar
        symbol={activePane.data.symbol}
        interval={activePane.data.interval}
        chartType={activePane.chartType}
        activeIndicators={activePane.activeIndicators}
        colorScheme={colorScheme}
        theme={theme}
        layout={layout}
        syncConfig={syncConfig}
        replayActive={replay.state.active}
        activePaneBadge={isMultiChart ? PANE_LABELS[activePaneId] : null}
        templates={templatesStore.templates}
        activeTemplateId={templatesStore.activeTemplateId}
        alertUnreadCount={alerts.unreadCount}
        onSaveNewTemplate={handleSaveNewTemplate}
        onApplyTemplate={handleApplyTemplate}
        onOverwriteTemplate={handleOverwriteTemplate}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onExportSingleTemplate={handleExportSingleTemplate}
        onExportAllTemplates={handleExportAllTemplates}
        onImportTemplatesJson={handleImportTemplatesJson}
        onOpenAlerts={() => setRightTab("alerts")}
        onOpenSearch={() => {
          setSearchTargetGroupId(null);
          setSearchInitialQuery("");
          setSearchOpen(true);
        }}
        onChangeInterval={handleChangeInterval}
        onChangeChartType={handleChangeChartType}
        onOpenIndicators={() => setIndicatorOpen(true)}
        onChangeLayout={handleChangeLayout}
        onToggleSync={handleToggleGlobalSync}
        onToggleReplay={handleToggleReplay}
        onOpenScreener={() => setScreenerOpen(true)}
        onToggleColorScheme={() =>
          setColorScheme((prev) => {
            const next = prev === "intl" ? "cn" : "intl";
            patchUserPreferences({ colorScheme: next });
            return next;
          })
        }
        onToggleTheme={() =>
          setTheme((prev) => {
            const next = prev === "dark" ? "light" : "dark";
            patchUserPreferences({ theme: next });
            return next;
          })
        }
      />

      {/* Main 5-Zone Middle Shell */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Zone 2: Left Drawing Toolbar (48px) */}
        <LeftDrawingBar
          activeTool={activeTool}
          magnetEnabled={magnetEnabled}
          drawingCount={activePane.drawings.length}
          onSelectTool={handleSelectDrawingTool}
          onToggleMagnet={() => setMagnetEnabled((v) => !v)}
          onClearDrawings={handleClearDrawings}
        />

        {/* Zone 3 + ReplayBar + Zone 5: Center Chart Grid + Replay Controls + Bottom Dock */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={`grid min-h-0 flex-1 overflow-hidden ${gridClass} ${
              isMultiChart ? "gap-[2px] bg-[var(--border-hairline)] p-[2px]" : ""
            }`}
          >
            {visiblePaneIds.map((pid) => {
              const pane = panes[pid];
              const isActive = pid === activePaneId;
              const barInfo = visibleBarsByPane[pid];
              const isReplayTarget =
                replay.state.active && replay.state.targetPaneId === pid;
              const externalTs =
                syncConfig.crosshair &&
                pane.links.crosshair &&
                syncedCrosshair &&
                syncedCrosshair.sourcePaneId !== pid
                  ? syncedCrosshair.timestamp
                  : null;

              // Build per-pane paper trading main-chart overlay data (scoped to this pane's symbol & replay progress)
              let panePaperOverlay: PaperChartOverlayData | null = null;
              if (paper.account) {
                const symId = pane.data.symbol.id;
                const pos =
                  paper.account.positions.find((p) => p.symbolId === symId) ??
                  null;
                const openOrders = paper.account.orders.filter(
                  (o) =>
                    o.status === "open" &&
                    o.symbolId === symId &&
                    o.limitPrice !== undefined
                );
                let symFills = paper.account.fills.filter(
                  (f) => f.symbolId === symId
                );

                // During replay on this pane, strictly hide fills later than replay progress
                const replayMaxTs = barInfo.isReplaySliced
                  ? barInfo.bars[barInfo.bars.length - 1]?.timestamp ?? null
                  : isReplayTarget && replay.state.pickStartMode
                  ? replay.state.currentTimestamp
                  : null;

                if (replayMaxTs !== null) {
                  symFills = symFills.filter((f) => {
                    const effectiveTs = f.barTimestamp ?? Date.parse(f.filledAt);
                    return (
                      Number.isFinite(effectiveTs) && effectiveTs <= replayMaxTs
                    );
                  });
                }

                panePaperOverlay = {
                  enabled: paper.account.settings.showChartMarkers,
                  position: pos,
                  openOrders,
                  fills: symFills,
                };
              }

              const paneAlertOverlay: AlertChartOverlayData = {
                enabled: alerts.settings.showChartLines,
                priceAlerts: alerts.rules.filter(
                  (r) =>
                    r.symbolId === pane.data.symbol.id &&
                    isPriceAlertCondition(r.condition)
                ),
              };

              let paneBacktestOverlay: BacktestChartOverlayData | null = null;
              if (
                backtestOverlayState &&
                backtestOverlayState.symbolId === pane.data.symbol.id &&
                backtestOverlayState.interval === pane.data.interval
              ) {
                const replayCutoffTs = barInfo.isReplaySliced
                  ? barInfo.bars[barInfo.bars.length - 1]?.timestamp ?? null
                  : isReplayTarget && replay.state.pickStartMode
                  ? replay.state.currentTimestamp
                  : null;
                const scopedTrades =
                  replayCutoffTs !== null
                    ? backtestOverlayState.trades.filter(
                        (t) => t.timestamp <= replayCutoffTs
                      )
                    : backtestOverlayState.trades;
                paneBacktestOverlay = {
                  enabled: showBacktestMarkers,
                  strategyLabel: backtestOverlayState.strategyLabel,
                  trades: scopedTrades,
                };
              }

              return (
                <div
                  key={pid}
                  onMouseDown={() => handleActivatePane(pid)}
                  className={`tb-canvas relative flex min-h-0 min-w-0 flex-col overflow-hidden ${
                    isMultiChart
                      ? isActive
                        ? "ring-1 ring-inset ring-[var(--accent-primary)]"
                        : "opacity-[0.96]"
                      : ""
                  }`}
                >
                  {/* Multi-Chart Compact Pane Header (24px, hidden in single-chart mode) */}
                  {isMultiChart && (
                    <div
                      className={`tb-panel tb-border flex h-[24px] shrink-0 items-center justify-between gap-1.5 border-b px-2 text-[11px] select-none ${
                        isActive ? "bg-[var(--bg-elevated)]" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`rounded px-1 text-[10px] font-bold tabular-nums ${
                            isActive
                              ? "bg-[var(--accent-primary)] text-white"
                              : "bg-[var(--bg-canvas)] tb-text-muted"
                          }`}
                        >
                          {PANE_LABELS[pid]}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActivatePane(pid);
                            setSearchInitialQuery("");
                            setSearchOpen(true);
                          }}
                          title="点击切换该宫格品种"
                          className="tb-hover flex items-center gap-1 rounded px-1 py-0.2 font-semibold tb-text-primary truncate cursor-pointer"
                        >
                          <span>{pane.data.symbol.ticker}</span>
                          <span className="font-normal tb-text-muted hidden xl:inline truncate max-w-[84px]">
                            {pane.data.symbol.name}
                          </span>
                        </button>
                        <span className="text-[10px] tb-text-secondary shrink-0">
                          {pane.data.interval}
                        </span>
                        {isActive && (
                          <span className="hidden 2xl:inline text-[9px] font-medium text-[var(--accent-primary)]">
                            活动
                          </span>
                        )}
                      </div>

                      {/* Per-Pane Individual Link/Unlink Controls + Solo */}
                      <div className="flex items-center gap-1 shrink-0">
                        {(
                          [
                            {
                              key: "symbol" as const,
                              label: "品种",
                              globalOn: syncConfig.symbol,
                            },
                            {
                              key: "interval" as const,
                              label: "周期",
                              globalOn: syncConfig.interval,
                            },
                            {
                              key: "crosshair" as const,
                              label: "光标",
                              globalOn: syncConfig.crosshair,
                            },
                          ] as const
                        ).map((linkItem) => {
                          const paneOn = pane.links[linkItem.key];
                          const effectiveOn = linkItem.globalOn && paneOn;
                          const title = !paneOn
                            ? `已单独解除${linkItem.label}联动（独立），点击恢复联动`
                            : !linkItem.globalOn
                            ? `全局${linkItem.label}联动已关闭（此图允许联动，点击可单独解除）`
                            : `已参与${linkItem.label}联动，点击单独解除此图${linkItem.label}联动`;
                          return (
                            <button
                              key={linkItem.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePaneLink(pid, linkItem.key);
                              }}
                              title={title}
                              className={`flex items-center gap-0.5 rounded px-1 py-0.2 text-[10px] transition-colors cursor-pointer ${
                                effectiveOn
                                  ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                                  : !paneOn
                                  ? "border border-dashed tb-border-subtle tb-text-muted line-through opacity-75 hover:opacity-100"
                                  : "tb-text-muted opacity-55 tb-hover"
                              }`}
                            >
                              {paneOn ? (
                                <IconLink size={10} />
                              ) : (
                                <IconUnlink size={10} />
                              )}
                              <span>{linkItem.label}</span>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChangeLayout("single", pid);
                          }}
                          title="仅展开此图（切回单图并保留当前品种）"
                          className="tb-hover ml-0.5 flex h-4 w-4 items-center justify-center rounded tb-text-muted hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <IconLayoutSingle size={11} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Independent KLineChartStage Instance */}
                  <KLineChartStage
                    ref={(handle) => {
                      chartRefs.current[pid] = handle;
                    }}
                    symbol={pane.data.symbol}
                    interval={pane.data.interval}
                    bars={barInfo.bars}
                    provenance={pane.data.provenance}
                    loading={pane.loading}
                    theme={theme}
                    colorScheme={colorScheme}
                    chartType={pane.chartType}
                    activeIndicators={pane.activeIndicators}
                    activeTool={isActive ? activeTool : "cursor"}
                    annotationText={annotationText}
                    compact={isMultiChart}
                    externalCrosshairTimestamp={externalTs}
                    pickReplayStartMode={
                      isReplayTarget && replay.state.pickStartMode
                    }
                    replayBadge={barInfo.replayBadge}
                    paperOverlay={panePaperOverlay}
                    onTogglePaperOverlay={paper.toggleChartMarkers}
                    alertOverlay={paneAlertOverlay}
                    onToggleAlertOverlay={() =>
                      alerts.updateSettings({
                        showChartLines: !alerts.settings.showChartLines,
                      })
                    }
                    backtestOverlay={paneBacktestOverlay}
                    onToggleBacktestOverlay={handleToggleBacktestMarkers}
                    pendingRestoreDrawings={pane.pendingRestoreDrawings}
                    onDrawingsRestored={(restored) =>
                      handlePaneDrawingsRestored(pid, restored)
                    }
                    onChangeAnnotationText={setAnnotationText}
                    onCancelDrawingTool={handleCancelDrawingTool}
                    onCrosshairChange={(bar, prevClose) => {
                      setPanes((prev) => {
                        const cur = prev[pid];
                        if (
                          cur.hoveredBar?.timestamp === bar?.timestamp &&
                          cur.hoveredPrevClose === prevClose
                        ) {
                          return prev;
                        }
                        return {
                          ...prev,
                          [pid]: {
                            ...cur,
                            hoveredBar: bar,
                            hoveredPrevClose: prevClose,
                          },
                        };
                      });
                    }}
                    onCrosshairTimestampChange={(ts) => {
                      if (!syncConfig.crosshair || !panesRef.current[pid].links.crosshair) {
                        return;
                      }
                      if (ts === null) {
                        setSyncedCrosshair((prev) =>
                          prev?.sourcePaneId === pid ? null : prev
                        );
                      } else {
                        setSyncedCrosshair({ sourcePaneId: pid, timestamp: ts });
                      }
                    }}
                    onPickReplayStart={(index) => {
                      replay.setStartAtIndex(index);
                      showToast(`已设置回放起点：第 ${index + 1} 根 K 线`);
                    }}
                    onCancelPickReplayStart={() =>
                      replay.setPickStartMode(false)
                    }
                    onOverlayCreated={(rec) =>
                      handleOverlayCreatedForPane(pid, rec)
                    }
                    onOverlayUpdated={(id, label) =>
                      handleOverlayUpdatedForPane(pid, id, label)
                    }
                    onRemoveIndicator={(indId) =>
                      handleToggleIndicatorForPane(pid, indId)
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* K-Line Replay Control Strip (appears above BottomDock only when replay is active) */}
          <ReplayBar
            targetLabel={replayTargetLabel}
            isMultiChart={isMultiChart}
            canSyncLinkedPanes={canSyncReplayLinkedPanes}
            activePaneSwitch={activePaneSwitch}
          />

          {/* Zone 5: Bottom Collapsible Paper Trading / Backtest / Research Notes / Provenance Dock */}
          <BottomDock
            symbol={activePane.data.symbol}
            interval={activePane.data.interval}
            provenance={activePane.data.provenance}
            fullBars={activePane.data.bars}
            visibleBars={visibleBarsByPane[activePaneId].bars}
            isReplayActive={visibleBarsByPane[activePaneId].isReplaySliced}
            envStatus={envStatus}
            activePaperSnapshot={activePaperSnapshot}
            paperSnapshotsBySymbol={paperSnapshotsBySymbol}
            markPriceBySymbol={markPriceBySymbol}
            showBacktestMarkers={showBacktestMarkers}
            onToggleBacktestMarkers={handleToggleBacktestMarkers}
            onPublishBacktestOverlay={setBacktestOverlayState}
            onSelectSymbol={handleSelectSymbol}
            onNotify={showToast}
          />
        </div>

        {/* Zone 4: Right Collapsible Panel (304px) */}
        {rightTab && (
          <aside className="tb-panel tb-border flex w-[288px] xl:w-[312px] shrink-0 flex-col border-l overflow-hidden">
            {rightTab === "watchlist" && (
              <WatchlistAndDetails
                watchlist={watchlist}
                groups={watchlistGroups}
                activeSymbol={activePane.data.symbol}
                activeQuote={activeDisplayQuote}
                activeProvenance={activePane.data.provenance}
                defaultMarket={defaultMarket}
                onSelectSymbol={handleSelectSymbol}
                onCreateGroup={handleCreateWatchlistGroup}
                onRenameGroup={handleRenameWatchlistGroup}
                onDeleteGroup={handleDeleteWatchlistGroup}
                onToggleGroupCollapsed={handleToggleWatchlistGroupCollapsed}
                onReorderGroups={handleReorderWatchlistGroups}
                onReorderSymbol={handleReorderSymbolInGroups}
                onAddSymbolToGroup={handleAddSymbolToGroup}
                onRemoveSymbolFromGroup={handleRemoveSymbolFromGroup}
                onResetDefaultGroups={handleResetDefaultWatchlistGroups}
                onOpenSearchForGroup={(groupId) => {
                  setSearchTargetGroupId(groupId);
                  setSearchInitialQuery("");
                  setSearchOpen(true);
                }}
                onOpenFundamentals={() => setRightTab("fundamentals")}
                onOpenAlerts={() => setRightTab("alerts")}
              />
            )}

            {rightTab === "alerts" && (
              <AlertsPanel
                activeSymbol={activePane.data.symbol}
                activeInterval={activePane.data.interval}
                activeQuote={activeDisplayQuote}
                watchlist={watchlist}
                onSelectSymbol={handleSelectSymbol}
                onManualCheckAll={handleManualCheckAlerts}
                onNotify={showToast}
              />
            )}

            {(rightTab === "data" || rightTab === "tree") && (
              <DataWindowAndTree
                mode={rightTab}
                onChangeMode={(m) => setRightTab(m)}
                symbol={activePane.data.symbol}
                interval={activePane.data.interval}
                provenance={activePane.data.provenance}
                hoveredBar={activePane.hoveredBar}
                prevBarClose={activePane.hoveredPrevClose}
                activeIndicators={activePane.activeIndicators}
                drawings={activePane.drawings}
                onRemoveIndicator={handleToggleActiveIndicator}
                onRemoveDrawing={handleRemoveDrawing}
                onClearDrawings={handleClearDrawings}
              />
            )}

            {rightTab === "fundamentals" && (
              <FundamentalsPanel
                symbol={activePane.data.symbol}
                onSelectSymbol={handleSelectSymbol}
              />
            )}

            {rightTab === "news" && (
              <NewsFlowPanel symbol={activePane.data.symbol} />
            )}

            {rightTab === "calendar" && (
              <EconomicCalendarPanel symbol={activePane.data.symbol} />
            )}
          </aside>
        )}

        {/* Rightmost Narrow Icon Rail (42px) */}
        <RightIconRail
          activeTab={rightTab}
          onSelectTab={handleSelectRightTab}
          alertUnreadCount={alerts.unreadCount}
          activeAlertRuleCount={alerts.rules.filter((r) => r.enabled).length}
        />
      </div>

      {/* Modals */}
      <SymbolSearchModal
        open={searchOpen}
        initialQuery={searchInitialQuery}
        items={watchlist}
        currentSymbolId={activePane.data.symbol.id}
        watchlistGroups={watchlistGroups}
        initialTargetGroupId={searchTargetGroupId}
        onToggleSymbolInGroup={handleToggleSymbolInGroup}
        onSelect={handleSelectSymbol}
        onClose={() => {
          setSearchOpen(false);
          setSearchTargetGroupId(null);
        }}
      />

      <IndicatorModal
        open={indicatorOpen}
        activeIndicators={activePane.activeIndicators}
        onToggleIndicator={handleToggleActiveIndicator}
        onClose={() => setIndicatorOpen(false)}
      />

      <ScreenerDrawer
        open={screenerOpen}
        activeSymbolId={activePane.data.symbol.id}
        activePaneLabel={isMultiChart ? PANE_LABELS[activePaneId] : null}
        onSelectSymbol={handleSelectSymbol}
        onClose={() => setScreenerOpen(false)}
      />

      {/* Local Alert In-Page Notification Toasts */}
      {alertToasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed right-14 top-12 z-50 flex w-[320px] flex-col gap-2"
        >
          {alertToasts.map((ev) => (
            <div
              key={ev.id}
              className="tb-elevated rounded-md border p-2.5 shadow-2xl"
              style={{ borderColor: "var(--status-delayed)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <IconBell
                    size={14}
                    className="shrink-0 text-[var(--status-delayed)]"
                  />
                  <span className="truncate text-[12px] font-semibold tb-text-primary">
                    本地提醒触发 · {ev.title}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAlertToast(ev.id)}
                  className="tb-hover rounded p-0.5 tb-text-muted cursor-pointer"
                >
                  <IconClose size={12} />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-snug tb-text-secondary">
                {ev.message}
              </p>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="tb-text-muted">仅本页面打开时生效</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectSymbol(ev.symbolId);
                      dismissAlertToast(ev.id);
                    }}
                    className="rounded bg-[var(--accent-soft)] px-2 py-0.5 font-medium text-[var(--accent-primary)] cursor-pointer"
                  >
                    看图
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRightTab("alerts");
                      dismissAlertToast(ev.id);
                    }}
                    className="rounded border tb-border-subtle px-2 py-0.5 tb-text-primary tb-hover cursor-pointer"
                  >
                    通知中心
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightweight Toast */}
      {toastMsg && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md border tb-border-subtle bg-[var(--bg-elevated)] px-3.5 py-2 text-[12px] tb-text-primary shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
