"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Interval,
  NormalizedBar,
  ReplaySnapshot,
  ReplaySpeed,
} from "@trade-buddy/shared-types";

export interface ReplayTargetInput {
  paneId: string;
  symbolId: string;
  interval: Interval;
  bars: NormalizedBar[];
}

export interface ReplayContextValue {
  state: ReplaySnapshot;
  enterReplay: (target: ReplayTargetInput, startIndex?: number) => void;
  exitReplay: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  resetToStart: () => void;
  seekToIndex: (index: number) => void;
  setStartAtIndex: (index: number) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setPickStartMode: (enabled: boolean) => void;
  setSyncLinkedPanes: (enabled: boolean) => void;
  /**
   * Called by workspace when the target pane's underlying bars change
   * (e.g., symbol/interval switch while replay is active).
   */
  syncTargetBars: (target: ReplayTargetInput) => void;
}

const DEFAULT_SNAPSHOT: ReplaySnapshot = {
  active: false,
  targetPaneId: "pane-1",
  symbolId: "",
  interval: "1D",
  startIndex: 0,
  currentIndex: 0,
  totalBars: 0,
  currentBar: null,
  currentTimestamp: null,
  isPlaying: false,
  speed: 1,
  pickStartMode: false,
  syncLinkedPanes: true,
};

const ReplayContext = createContext<ReplayContextValue | null>(null);

function computeDefaultStartIndex(total: number): number {
  if (total <= 1) return 0;
  if (total <= 10) return Math.max(0, Math.floor(total / 2));
  // Keep enough prefix history for MA60/MACD/BOLL while leaving a rich segment to replay
  const suggested = Math.floor(total * 0.65);
  return Math.max(Math.min(30, total - 2), Math.min(suggested, total - 2));
}

interface ReplayProviderProps {
  children: React.ReactNode;
  onReachEnd?: () => void;
}

