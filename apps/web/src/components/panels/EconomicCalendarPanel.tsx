"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CalendarEvent,
  CalendarImportance,
  CalendarResponse,
  SymbolMeta,
} from "@trade-buddy/shared-types";
import { IconExternalLink, IconRefresh } from "@trade-buddy/ui-tokens";

interface EconomicCalendarPanelProps {
  symbol: SymbolMeta;
}

type FilterMode = "all" | "high" | "macro" | "earnings";

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function formatDateHeading(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const dt = new Date(`${dateStr}T00:00:00Z`);
  const wd = Number.isFinite(dt.getTime())
    ? WEEKDAYS_ZH[dt.getUTCDay()]
    : "";
  return dateStr === today ? `${dateStr} · ${wd}（今天）` : `${dateStr} · ${wd}`;
}

function ImportanceBars({ level }: { level?: CalendarImportance }) {
  const activeCount = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const activeColor =
    level === "high"
      ? "#F2485B"
      : level === "medium"
      ? "var(--status-delayed)"
      : "var(--text-muted)";

  return (
    <span
      title={
        level === "high"
          ? "高重要性"
          : level === "medium"
          ? "中等重要性"
          : "一般事件"
      }
      className="inline-flex items-end gap-[2px] h-2.5"
    >
      {[1, 2, 3].map((idx) => (
        <span
          key={idx}
          className="w-[2.5px] rounded-[1px]"
          style={{
            height: idx === 1 ? 4 : idx === 2 ? 7 : 10,
            backgroundColor:
              idx <= activeCount ? activeColor : "var(--border-subtle)",
          }}
        />
      ))}
    </span>
  );
}

