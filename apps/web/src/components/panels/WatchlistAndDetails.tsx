"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  DataProvenance,
  MarketCategory,
  NormalizedQuote,
  SymbolMeta,
  WatchlistGroup,
  WatchlistSummaryItem,
} from "@trade-buddy/shared-types";
import {
  IconBell,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconDragHandle,
  IconEdit,
  IconPlus,
  IconStar,
  IconTrash,
} from "@trade-buddy/ui-tokens";

interface WatchlistAndDetailsProps {
  watchlist: WatchlistSummaryItem[];
  groups: WatchlistGroup[];
  activeSymbol: SymbolMeta;
  activeQuote: NormalizedQuote;
  activeProvenance: DataProvenance;
  defaultMarket?: MarketCategory;
  onSelectSymbol: (symbolId: string) => void;
  onCreateGroup: (name: string, initialSymbolIds?: string[]) => void;
  onRenameGroup: (groupId: string, nextName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onReorderGroups: (
    sourceGroupId: string,
    targetGroupId: string,
    position: "before" | "after"
  ) => void;
  onReorderSymbol: (params: {
    sourceGroupId: string;
    symbolId: string;
    targetGroupId: string;
    targetSymbolId?: string | null;
    position?: "before" | "after";
  }) => void;
  onAddSymbolToGroup: (groupId: string, symbolId: string) => void;
  onRemoveSymbolFromGroup: (groupId: string, symbolId: string) => void;
  onResetDefaultGroups: () => void;
  onOpenSearchForGroup?: (groupId: string) => void;
  onOpenFundamentals?: () => void;
  onOpenAlerts?: () => void;
}

type DragPayload =
  | { type: "group"; groupId: string }
  | { type: "symbol"; groupId: string; symbolId: string };

type DropHint =
  | { kind: "group"; groupId: string; position: "before" | "after" }
  | { kind: "group_append"; groupId: string }
  | {
      kind: "symbol";
      groupId: string;
      symbolId: string;
      position: "before" | "after";
    };

function formatVolume(vol: number): string {
  if (!vol || vol <= 0) return "—";
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(1)}万`;
  return String(Math.round(vol));
}

function ProvenanceMicroBadge({ provenance }: { provenance: DataProvenance }) {
  if (provenance.isProxy) {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1 text-[9px] font-semibold"
        style={{
          backgroundColor: "rgba(168, 85, 247, 0.16)",
          color: "var(--status-proxy)",
        }}
      >
        代理
      </span>
    );
  }
  if (provenance.kind === "official_fred") {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1 text-[9px] font-semibold"
        style={{
          backgroundColor: "rgba(56, 189, 248, 0.16)",
          color: "var(--status-iex)",
        }}
      >
        FRED
      </span>
    );
  }
  return (
    <span
      title={provenance.delayNote}
      className="rounded px-1 text-[9px] font-semibold"
      style={{
        backgroundColor: "rgba(100, 116, 139, 0.22)",
        color: "var(--text-secondary)",
      }}
    >
      {provenance.isSample ? "样本" : "EOD"}
    </span>
  );
}

export function WatchlistAndDetails({
  watchlist,
  groups,
  activeSymbol,
  activeQuote,
  activeProvenance,
  defaultMarket = "US",
  onSelectSymbol,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onToggleGroupCollapsed,
  onReorderGroups,
  onReorderSymbol,
  onAddSymbolToGroup,
  onRemoveSymbolFromGroup,
  onResetDefaultGroups,
  onOpenSearchForGroup,
  onOpenFundamentals,
  onOpenAlerts,
}: WatchlistAndDetailsProps) {
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<
    string | null
  >(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [quickNewGroupName, setQuickNewGroupName] = useState("");

  // Native HTML5 drag-and-drop state
  const dragRef = useRef<DragPayload | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(e.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const itemBySymbolId = useMemo(() => {
    const map = new Map<string, WatchlistSummaryItem>();
    for (const item of watchlist) {
      map.set(item.symbol.id, item);
    }
    return map;
  }, [watchlist]);

  const activeSymbolInAnyGroup = useMemo(
    () => groups.some((g) => g.symbolIds.includes(activeSymbol.id)),
    [groups, activeSymbol.id]
  );

  const handleSubmitNewGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    onCreateGroup(trimmed);
    setNewGroupName("");
    setCreatingGroup(false);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDropHint(null);
  };

  const isUp = activeQuote.change >= 0;
  const range52wSpan = Math.max(activeQuote.high52w - activeQuote.low52w, 0.0001);
  const range52wPct = Math.min(
    100,
    Math.max(0, ((activeQuote.last - activeQuote.low52w) / range52wSpan) * 100)
  );

  const perfItems: Array<{ label: string; value?: number }> = [
    { label: "1周", value: activeQuote.perf.w1 },
    { label: "1月", value: activeQuote.perf.m1 },
    { label: "3月", value: activeQuote.perf.m3 },
    { label: "6月", value: activeQuote.perf.m6 },
    { label: "1年", value: activeQuote.perf.y1 },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top Half: Custom Watchlist Groups */}
      <div className="flex min-h-0 flex-[1.25] flex-col overflow-hidden">
        {/* Header */}
        <div className="tb-border flex h-[34px] shrink-0 items-center justify-between border-b px-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12px] font-semibold tb-text-primary truncate">
              自选分组
            </span>
            <span className="text-[10px] tb-text-muted tabular-nums">
              {groups.length}组
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {confirmReset ? (
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    onResetDefaultGroups();
                    setConfirmReset(false);
                  }}
                  className="rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-white cursor-pointer"
                >
                  确认恢复
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded border tb-border-subtle px-1 py-0.5 tb-text-secondary cursor-pointer"
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingGroup((v) => !v);
                    setConfirmReset(false);
                  }}
                  title="新建自定义自选分组"
                  className="flex items-center gap-0.5 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white transition-colors cursor-pointer"
                >
                  <IconPlus size={11} />
                  <span>新建分组</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  title="恢复默认 4 个市场分组"
                  className="tb-hover rounded px-1.5 py-0.5 text-[10px] tb-text-muted hover:text-[var(--text-primary)] cursor-pointer"
                >
                  恢复默认
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline New Group Form */}
        {creatingGroup && (
          <form
            onSubmit={handleSubmitNewGroup}
            className="tb-border flex items-center gap-1.5 border-b bg-[var(--bg-canvas)] px-2.5 py-1.5"
          >
            <input
              type="text"
              autoFocus
              maxLength={40}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="输入分组名称（如：科技观察）"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreatingGroup(false);
                  setNewGroupName("");
                }
              }}
              className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-2 py-0.5 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)]"
            />
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              className="rounded bg-[var(--accent-primary)] px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-45 cursor-pointer"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingGroup(false);
                setNewGroupName("");
              }}
              className="tb-hover rounded p-0.5 tb-text-muted cursor-pointer"
            >
              <IconClose size={12} />
            </button>
          </form>
        )}

        {/* Column Header */}
        <div className="tb-border grid grid-cols-[1.28fr_0.72fr_0.62fr_0.68fr] border-b px-3 py-1 text-[10px] font-medium tb-text-muted">
          <span>品种（可拖动排序）</span>
          <span className="text-right">最新</span>
          <span className="text-right">涨跌</span>
          <span className="text-right">涨幅</span>
        </div>

        {/* Draggable Groups & Rows */}
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] tb-text-muted space-y-2">
              <div>当前暂无自选分组</div>
              <button
                type="button"
                onClick={onResetDefaultGroups}
                className="rounded border tb-border-subtle px-2.5 py-1 text-[11px] text-[var(--accent-primary)] tb-hover cursor-pointer"
              >
                恢复默认 4 个市场分组
              </button>
            </div>
          ) : (
            groups.map((group) => {
              const rows = group.symbolIds
                .map((id) => itemBySymbolId.get(id))
                .filter((x): x is WatchlistSummaryItem => Boolean(x));
              const collapsed = group.collapsed;
              const isDefaultMarketGroup = group.marketKey === defaultMarket;
              const isRenaming = renamingGroupId === group.id;
              const isConfirmDelete = confirmDeleteGroupId === group.id;

              const isGroupDropBefore =
                dropHint?.kind === "group" &&
                dropHint.groupId === group.id &&
                dropHint.position === "before";
              const isGroupDropAfter =
                dropHint?.kind === "group" &&
                dropHint.groupId === group.id &&
                dropHint.position === "after";
              const isGroupAppendTarget =
                dropHint?.kind === "group_append" &&
                dropHint.groupId === group.id;

              return (
                <div
                  key={group.id}
                  className={`${
                    isGroupDropBefore
                      ? "border-t-2 border-t-[var(--accent-primary)]"
                      : ""
                  } ${
                    isGroupDropAfter
                      ? "border-b-2 border-b-[var(--accent-primary)]"
                      : ""
                  }`}
                >
                  {/* Group Header (draggable to reorder groups, also drop target for symbols) */}
                  <div
                    draggable={!isRenaming}
                    onDragStart={(e) => {
                      dragRef.current = { type: "group", groupId: group.id };
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(
                        "text/plain",
                        `group:${group.id}`
                      );
                    }}
                    onDragOver={(e) => {
                      const payload = dragRef.current;
                      if (!payload) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (payload.type === "group") {
                        if (payload.groupId === group.id) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos =
                          e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after";
                        setDropHint({
                          kind: "group",
                          groupId: group.id,
                          position: pos,
                        });
                      } else if (payload.type === "symbol") {
                        setDropHint({
                          kind: "group_append",
                          groupId: group.id,
                        });
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const payload = dragRef.current;
                      if (!payload) return;
                      if (payload.type === "group") {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos =
                          e.clientY < rect.top + rect.height / 2
                            ? "before"
                            : "after";
                        onReorderGroups(payload.groupId, group.id, pos);
                      } else if (payload.type === "symbol") {
                        onReorderSymbol({
                          sourceGroupId: payload.groupId,
                          symbolId: payload.symbolId,
                          targetGroupId: group.id,
                          targetSymbolId: null,
                        });
                      }
                      handleDragEnd();
                    }}
                    onDragEnd={handleDragEnd}
                    className={`group/hdr flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-semibold tb-text-secondary transition-colors ${
                      isGroupAppendTarget
                        ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                        : "tb-hover"
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex flex-1 items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          maxLength={40}
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && renameText.trim()) {
                              onRenameGroup(group.id, renameText);
                              setRenamingGroupId(null);
                            } else if (e.key === "Escape") {
                              setRenamingGroupId(null);
                            }
                          }}
                          className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-1.5 py-0.5 text-[11px] font-normal tb-text-primary outline-none focus:border-[var(--border-focus)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameText.trim()) {
                              onRenameGroup(group.id, renameText);
                            }
                            setRenamingGroupId(null);
                          }}
                          className="rounded bg-[var(--accent-primary)] p-0.5 text-white cursor-pointer"
                        >
                          <IconCheck size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingGroupId(null)}
                          className="rounded p-0.5 tb-text-muted tb-hover cursor-pointer"
                        >
                          <IconClose size={11} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <span
                            title="拖动以调整分组顺序"
                            className="cursor-grab tb-text-muted opacity-55 hover:opacity-100 active:cursor-grabbing shrink-0"
                          >
                            <IconDragHandle size={12} />
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleGroupCollapsed(group.id)}
                            className="flex min-w-0 flex-1 items-center gap-1 text-left cursor-pointer"
                          >
                            <IconChevronDown
                              size={12}
                              className={`shrink-0 transition-transform ${
                                collapsed ? "-rotate-90" : ""
                              }`}
                            />
                            <span className="truncate">{group.name}</span>
                            {isDefaultMarketGroup && (
                              <span
                                className="shrink-0 rounded px-1 text-[9px] font-medium"
                                style={{
                                  backgroundColor: "var(--accent-soft)",
                                  color: "var(--accent-primary)",
                                }}
                              >
                                默认
                              </span>
                            )}
                          </button>
                        </div>

                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1 shrink-0 text-[10px]">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteGroup(group.id);
                                setConfirmDeleteGroupId(null);
                              }}
                              className="rounded bg-[#F2485B] px-1.5 py-0.2 text-white cursor-pointer"
                            >
                              删
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroupId(null)}
                              className="rounded border tb-border-subtle px-1 py-0.2 tb-text-secondary cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {onOpenSearchForGroup && (
                              <button
                                type="button"
                                onClick={() => onOpenSearchForGroup(group.id)}
                                title={`向「${group.name}」添加品种`}
                                className="opacity-0 group-hover/hdr:opacity-100 focus:opacity-100 rounded p-0.5 tb-text-muted hover:text-[var(--accent-primary)] transition-opacity cursor-pointer"
                              >
                                <IconPlus size={11} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingGroupId(group.id);
                                setRenameText(group.name);
                                setConfirmDeleteGroupId(null);
                              }}
                              title="重命名分组"
                              className="opacity-0 group-hover/hdr:opacity-100 focus:opacity-100 rounded p-0.5 tb-text-muted hover:text-[var(--text-primary)] transition-opacity cursor-pointer"
                            >
                              <IconEdit size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteGroupId(group.id);
                                setRenamingGroupId(null);
                              }}
                              title="删除此分组"
                              className="opacity-0 group-hover/hdr:opacity-100 focus:opacity-100 rounded p-0.5 tb-text-muted hover:text-[#F2485B] transition-opacity cursor-pointer"
                            >
                              <IconTrash size={11} />
                            </button>
                            <span className="ml-0.5 tabular-nums text-[10px] tb-text-muted">
                              {rows.length}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Group Symbol Rows */}
                  {!collapsed &&
                    (rows.length === 0 ? (
                      <div
                        onDragOver={(e) => {
                          if (dragRef.current?.type !== "symbol") return;
                          e.preventDefault();
                          setDropHint({
                            kind: "group_append",
                            groupId: group.id,
                          });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const payload = dragRef.current;
                          if (payload?.type === "symbol") {
                            onReorderSymbol({
                              sourceGroupId: payload.groupId,
                              symbolId: payload.symbolId,
                              targetGroupId: group.id,
                              targetSymbolId: null,
                            });
                          }
                          handleDragEnd();
                        }}
                        className="px-4 py-2 text-[10px] tb-text-muted flex items-center justify-between"
                      >
                        <span>空分组，可拖入品种或点击添加</span>
                        {onOpenSearchForGroup && (
                          <button
                            type="button"
                            onClick={() => onOpenSearchForGroup(group.id)}
                            className="text-[var(--accent-primary)] hover:underline cursor-pointer"
                          >
                            + 添加
                          </button>
                        )}
                      </div>
                    ) : (
                      rows.map((item) => {
                        const selected = item.symbol.id === activeSymbol.id;
                        const rowUp = item.quote.change >= 0;
                        const prec = item.symbol.pricePrecision;
                        const isSymDropBefore =
                          dropHint?.kind === "symbol" &&
                          dropHint.groupId === group.id &&
                          dropHint.symbolId === item.symbol.id &&
                          dropHint.position === "before";
                        const isSymDropAfter =
                          dropHint?.kind === "symbol" &&
                          dropHint.groupId === group.id &&
                          dropHint.symbolId === item.symbol.id &&
                          dropHint.position === "after";

                        return (
                          <div
                            key={`${group.id}:${item.symbol.id}`}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              dragRef.current = {
                                type: "symbol",
                                groupId: group.id,
                                symbolId: item.symbol.id,
                              };
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData(
                                "text/plain",
                                `symbol:${group.id}:${item.symbol.id}`
                              );
                            }}
                            onDragOver={(e) => {
                              const payload = dragRef.current;
                              if (!payload || payload.type !== "symbol") return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = "move";
                              if (
                                payload.groupId === group.id &&
                                payload.symbolId === item.symbol.id
                              ) {
                                return;
                              }
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const pos =
                                e.clientY < rect.top + rect.height / 2
                                  ? "before"
                                  : "after";
                              setDropHint({
                                kind: "symbol",
                                groupId: group.id,
                                symbolId: item.symbol.id,
                                position: pos,
                              });
                            }}
                            onDrop={(e) => {
                              const payload = dragRef.current;
                              if (!payload || payload.type !== "symbol") return;
                              e.preventDefault();
                              e.stopPropagation();
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const pos =
                                e.clientY < rect.top + rect.height / 2
                                  ? "before"
                                  : "after";
                              onReorderSymbol({
                                sourceGroupId: payload.groupId,
                                symbolId: payload.symbolId,
                                targetGroupId: group.id,
                                targetSymbolId: item.symbol.id,
                                position: pos,
                              });
                              handleDragEnd();
                            }}
                            onDragEnd={handleDragEnd}
                            onClick={() => onSelectSymbol(item.symbol.id)}
                            className={`group/row relative grid w-full grid-cols-[1.28fr_0.72fr_0.62fr_0.68fr] items-center px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                              selected
                                ? "bg-[var(--accent-soft)] border-l-2 border-l-[var(--accent-primary)] pl-[8px]"
                                : "tb-hover"
                            } ${
                              isSymDropBefore
                                ? "border-t-2 border-t-[var(--accent-primary)]"
                                : ""
                            } ${
                              isSymDropAfter
                                ? "border-b-2 border-b-[var(--accent-primary)]"
                                : ""
                            }`}
                          >
                            <div className="min-w-0 pr-1 flex items-center gap-1">
                              <span
                                title="拖动排序或拖入其他分组"
                                className="cursor-grab tb-text-muted opacity-0 group-hover/row:opacity-65 shrink-0"
                              >
                                <IconDragHandle size={11} />
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-[12px] tb-text-primary truncate">
                                    {item.symbol.ticker}
                                  </span>
                                  <ProvenanceMicroBadge
                                    provenance={item.provenance}
                                  />
                                </div>
                                <div className="truncate text-[10px] tb-text-muted">
                                  {item.symbol.name}
                                </div>
                              </div>
                            </div>

                            <div className="tabular-nums text-right text-[12px] font-medium tb-text-primary">
                              {item.quote.last > 0
                                ? item.quote.last.toFixed(prec)
                                : "—"}
                            </div>
                            <div
                              className={`tabular-nums text-right text-[11px] ${
                                item.quote.last > 0
                                  ? rowUp
                                    ? "tb-up"
                                    : "tb-down"
                                  : "tb-text-muted"
                              }`}
                            >
                              {item.quote.last > 0
                                ? `${rowUp ? "+" : ""}${item.quote.change.toFixed(
                                    prec
                                  )}`
                                : "在线"}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`tabular-nums text-right text-[11px] font-medium ${
                                  item.quote.last > 0
                                    ? rowUp
                                      ? "tb-up"
                                      : "tb-down"
                                    : "tb-text-muted"
                                }`}
                              >
                                {item.quote.last > 0
                                  ? `${rowUp ? "+" : ""}${item.quote.changePercent.toFixed(
                                      2
                                    )}%`
                                  : "加载"}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveSymbolFromGroup(
                                    group.id,
                                    item.symbol.id
                                  );
                                }}
                                title={`从「${group.name}」移除 ${item.symbol.ticker}`}
                                className="opacity-0 group-hover/row:opacity-100 focus:opacity-100 rounded p-0.5 tb-text-muted hover:text-[#F2485B] transition-opacity cursor-pointer"
                              >
                                <IconClose size={10} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Half: Active Symbol Details Card */}
      <div className="tb-border flex min-h-0 flex-1 flex-col overflow-y-auto border-t p-3">
        {/* Title Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold tb-text-primary">
                {activeSymbol.ticker}
              </span>
              <span
                className="rounded px-1.5 py-0.2 text-[10px] font-medium tb-text-secondary"
                style={{ backgroundColor: "var(--bg-elevated)" }}
              >
                {activeSymbol.exchange}
              </span>
            </div>
            <div className="truncate text-[11px] tb-text-secondary mt-0.5">
              {activeSymbol.name}
              {activeSymbol.nameEn ? ` · ${activeSymbol.nameEn}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Add current symbol to watchlist group dropdown */}
            <div className="relative" ref={addMenuRef}>
              <button
                type="button"
                onClick={() => setAddMenuOpen((v) => !v)}
                title="将当前品种加入或移出自定义自选分组"
                className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                  activeSymbolInAnyGroup
                    ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "tb-border-subtle tb-text-primary tb-hover"
                }`}
              >
                <IconStar size={11} />
                <span>自选</span>
              </button>

              {addMenuOpen && (
                <div className="tb-elevated tb-border-subtle absolute right-0 top-[24px] z-40 w-48 rounded-md border p-2 shadow-xl">
                  <div className="mb-1.5 text-[10px] font-semibold tb-text-secondary">
                    将 {activeSymbol.ticker} 加入分组
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {groups.map((g) => {
                      const inGroup = g.symbolIds.includes(activeSymbol.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            if (inGroup) {
                              onRemoveSymbolFromGroup(g.id, activeSymbol.id);
                            } else {
                              onAddSymbolToGroup(g.id, activeSymbol.id);
                            }
                          }}
                          className="tb-hover flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[11px] tb-text-primary cursor-pointer"
                        >
                          <span className="truncate">{g.name}</span>
                          {inGroup && (
                            <IconCheck
                              size={12}
                              className="text-[var(--accent-primary)] shrink-0"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = quickNewGroupName.trim();
                      if (!trimmed) return;
                      onCreateGroup(trimmed, [activeSymbol.id]);
                      setQuickNewGroupName("");
                    }}
                    className="mt-1.5 flex items-center gap-1 border-t tb-border pt-1.5"
                  >
                    <input
                      type="text"
                      maxLength={40}
                      value={quickNewGroupName}
                      onChange={(e) => setQuickNewGroupName(e.target.value)}
                      placeholder="新建分组并加入"
                      className="tb-border-subtle min-w-0 flex-1 rounded border bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] tb-text-primary outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!quickNewGroupName.trim()}
                      className="rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] text-white disabled:opacity-45 cursor-pointer"
                    >
                      +
                    </button>
                  </form>
                </div>
              )}
            </div>

            {onOpenAlerts && (
              <button
                type="button"
                onClick={onOpenAlerts}
                title="为当前品种创建本地提醒"
                className="rounded border tb-border-subtle px-1.5 py-0.5 text-[10px] font-medium text-[var(--status-delayed)] tb-hover cursor-pointer flex items-center gap-0.5"
              >
                <IconBell size={11} />
                <span>提醒</span>
              </button>
            )}

            {onOpenFundamentals && (
              <button
                type="button"
                onClick={onOpenFundamentals}
                title="在右侧面板查看当前品种财务数据"
                className="rounded border tb-border-subtle px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-primary)] tb-hover cursor-pointer"
              >
                财务
              </button>
            )}
          </div>
        </div>

        {/* Big Price + Change */}
        <div className="mt-2 flex items-baseline gap-2 tabular-nums">
          <span className="text-[22px] font-bold tracking-tight tb-text-primary">
            {activeQuote.last.toFixed(activeSymbol.pricePrecision)}
          </span>
          <span
            className={`text-[12px] font-semibold ${isUp ? "tb-up" : "tb-down"}`}
          >
            {isUp ? "+" : ""}
            {activeQuote.change.toFixed(activeSymbol.pricePrecision)} (
            {isUp ? "+" : ""}
            {activeQuote.changePercent.toFixed(2)}%)
          </span>
          <span className="ml-auto text-[10px] tb-text-muted">
            {activeSymbol.currency}
          </span>
        </div>

        {/* Honest Provenance Strip */}
        <div
          className="mt-2 rounded border tb-border px-2 py-1.5 text-[10px] leading-snug"
          style={{ backgroundColor: "var(--bg-canvas)" }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-[var(--status-iex)]">
              {activeProvenance.badge}
            </span>
            <span className="tabular-nums tb-text-muted">
              截止 {activeQuote.updatedAt || "—"}
            </span>
          </div>
          <div className="tb-text-muted mt-0.5">{activeProvenance.provider}</div>
          <div className="tb-text-muted mt-0.5">{activeProvenance.delayNote}</div>
          {activeProvenance.dateRange && (
            <div className="tb-text-muted tabular-nums mt-0.5">
              区间：{activeProvenance.dateRange}
            </div>
          )}
        </div>

        {/* Key Stats Grid */}
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="tb-text-muted">今开</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.open.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">昨收</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.prevClose.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">最高</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.high.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="tb-text-muted">最低</span>
            <span className="tabular-nums tb-text-primary">
              {activeQuote.low.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="tb-text-muted">最新成交量</span>
            <span className="tabular-nums tb-text-primary">
              {formatVolume(activeQuote.volume)}
            </span>
          </div>
        </div>

        {/* 52-Week Range Bar */}
        <div className="mt-2.5">
          <div className="flex justify-between text-[10px] tb-text-muted tabular-nums">
            <span>
              52周低 {activeQuote.low52w.toFixed(activeSymbol.pricePrecision)}
            </span>
            <span>
              52周高 {activeQuote.high52w.toFixed(activeSymbol.pricePrecision)}
            </span>
          </div>
          <div className="relative mt-1 h-1.5 w-full rounded-full bg-[var(--bg-active)]">
            <div
              className="absolute top-0 h-1.5 rounded-full bg-[var(--accent-primary)]"
              style={{ width: `${range52wPct}%` }}
            />
          </div>
        </div>

        {/* Performance Tiles */}
        <div className="mt-3 grid grid-cols-5 gap-1">
          {perfItems.map((p) => {
            const hasVal = typeof p.value === "number";
            const pos = (p.value ?? 0) >= 0;
            return (
              <div
                key={p.label}
                className={`rounded px-1 py-1 text-center tabular-nums ${
                  hasVal
                    ? pos
                      ? "tb-up-bg"
                      : "tb-down-bg"
                    : "bg-[var(--bg-elevated)] tb-text-muted"
                }`}
              >
                <div className="text-[9px] opacity-80">{p.label}</div>
                <div className="text-[10px] font-semibold">
                  {hasVal ? `${pos ? "+" : ""}${p.value!.toFixed(1)}%` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