export function ReplayProvider({ children, onReachEnd }: ReplayProviderProps) {
  const [active, setActive] = useState(false);
  const [targetPaneId, setTargetPaneId] = useState("pane-1");
  const [symbolId, setSymbolId] = useState("");
  const [interval, setIntervalState] = useState<Interval>("1D");
  const [bars, setBars] = useState<NormalizedBar[]>([]);
  const [startIndex, setStartIndexState] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);
  const [pickStartMode, setPickStartModeState] = useState(false);
  const [syncLinkedPanes, setSyncLinkedPanesState] = useState(true);

  const onReachEndRef = useRef(onReachEnd);
  onReachEndRef.current = onReachEnd;

  const totalBars = bars.length;

  const enterReplay = useCallback(
    (target: ReplayTargetInput, explicitStart?: number) => {
      const n = target.bars.length;
      const clampedStart =
        n === 0
          ? 0
          : typeof explicitStart === "number"
          ? Math.max(0, Math.min(explicitStart, n - 1))
          : computeDefaultStartIndex(n);

      setTargetPaneId(target.paneId);
      setSymbolId(target.symbolId);
      setIntervalState(target.interval);
      setBars(target.bars);
      setStartIndexState(clampedStart);
      setCurrentIndex(clampedStart);
      setIsPlaying(false);
      setPickStartModeState(false);
      setActive(true);
    },
    []
  );

  const exitReplay = useCallback(() => {
    setIsPlaying(false);
    setPickStartModeState(false);
    setActive(false);
  }, []);

  const play = useCallback(() => {
    if (!active || totalBars === 0) return;
    setPickStartModeState(false);
    setCurrentIndex((prev) => {
      // If already at the final bar, restart from startIndex before playing
      if (prev >= totalBars - 1 && startIndex < totalBars - 1) {
        return startIndex;
      }
      return prev;
    });
    setIsPlaying(true);
  }, [active, totalBars, startIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const stepForward = useCallback(() => {
    if (!active || totalBars === 0) return;
    setIsPlaying(false);
    setPickStartModeState(false);
    setCurrentIndex((prev) => {
      const next = Math.min(prev + 1, totalBars - 1);
      if (next === totalBars - 1 && prev < totalBars - 1) {
        onReachEndRef.current?.();
      }
      return next;
    });
  }, [active, totalBars]);

  const resetToStart = useCallback(() => {
    if (!active) return;
    setIsPlaying(false);
    setPickStartModeState(false);
    setCurrentIndex(Math.max(0, Math.min(startIndex, Math.max(totalBars - 1, 0))));
  }, [active, startIndex, totalBars]);

  const seekToIndex = useCallback(
    (index: number) => {
      if (!active || totalBars === 0) return;
      const clamped = Math.max(0, Math.min(index, totalBars - 1));
      setCurrentIndex(clamped);
      if (clamped >= totalBars - 1) {
        setIsPlaying(false);
      }
    },
    [active, totalBars]
  );

  const setStartAtIndex = useCallback(
    (index: number) => {
      if (!active || totalBars === 0) return;
      const clamped = Math.max(0, Math.min(index, totalBars - 1));
      setIsPlaying(false);
      setPickStartModeState(false);
      setStartIndexState(clamped);
      setCurrentIndex(clamped);
    },
    [active, totalBars]
  );

  const setSpeed = useCallback((nextSpeed: ReplaySpeed) => {
    setSpeedState(nextSpeed);
  }, []);

  const setPickStartMode = useCallback((enabled: boolean) => {
    if (enabled) {
      setIsPlaying(false);
    }
    setPickStartModeState(enabled);
  }, []);

  const setSyncLinkedPanes = useCallback((enabled: boolean) => {
    setSyncLinkedPanesState(enabled);
  }, []);

  const syncTargetBars = useCallback(
    (target: ReplayTargetInput) => {
      if (!active || target.paneId !== targetPaneId) return;

      const changedSeries =
        target.symbolId !== symbolId || target.interval !== interval;
      setSymbolId(target.symbolId);
      setIntervalState(target.interval);
      setBars(target.bars);

      const n = target.bars.length;
      if (n === 0) {
        setIsPlaying(false);
        setStartIndexState(0);
        setCurrentIndex(0);
        return;
      }

      if (changedSeries) {
        const nextStart = computeDefaultStartIndex(n);
        setIsPlaying(false);
        setStartIndexState(nextStart);
        setCurrentIndex(nextStart);
      } else {
        setStartIndexState((prev) => Math.min(prev, n - 1));
        setCurrentIndex((prev) => Math.min(prev, n - 1));
      }
    },
    [active, targetPaneId, symbolId, interval]
  );

  // Playback timer: advances 1 bar every (1000 / speed) ms
  useEffect(() => {
    if (!active || !isPlaying || totalBars === 0) return;

    const intervalMs = Math.max(80, Math.round(1000 / speed));
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= totalBars - 1) {
          setIsPlaying(false);
          onReachEndRef.current?.();
          return prev;
        }
        const next = prev + 1;
        if (next >= totalBars - 1) {
          setIsPlaying(false);
          onReachEndRef.current?.();
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, isPlaying, speed, totalBars]);

  const currentBar =
    active && totalBars > 0
      ? bars[Math.min(currentIndex, totalBars - 1)] ?? null
      : null;

  const state: ReplaySnapshot = useMemo(
    () =>
      active
        ? {
            active,
            targetPaneId,
            symbolId,
            interval,
            startIndex,
            currentIndex,
            totalBars,
            currentBar,
            currentTimestamp: currentBar?.timestamp ?? null,
            isPlaying,
            speed,
            pickStartMode,
            syncLinkedPanes,
          }
        : {
            ...DEFAULT_SNAPSHOT,
            speed,
            syncLinkedPanes,
          },
    [
      active,
      targetPaneId,
      symbolId,
      interval,
      startIndex,
      currentIndex,
      totalBars,
      currentBar,
      isPlaying,
      speed,
      pickStartMode,
      syncLinkedPanes,
    ]
  );

  const value = useMemo<ReplayContextValue>(
    () => ({
      state,
      enterReplay,
      exitReplay,
      play,
      pause,
      togglePlay,
      stepForward,
      resetToStart,
      seekToIndex,
      setStartAtIndex,
      setSpeed,
      setPickStartMode,
      setSyncLinkedPanes,
      syncTargetBars,
    }),
    [
      state,
      enterReplay,
      exitReplay,
      play,
      pause,
      togglePlay,
      stepForward,
      resetToStart,
      seekToIndex,
      setStartAtIndex,
      setSpeed,
      setPickStartMode,
      setSyncLinkedPanes,
      syncTargetBars,
    ]
  );

  return (
    <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>
  );
}

export function useReplay(): ReplayContextValue {
  const ctx = useContext(ReplayContext);
  if (!ctx) {
    throw new Error("useReplay must be used within a ReplayProvider");
  }
  return ctx;
}
