"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DataProvenance,
  MarketCategory,
  ScreenerItem,
  ScreenerResponse,
} from "@trade-buddy/shared-types";
import { MARKET_GROUP_LABELS } from "@trade-buddy/shared-types";
import {
  IconClose,
  IconRefresh,
  IconScreener,
  IconSearch,
  IconSort,
} from "@trade-buddy/ui-tokens";

interface ScreenerDrawerProps {
  open: boolean;
  activeSymbolId: string;
  activePaneLabel?: string | null;
  onSelectSymbol: (symbolId: string) => void;
  onClose: () => void;
}

type SortKey =
  | "changePercent"
  | "price"
  | "volume"
  | "turnover"
  | "distMa20Pct"
  | "distMa60Pct"
  | "m1";

type MaPositionFilter = "all" | "above" | "below";

const MARKETS: MarketCategory[] = ["US", "CN", "HK", "FUTURES_INDEX"];

function formatCompactNumber(val: number): string {
  if (!val || val <= 0) return "—";
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return String(Math.round(val));
}

function parseNum(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function ProvenancePill({ provenance }: { provenance: DataProvenance }) {
  if (provenance.isProxy) {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
        style={{
          backgroundColor: "rgba(168, 85, 247, 0.16)",
          color: "var(--status-proxy)",
        }}
      >
        {provenance.isSample ? "代理 · 样本" : "ETF代理"}
      </span>
    );
  }
  if (provenance.kind === "official_fred") {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
        style={{
          backgroundColor: "rgba(56, 189, 248, 0.16)",
          color: "var(--status-iex)",
        }}
      >
        FRED 官方
      </span>
    );
  }
  if (!provenance.isSample) {
    return (
      <span
        title={provenance.delayNote}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
        style={{
          backgroundColor: "rgba(16, 185, 129, 0.16)",
          color: "var(--status-live)",
        }}
      >
        {provenance.badge}
      </span>
    );
  }
  return (
    <span
      title={provenance.delayNote}
      className="rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: "rgba(100, 116, 139, 0.22)",
        color: "var(--text-secondary)",
      }}
    >
      历史样本
    </span>
  );
}

