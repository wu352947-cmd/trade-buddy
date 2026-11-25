"use client";

import React from "react";
import {
  IconBell,
  IconCalendar,
  IconDataWindow,
  IconFundamentals,
  IconNews,
  IconObjectTree,
  IconWatchlist,
} from "@trade-buddy/ui-tokens";

export type RightPanelTab =
  | "watchlist"
  | "alerts"
  | "data"
  | "tree"
  | "fundamentals"
  | "news"
  | "calendar";

interface RightIconRailProps {
  activeTab: RightPanelTab | null;
  onSelectTab: (tab: RightPanelTab) => void;
  alertUnreadCount?: number;
  activeAlertRuleCount?: number;
}

const RAIL_ITEMS: Array<{
  id: RightPanelTab;
  label: string;
  icon: React.ReactNode;
  placeholder?: boolean;
}> = [
  {
    id: "watchlist",
    label: "自选列表与品种详情",
    icon: <IconWatchlist size={18} />,
  },
  {
    id: "alerts",
    label: "本地提醒与通知中心（仅页面打开时生效）",
    icon: <IconBell size={18} />,
  },
  {
    id: "data",
    label: "数据窗口（随光标实时更新）",
    icon: <IconDataWindow size={18} />,
  },
  {
    id: "tree",
    label: "对象树（管理指标与画线）",
    icon: <IconObjectTree size={18} />,
  },
  {
    id: "fundamentals",
    label: "财务数据（美股 SEC EDGAR 财报）",
    icon: <IconFundamentals size={18} />,
  },
  {
    id: "news",
    label: "财经资讯流（当前品种 / 全市场）",
    icon: <IconNews size={18} />,
  },
  {
    id: "calendar",
    label: "宏观经济与财报日历",
    icon: <IconCalendar size={18} />,
  },
];

export function RightIconRail({
  activeTab,
  onSelectTab,
  alertUnreadCount = 0,
  activeAlertRuleCount = 0,
}: RightIconRailProps) {
  return (
    <nav
      aria-label="右侧功能导轨"
      className="tb-panel tb-border flex w-[42px] shrink-0 flex-col items-center gap-1 border-l py-2"
    >
      {RAIL_ITEMS.map((item, idx) => {
        const active = activeTab === item.id;
        return (
          <React.Fragment key={item.id}>
            {idx === 4 && (
              <div className="my-1 h-px w-6 bg-[var(--border-hairline)]" />
            )}
            <button
              type="button"
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              className={`relative flex h-8 w-8 items-center justify-center rounded transition-colors cursor-pointer ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : item.placeholder
                  ? "tb-text-muted opacity-65 tb-hover"
                  : "tb-text-secondary tb-hover hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              {item.id === "alerts" && alertUnreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#F2485B] px-1 text-[9px] font-bold text-white tabular-nums">
                  {alertUnreadCount > 9 ? "9+" : alertUnreadCount}
                </span>
              )}
              {item.id === "alerts" &&
                alertUnreadCount === 0 &&
                activeAlertRuleCount > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "#06B6D4" }}
                  />
                )}
              {item.placeholder && (
                <span
                  className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--status-delayed)" }}
                />
              )}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