export function EconomicCalendarPanel({ symbol }: EconomicCalendarPanelProps) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCalendar = useCallback(
    async (rangeDays: number, forceRefresh = false) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({
          days: String(rangeDays),
          symbol: symbol.id,
        });
        if (forceRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/calendar?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CalendarResponse;
        setData(json);
      } catch {
        setErrorMsg("请求本地经济日历接口失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [symbol.id]
  );

  useEffect(() => {
    void loadCalendar(days, false);
  }, [days, symbol.id, loadCalendar]);

  const groupedEvents = useMemo(() => {
    const events = data?.events ?? [];
    const filtered = events.filter((ev) => {
      if (filter === "high") return ev.importance === "high";
      if (filter === "macro") return ev.kind === "macro";
      if (filter === "earnings")
        return ev.kind === "earnings" || ev.kind === "filing";
      return true;
    });

    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filtered) {
      const list = map.get(ev.date);
      if (list) list.push(ev);
      else map.set(ev.date, [ev]);
    }
    return Array.from(map.entries());
  }, [data, filter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="tb-border flex h-[36px] shrink-0 items-center justify-between border-b px-3">
        <span className="text-[12px] font-semibold tb-text-primary">
          宏观与财报日历
        </span>
        <button
          type="button"
          onClick={() => void loadCalendar(days, true)}
          disabled={loading}
          title="手动刷新经济日历"
          className="tb-hover flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
        >
          <IconRefresh
            size={13}
            className={loading ? "animate-spin" : undefined}
          />
          <span>刷新</span>
        </button>
      </div>

      {/* Controls & Provenance */}
      <div className="tb-border shrink-0 space-y-2 border-b px-2.5 py-2">
        {/* Range & Filter Pills */}
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <div className="flex items-center gap-1">
            {(
              [
                ["all", "全部"],
                ["high", "高重要"],
                ["macro", "宏观"],
                ["earnings", "财报/申报"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded px-1.5 py-0.5 font-medium transition-colors cursor-pointer ${
                  filter === k
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-text-secondary tb-hover"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded bg-[var(--bg-canvas)] p-0.5">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded px-1.5 py-0.5 tabular-nums cursor-pointer ${
                  days === d
                    ? "bg-[var(--bg-active)] tb-text-primary font-medium"
                    : "tb-text-muted hover:text-[var(--text-primary)]"
                }`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>

        {/* Source & Delay Note */}
        {data && (
          <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2 py-1.5 text-[10px] leading-snug">
            {data.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-0.5">
                <span className="tb-text-muted">来源：</span>
                {data.sources.map((src) => (
                  <span
                    key={src}
                    className="rounded px-1 py-0.2 text-[9px] font-medium"
                    style={{
                      backgroundColor: "var(--accent-soft)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {src}
                  </span>
                ))}
              </div>
            )}
            <div className="tb-text-muted">{data.delayNote}</div>
            {data.warning && (
              <div
                className="mt-1 font-medium"
                style={{ color: "var(--status-delayed)" }}
              >
                {data.warning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto">
        {loading && !data ? (
          <div className="space-y-2.5 p-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded bg-[var(--bg-elevated)]"
              />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="flex h-full flex-col items-center justify-center p-5 text-center">
            <div className="text-[12px] font-semibold tb-text-primary">
              加载经济日历失败
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={() => void loadCalendar(days, true)}
              className="mt-3 rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : groupedEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-5 text-center">
            <div className="text-[12px] font-semibold tb-text-primary">
              {data && data.events.length > 0
                ? "当前筛选条件下无匹配事件"
                : "暂无可展示的经济日历事件"}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {data && data.events.length > 0
                ? "可切换至「全部」筛选或扩大上方天数窗口（14天 / 30天）。"
                : data?.emptyHint ||
                  "未获取到公开日历日程；联网时无 Key 支持 BLS / FRED 官方发布表与 SEC 财报申报，配置 FINNHUB_API_KEY 可解锁完整前值/预测/公布数值。"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {data && data.events.length > 0 && filter !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="rounded border tb-border-subtle px-2.5 py-1 text-[11px] tb-text-primary tb-hover cursor-pointer"
                >
                  显示全部
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadCalendar(days, true)}
                className="rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
              >
                重试刷新
              </button>
            </div>
          </div>
        ) : (
          <div>
            {groupedEvents.map(([dateStr, items]) => (
              <div key={dateStr}>
                <div className="sticky top-0 z-10 tb-border border-y bg-[var(--bg-canvas)] px-3 py-1 text-[10px] font-semibold tb-text-secondary tabular-nums">
                  {formatDateHeading(dateStr)}
                </div>

                <div className="divide-y divide-[var(--border-hairline)]">
                  {items.map((ev) => {
                    const hasMetrics =
                      ev.previous !== undefined ||
                      ev.forecast !== undefined ||
                      ev.actual !== undefined;

                    return (
                      <div key={ev.id} className="px-3 py-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <span className="tabular-nums font-medium tb-text-secondary">
                              {ev.time}
                              {ev.timezone ? ` ${ev.timezone}` : ""}
                            </span>
                            <span className="rounded bg-[var(--bg-active)] px-1 py-0.2 text-[9px] font-semibold tb-text-primary">
                              {ev.country}
                            </span>
                            <span
                              className="rounded px-1 py-0.2 text-[9px]"
                              style={{
                                backgroundColor:
                                  ev.kind === "macro"
                                    ? "rgba(56, 189, 248, 0.14)"
                                    : "rgba(168, 85, 247, 0.16)",
                                color:
                                  ev.kind === "macro"
                                    ? "var(--status-iex)"
                                    : "var(--status-proxy)",
                              }}
                            >
                              {ev.kind === "macro"
                                ? "宏观"
                                : ev.kind === "earnings"
                                ? "财报"
                                : "SEC申报"}
                            </span>
                          </div>
                          <ImportanceBars level={ev.importance} />
                        </div>

                        <div className="mt-1 flex items-start justify-between gap-1.5">
                          {ev.url ? (
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium leading-snug tb-text-primary hover:text-[var(--accent-primary)] transition-colors"
                            >
                              {ev.title}
                            </a>
                          ) : (
                            <span className="font-medium leading-snug tb-text-primary">
                              {ev.title}
                            </span>
                          )}
                          {ev.url && (
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="查看官方详情"
                              className="mt-0.5 shrink-0 tb-text-muted hover:text-[var(--accent-primary)]"
                            >
                              <IconExternalLink size={12} />
                            </a>
                          )}
                        </div>

                        {hasMetrics && (
                          <div className="mt-1.5 grid grid-cols-3 gap-1 rounded bg-[var(--bg-canvas)] px-2 py-1 text-[10px] tabular-nums">
                            <div>
                              <span className="tb-text-muted">前值 </span>
                              <span className="tb-text-secondary">
                                {ev.previous ?? "—"}
                              </span>
                            </div>
                            <div>
                              <span className="tb-text-muted">预测 </span>
                              <span className="tb-text-secondary">
                                {ev.forecast ?? "—"}
                              </span>
                            </div>
                            <div>
                              <span className="tb-text-muted">公布 </span>
                              <span className="font-semibold tb-text-primary">
                                {ev.actual ?? "待公布"}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="mt-1 text-[9px] tb-text-muted">
                          {ev.source}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
