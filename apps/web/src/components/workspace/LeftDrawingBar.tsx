"use client";

import React from "react";
import type { DrawingToolId } from "@trade-buddy/shared-types";
import {
  IconCrosshair,
  IconFibonacci,
  IconHorizontalLine,
  IconMagnet,
  IconMeasure,
  IconParallelChannel,
  IconRayLine,
  IconRectangle,
  IconTextTool,
  IconTrash,
  IconTrendline,
} from "@trade-buddy/ui-tokens";

interface ToolItem {
  id: DrawingToolId;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  implemented: boolean;
}

const DRAWING_TOOLS: ToolItem[] = [
  {
    id: "cursor",
    label: "十字光标 (Esc)",
    shortcut: "Esc",
    icon: <IconCrosshair size={18} />,
    implemented: true,
  },
  {
    id: "trendline",
    label: "趋势线（两点连线）",
    shortcut: "Alt+T",
    icon: <IconTrendline size={18} />,
    implemented: true,
  },
  {
    id: "horizontal",
    label: "水平价格线",
    shortcut: "Alt+H",
    icon: <IconHorizontalLine size={18} />,
    implemented: true,
  },
  {
    id: "ray",
    label: "射线",
    icon: <IconRayLine size={18} />,
    implemented: true,
  },
  {
    id: "channel",
    label: "平行通道（三点）",
    icon: <IconParallelChannel size={18} />,
    implemented: true,
  },
  {
    id: "rectangle",
    label: "矩形阻力/支撑区",
    shortcut: "Alt+R",
    icon: <IconRectangle size={18} />,
    implemented: true,
  },
  {
    id: "fibonacci",
    label: "斐波那契回撤",
    shortcut: "Alt+F",
    icon: <IconFibonacci size={18} />,
    implemented: true,
  },
  {
    id: "text",
    label: "文字注释标记",
    icon: <IconTextTool size={18} />,
    implemented: true,
  },
  {
    id: "measure",
    label: "涨跌幅测距尺（占位 · 后续批次完善）",
    icon: <IconMeasure size={18} />,
    implemented: false,
  },
];

interface LeftDrawingBarProps {
  activeTool: DrawingToolId;
  magnetEnabled: boolean;
  drawingCount: number;
  onSelectTool: (tool: DrawingToolId) => void;
  onToggleMagnet: () => void;
  onClearDrawings: () => void;
}

export function LeftDrawingBar({
  activeTool,
  magnetEnabled,
  drawingCount,
  onSelectTool,
  onToggleMagnet,
  onClearDrawings,
}: LeftDrawingBarProps) {
  return (
    <aside
      aria-label="左侧画线工具栏"
      className="tb-panel tb-border flex w-[48px] shrink-0 flex-col items-center justify-between border-r py-2"
    >
      <div className="flex flex-col items-center gap-1">
        {DRAWING_TOOLS.map((tool, idx) => {
          const isActive = activeTool === tool.id;
          return (
            <React.Fragment key={tool.id}>
              {(idx === 1 || idx === 5 || idx === 8) && (
                <div className="my-1 h-px w-6 bg-[var(--border-hairline)]" />
              )}
              <button
                type="button"
                onClick={() => onSelectTool(tool.id)}
                title={
                  tool.implemented
                    ? tool.label
                    : `${tool.label}`
                }
                className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : tool.implemented
                    ? "tb-text-secondary tb-hover hover:text-[var(--text-primary)] cursor-pointer"
                    : "tb-text-muted opacity-55 tb-hover cursor-pointer"
                }`}
              >
                {tool.icon}
                {!tool.implemented && (
                  <span
                    className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--status-delayed)" }}
                  />
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom utilities: Magnet & Clear */}
      <div className="flex flex-col items-center gap-1 pt-2 border-t tb-border w-full">
        <button
          type="button"
          onClick={onToggleMagnet}
          title={
            magnetEnabled
              ? "磁铁吸附：已开启（自动吸附 K 线 OHLC）"
              : "磁铁吸附：已关闭"
          }
          className={`flex h-8 w-8 items-center justify-center rounded transition-colors cursor-pointer ${
            magnetEnabled
              ? "bg-[var(--accent-primary)] text-white"
              : "tb-text-secondary tb-hover hover:text-[var(--text-primary)]"
          }`}
        >
          <IconMagnet size={17} />
        </button>

        <button
          type="button"
          onClick={onClearDrawings}
          disabled={drawingCount === 0}
          title={
            drawingCount > 0
              ? `清除当前图表全部画线（共 ${drawingCount} 条）`
              : "当前无画线对象"
          }
          className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors ${
            drawingCount > 0
              ? "tb-text-secondary tb-hover hover:text-[#F2485B] cursor-pointer"
              : "tb-text-muted opacity-40 cursor-not-allowed"
          }`}
        >
          <IconTrash size={17} />
          {drawingCount > 0 && (
            <span className="tabular-nums absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent-primary)] px-0.5 text-[9px] font-semibold text-white">
              {drawingCount}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