export function ScreenerDrawer({
  open,
  activeSymbolId,
  activePaneLabel,
  onSelectSymbol,
  onClose,
}: ScreenerDrawerProps) {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter states
  const [selectedMarkets, setSelectedMarkets] = useState<MarketCategory[]>([]);
  const [keyword, setKeyword] = useState("");
  const [minChange, setMinChange] = useState("");
  const [maxChange, setMaxChange] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minVolumeWan, setMinVolumeWan] = useState("");
  const [ma20Filter, setMa20Filter] = useState<MaPositionFilter>("all");
  const [ma60Filter, setMa60Filter] = useState<MaPositionFilter>("all");

  // Sort states
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadScreener = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const url = forceRefresh ? "/api/screener?refresh=1" : "/api/screener";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ScreenerResponse;
      setData(json);
    } catch {
      setErrorMsg("获取筛选数据失败，请检查本地服务是否正常后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) {
      void loadScreener(false);
    }
  }, [open, data, loading, loadScreener]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleMarket = (m: MarketCategory) => {
    setSelectedMarkets((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]
    );
  };

  const resetFilters = () => {
    setSelectedMarkets([]);
    setKeyword("");
    setMinChange("");
    setMaxChange("");
    setMinPrice("");
    setMaxPrice("");
    setMinVolumeWan("");
    setMa20Filter("all");
    setMa60Filter("all");
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const hasActiveFilters =
    selectedMarkets.length > 0 ||
    keyword.trim() !== "" ||
    minChange.trim() !== "" ||
    maxChange.trim() !== "" ||
    minPrice.trim() !== "" ||
    maxPrice.trim() !== "" ||
    minVolumeWan.trim() !== "" ||
    ma20Filter !== "all" ||
    ma60Filter !== "all";

  const filteredAndSorted = useMemo(() => {
    const items = data?.items ?? [];
    const q = keyword.trim().toLowerCase();
    const minChg = parseNum(minChange);
    const maxChg = parseNum(maxChange);
    const minP = parseNum(minPrice);
    const maxP = parseNum(maxPrice);
    const minVolWan = parseNum(minVolumeWan);
    const minVolRaw = minVolWan !== null ? minVolWan * 10_000 : null;

    const filtered = items.filter((item) => {
      if (
        selectedMarkets.length > 0 &&
        !selectedMarkets.includes(item.symbol.market)
      ) {
        return false;
      }
      if (q) {
        const hit =
          item.symbol.ticker.toLowerCase().includes(q) ||
          item.symbol.name.toLowerCase().includes(q) ||
          (item.symbol.nameEn?.toLowerCase().includes(q) ?? false) ||
          (item.symbol.sector?.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      if (minChg !== null && (!item.hasData || item.changePercent < minChg)) {
        return false;
      }
      if (maxChg !== null && (!item.hasData || item.changePercent > maxChg)) {
        return false;
      }
      if (minP !== null && (!item.hasData || item.price < minP)) {
        return false;
      }
      if (maxP !== null && (!item.hasData || item.price > maxP)) {
        return false;
      }
      if (minVolRaw !== null && item.volume < minVolRaw) {
        return false;
      }
      if (ma20Filter === "above" && item.aboveMa20 !== true) return false;
      if (ma20Filter === "below" && item.aboveMa20 !== false) return false;
      if (ma60Filter === "above" && item.aboveMa60 !== true) return false;
      if (ma60Filter === "below" && item.aboveMa60 !== false) return false;
      return true;
    });

    const getVal = (item: ScreenerItem, key: SortKey): number => {
      if (!item.hasData) return Number.NEGATIVE_INFINITY;
      switch (key) {
        case "changePercent":
          return item.changePercent;
        case "price":
          return item.price;
        case "volume":
          return item.volume;
        case "turnover":
          return item.turnover;
        case "distMa20Pct":
          return item.distMa20Pct ?? Number.NEGATIVE_INFINITY;
        case "distMa60Pct":
          return item.distMa60Pct ?? Number.NEGATIVE_INFINITY;
        case "m1":
          return item.perf.m1 ?? Number.NEGATIVE_INFINITY;
      }
    };

    return [...filtered].sort((a, b) => {
      const va = getVal(a, sortKey);
      const vb = getVal(b, sortKey);
      if (va === vb) return a.symbol.ticker.localeCompare(b.symbol.ticker);
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [
    data,
    selectedMarkets,
    keyword,
    minChange,
    maxChange,
    minPrice,
    maxPrice,
    minVolumeWan,
    ma20Filter,
    ma60Filter,
    sortKey,
    sortDir,
  ]);

  if (!open) return null;

  const renderSortHeader = (label: string, key: SortKey) => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`inline-flex items-center justify-end gap-0.5 font-medium transition-colors cursor-pointer ${
          active
            ? "text-[var(--accent-primary)]"
            : "tb-text-muted hover:text-[var(--text-primary)]"
        }`}
      >
        <span>{label}</span>
        <IconSort size={11} className={active ? "opacity-100" : "opacity-45"} />
        {active && (
          <span className="text-[9px]">{sortDir === "desc" ? "↓" : "↑"}</span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        aria-label="选股筛选器"
        className="tb-panel tb-border flex h-full w-[94vw] max-w-[1040px] flex-col border-l shadow-2xl"
      >
        {/* Top Header */}
        <div className="tb-border flex h-[46px] shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2 min-w-0">
            <IconScreener size={16} className="text-[var(--accent-primary)] shrink-0" />
            <h2 className="text-[14px] font-semibold tb-text-primary">
              选股筛选器
            </h2>
            <span className="rounded bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] tb-text-secondary tabular-nums">
              匹配 {filteredAndSorted.length} / {data?.total ?? 0} 品种
            </span>
            {activePaneLabel && (
              <span
                className="hidden sm:inline rounded px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent-primary)",
                }}
              >
                点击行将切换活动图 {activePaneLabel}（不误改已解除品种联动的其它图）
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadScreener(true)}
              disabled={loading}
              className="tb-hover tb-border-subtle flex items-center gap-1 rounded border px-2 py-1 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
            >
              <IconRefresh
                size={13}
                className={loading ? "animate-spin" : undefined}
              />
              <span>刷新指标</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="关闭筛选器 (Esc)"
              className="tb-hover flex h-7 w-7 items-center justify-center rounded tb-text-secondary hover:text-[var(--text-primary)] cursor-pointer"
            >
              <IconClose size={16} />
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="tb-border shrink-0 space-y-2.5 border-b bg-[var(--bg-canvas)] px-4 py-3 text-[11px]">
          {/* Row 1: Market Pills + Keyword + Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tb-text-muted mr-1">市场：</span>
              <button
                type="button"
                onClick={() => setSelectedMarkets([])}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedMarkets.length === 0
                    ? "bg-[var(--accent-primary)] text-white"
                    : "tb-elevated tb-text-secondary tb-hover"
                }`}
              >
                全部市场
              </button>
              {MARKETS.map((m) => {
                const active = selectedMarkets.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMarket(m)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] ring-1 ring-inset ring-[var(--accent-primary)]"
                        : "tb-elevated tb-text-secondary tb-hover"
                    }`}
                  >
                    {MARKET_GROUP_LABELS[m]}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <IconSearch
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 tb-text-muted"
                />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="代码 / 名称 / 行业..."
                  className="tb-border-subtle w-44 rounded border bg-[var(--bg-input)] py-1 pl-7 pr-2 text-[11px] tb-text-primary outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded border tb-border-subtle px-2 py-1 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] tb-hover cursor-pointer"
                >
                  重置条件
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Numeric Ranges & MA Position */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {/* Change % Range */}
            <div className="flex items-center gap-1 rounded border tb-border bg-[var(--bg-panel)] px-2 py-1">
              <span className="shrink-0 tb-text-muted">涨跌幅%</span>
              <input
                type="number"
                step="0.5"
                value={minChange}
                onChange={(e) => setMinChange(e.target.value)}
                placeholder="最低"
                className="w-full min-w-0 bg-transparent text-right tabular-nums tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
              />
              <span className="tb-text-muted">~</span>
              <input
                type="number"
                step="0.5"
                value={maxChange}
                onChange={(e) => setMaxChange(e.target.value)}
                placeholder="最高"
                className="w-full min-w-0 bg-transparent text-right tabular-nums tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* Price Range */}
            <div className="flex items-center gap-1 rounded border tb-border bg-[var(--bg-panel)] px-2 py-1">
              <span className="shrink-0 tb-text-muted">价格</span>
              <input
                type="number"
                step="1"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="最低"
                className="w-full min-w-0 bg-transparent text-right tabular-nums tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
              />
              <span className="tb-text-muted">~</span>
              <input
                type="number"
                step="1"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="最高"
                className="w-full min-w-0 bg-transparent text-right tabular-nums tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* Volume Min (万) */}
            <div className="flex items-center gap-1 rounded border tb-border bg-[var(--bg-panel)] px-2 py-1">
              <span className="shrink-0 tb-text-muted">成交量≥</span>
              <input
                type="number"
                min="0"
                step="100"
                value={minVolumeWan}
                onChange={(e) => setMinVolumeWan(e.target.value)}
                placeholder="不限"
                className="w-full min-w-0 bg-transparent text-right tabular-nums tb-text-primary outline-none placeholder:text-[var(--text-muted)]"
              />
              <span className="shrink-0 tb-text-muted">万</span>
            </div>

            {/* MA20 Position */}
            <div className="flex items-center justify-between gap-1 rounded border tb-border bg-[var(--bg-panel)] px-2 py-1">
              <span className="shrink-0 tb-text-muted">MA20</span>
              <select
                value={ma20Filter}
                onChange={(e) =>
                  setMa20Filter(e.target.value as MaPositionFilter)
                }
                className="min-w-0 bg-transparent text-right font-medium tb-text-primary outline-none cursor-pointer"
              >
                <option value="all" className="bg-[var(--bg-elevated)]">
                  不限
                </option>
                <option value="above" className="bg-[var(--bg-elevated)]">
                  现价在 MA20 之上
                </option>
                <option value="below" className="bg-[var(--bg-elevated)]">
                  现价在 MA20 之下
                </option>
              </select>
            </div>

            {/* MA60 Position */}
            <div className="flex items-center justify-between gap-1 rounded border tb-border bg-[var(--bg-panel)] px-2 py-1">
              <span className="shrink-0 tb-text-muted">MA60</span>
              <select
                value={ma60Filter}
                onChange={(e) =>
                  setMa60Filter(e.target.value as MaPositionFilter)
                }
                className="min-w-0 bg-transparent text-right font-medium tb-text-primary outline-none cursor-pointer"
              >
                <option value="all" className="bg-[var(--bg-elevated)]">
                  不限
                </option>
                <option value="above" className="bg-[var(--bg-elevated)]">
                  现价在 MA60 之上
                </option>
                <option value="below" className="bg-[var(--bg-elevated)]">
                  现价在 MA60 之下
                </option>
              </select>
            </div>
          </div>

          {data?.note && (
            <div className="flex items-center justify-between text-[10px] tb-text-muted">
              <span>{data.note}</span>
              <span className="tabular-nums shrink-0 ml-2">
                {data.cached ? "已命中缓存 · " : ""}
                点击任意行可切换活动图
              </span>
            </div>
          )}
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          {loading && !data ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-10 animate-pulse rounded bg-[var(--bg-elevated)]"
                />
              ))}
            </div>
          ) : errorMsg ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="text-[13px] font-semibold tb-text-primary">
                加载筛选器数据失败
              </div>
              <p className="mt-1.5 text-[12px] tb-text-muted">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void loadScreener(true)}
                className="mt-3 rounded bg-[var(--accent-primary)] px-3.5 py-1.5 text-[12px] font-medium text-white cursor-pointer"
              >
                重试加载
              </button>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="text-[13px] font-semibold tb-text-primary">
                当前筛选条件无匹配品种
              </div>
              <p className="mt-1.5 max-w-md text-[12px] leading-relaxed tb-text-muted">
                请放宽涨跌幅、价格、成交量下限或均线位置条件，或切换市场分组后重试。无 Key 时基于内置目录样本与 FRED 官方指数筛选。
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 rounded bg-[var(--accent-primary)] px-3.5 py-1.5 text-[12px] font-medium text-white cursor-pointer"
              >
                重置全部筛选条件
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 tb-panel tb-border border-b text-[11px]">
                <tr>
                  <th className="px-3 py-2 font-medium tb-text-muted">
                    品种 / 市场
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("最新价", "price")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("涨跌幅", "changePercent")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("成交量", "volume")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("估算成交额", "turnover")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("MA20 位置", "distMa20Pct")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("MA60 位置", "distMa60Pct")}
                  </th>
                  <th className="px-2.5 py-2 text-right">
                    {renderSortHeader("近1月", "m1")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium tb-text-muted">
                    数据来源
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredAndSorted.map((item) => {
                  const isCurrent = item.symbol.id === activeSymbolId;
                  const isUp = item.changePercent >= 0;
                  const prec = item.symbol.pricePrecision;
                  return (
                    <tr
                      key={item.symbol.id}
                      onClick={() => {
                        onSelectSymbol(item.symbol.id);
                        onClose();
                      }}
                      className={`cursor-pointer transition-colors ${
                        isCurrent
                          ? "bg-[var(--accent-soft)]"
                          : "tb-hover"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold tb-text-primary">
                            {item.symbol.ticker}
                          </span>
                          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.2 text-[10px] tb-text-secondary">
                            {MARKET_GROUP_LABELS[item.symbol.market]}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-medium text-[var(--accent-primary)]">
                              当前
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] tb-text-muted truncate max-w-[190px]">
                          {item.symbol.name}
                          {item.symbol.sector ? ` · ${item.symbol.sector}` : ""}
                        </div>
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums font-medium tb-text-primary">
                        {item.hasData ? (
                          <div>
                            <div>{item.price.toFixed(prec)}</div>
                            <div className="text-[10px] tb-text-muted">
                              {item.symbol.currency}
                            </div>
                          </div>
                        ) : (
                          <span className="tb-text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums">
                        {item.hasData ? (
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 font-semibold ${
                              isUp ? "tb-up-bg" : "tb-down-bg"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {item.changePercent.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-[11px] tb-text-muted">待在线拉取</span>
                        )}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums tb-text-primary">
                        {formatCompactNumber(item.volume)}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums tb-text-secondary">
                        {item.turnover > 0
                          ? formatCompactNumber(item.turnover)
                          : "—"}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums">
                        {item.ma20 !== null && item.distMa20Pct !== null ? (
                          <div>
                            <div
                              className={`text-[11px] font-semibold ${
                                item.aboveMa20 ? "tb-up" : "tb-down"
                              }`}
                            >
                              {item.aboveMa20 ? "站上" : "跌破"}{" "}
                              {item.distMa20Pct >= 0 ? "+" : ""}
                              {item.distMa20Pct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] tb-text-muted">
                              {item.ma20.toFixed(prec)}
                            </div>
                          </div>
                        ) : (
                          <span className="tb-text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums">
                        {item.ma60 !== null && item.distMa60Pct !== null ? (
                          <div>
                            <div
                              className={`text-[11px] font-semibold ${
                                item.aboveMa60 ? "tb-up" : "tb-down"
                              }`}
                            >
                              {item.aboveMa60 ? "站上" : "跌破"}{" "}
                              {item.distMa60Pct >= 0 ? "+" : ""}
                              {item.distMa60Pct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] tb-text-muted">
                              {item.ma60.toFixed(prec)}
                            </div>
                          </div>
                        ) : (
                          <span className="tb-text-muted">—</span>
                        )}
                      </td>

                      <td className="px-2.5 py-2 text-right tabular-nums">
                        {typeof item.perf.m1 === "number" ? (
                          <span
                            className={`font-medium ${
                              item.perf.m1 >= 0 ? "tb-up" : "tb-down"
                            }`}
                          >
                            {item.perf.m1 >= 0 ? "+" : ""}
                            {item.perf.m1.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="tb-text-muted">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <ProvenancePill provenance={item.provenance} />
                          <span className="text-[10px] tabular-nums tb-text-muted">
                            {item.updatedAt || "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
