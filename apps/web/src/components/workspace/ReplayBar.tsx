"use client";

import React from "react";
import { REPLAY_SPEEDS, type ReplaySpeed } from "@trade-buddy/shared-types";
import {
  IconClose,
  IconCrosshairPick,
  IconLink,
  IconPause,
  IconPlay,
  IconReplay,
  IconSkipBack,
  IconStepForward,
} from "@trade-buddy/ui-tokens";
import { useReplay } from "@/lib/replay-store";
import { formatBarTimestamp } from "@/lib/chart-sync";

interface ReplayBarProps {
  targetLabel: string;
  isMultiChart: boolean;
  canSyncLinkedPanes: boolean;
  activePaneSwitch?: {
    activeLabel: string;
    onSwitchToActive: () => void;
  } | null;
}

export function ReplayBar({
  targetLabel,
  isMultiChart,
  canSyncLinkedPanes,
  activePaneSwitch,
}: ReplayBarProps) {
  const {
    state,
    exitReplay,
    togglePlay,
    stepForward,
    resetToStart,
    seekToIndex,
    setSpeed,
    setPickStartMode,
    setSyncLinkedPanes,
  } = useReplay();

  if (!state.active) return null;

  const maxIdx = Math.max(state.totalBars - 1, 0);
  const atEnd = state.totalBars === 0 || state.currentIndex >= maxIdx;
  const currentTimeLabel = state.currentTimestamp
    ? formatBarTimestamp(state.currentTimestamp, state.interval)
    : "—";

  return (
    <div
      role="region"
      aria-label="K 线回放控制条"
      className="tb-panel tb-border flex min-h-[36px] shrink-0 flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-t px-2.5 py-1 text-[11px]"
    >
      {/* Left: Target Badge & Pick-Start Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.16)",
            color: "var(--status-delayed)",
          }}
        >
          <IconReplay size={12} />
          <span>回放</span>
        </span>

        <span className="font-semibold tb-text-primary tabular-nums">
          {targetLabel}
        </span>

        {activePaneSwitch && (
          <button
            type="button"
            onClick={activePaneSwitch.onSwitchToActive}
            title={`切换回放目标至当前活动图 (${activePaneSwitch.activeLabel})`}
            className="tb-hover tb-border-subtle rounded border px-1.5 py-0.5 text-[10px] text-[var(--accent-primary)] cursor-pointer"
          >
            切到 {activePaneSwitch.activeLabel}
          </button>
        )}

        <div className="h-3.5 w-px bg-[var(--border-hairline)] mx-0.5" />

        <button
          type="button"
          onClick={() => setPickStartMode(!state.pickStartMode)}
          title="在图表上点击任意一根 K 线，设为回放起点"
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
            state.pickStartMode
              ? "bg-[rgba(245,158,11,0.2)] text-[var(--status-delayed)]"
              : "tb-hover tb-text-secondary hover:text-[var(--text-primary)]"
          }`}
        >
          <IconCrosshairPick size={13} />
          <span>{state.pickStartMode ? "点选起点中..." : "选起点"}</span>
        </button>
      </div>

      {/* Center: Transport Controls + Speed + Progress Slider */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={resetToStart}
            title={`回到回放起点（第 ${state.startIndex + 1} 根）`}
            className="tb-hover flex h-6 w-6 items-center justify-center rounded tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
          >
            <IconSkipBack size={13} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={state.totalBars === 0}
            title={
              state.isPlaying
                ? "暂停回放（Space）"
                : atEnd
                ? "从起点重新播放（Space）"
                : "开始播放（Space）"
            }
            className="flex h-6 items-center gap-1 rounded bg-[var(--accent-primary)] px-2 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-40"
          >
            {state.isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
            <span>{state.isPlaying ? "暂停" : "播放"}</span>
          </button>

          <button
            type="button"
            onClick={stepForward}
            disabled={atEnd}
            title="单步前进 1 根 K 线"
            className="tb-hover flex h-6 w-6 items-center justify-center rounded tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <IconStepForward size={13} />
          </button>
        </div>

        {/* Speed Selector */}
        <div
          className="flex items-center rounded border tb-border p-0.5 shrink-0"
          style={{ backgroundColor: "var(--bg-canvas)" }}
          role="group"
          aria-label="回放速度"
        >
          {REPLAY_SPEEDS.map((spd: ReplaySpeed) => {
            const active = state.speed === spd;
            return (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeed(spd)}
                title={`每秒推进 ${spd} 根 K 线`}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-text-muted hover:text-[var(--text-primary)]"
                }`}
              >
                {spd}×
              </button>
            );
          })}
        </div>

        {/* Timeline Slider */}
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={Math.min(state.currentIndex, maxIdx)}
            disabled={state.totalBars <= 1}
            onChange={(e) => seekToIndex(Number(e.target.value))}
            aria-label="回放进度条"
            className="h-1.5 flex-1 cursor-pointer accent-[var(--accent-primary)]"
          />
          <span className="tabular-nums text-[11px] font-medium tb-text-primary shrink-0">
            {currentTimeLabel}
          </span>
          <span className="tabular-nums text-[10px] tb-text-muted shrink-0">
            {state.totalBars > 0
              ? `${state.currentIndex + 1}/${state.totalBars}`
              : "0/0"}
          </span>
        </div>
      </div>

      {/* Right: Multi-Pane Sync Option + Exit Replay */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isMultiChart &&
          (canSyncLinkedPanes ? (
            <button
              type="button"
              onClick={() => setSyncLinkedPanes(!state.syncLinkedPanes)}
              title={
                state.syncLinkedPanes
                  ? "已开启：其它已开启周期联动的宫格按当前回放时间戳同步截断显示（无未来数据）"
                  : "已关闭：当前仅回放目标图，点击开启按时间戳同步其它已联动图"
              }
              className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                state.syncLinkedPanes
                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "tb-border-subtle tb-text-muted tb-hover"
              }`}
            >
              <IconLink size={11} />
              <span>{state.syncLinkedPanes ? "同步联动图" : "仅活动图"}</span>
            </button>
          ) : (
            <span
              title="周期联动未开启或当前图已解除周期联动，回放仅作用于当前目标图"
              className="rounded border tb-border px-1.5 py-0.5 text-[10px] tb-text-muted"
            >
              仅活动图回放
            </span>
          ))}

        <button
          type="button"
          onClick={exitReplay}
          title="结束回放并恢复显示全部历史 K 线"
          className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] tb-text-secondary hover:text-[#F2485B] transition-colors cursor-pointer"
        >
          <IconClose size={12} />
          <span>结束回放</span>
        </button>
      </div>
    </div>
  );
}
