"use client";

import React, { useCallback, useEffect, useState } from "react";
import type {
  NewsResponse,
  NewsScope,
  SymbolMeta,
} from "@trade-buddy/shared-types";
import { IconExternalLink, IconRefresh } from "@trade-buddy/ui-tokens";

interface NewsFlowPanelProps {
  symbol: SymbolMeta;
}

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const diffMin = Math.floor((Date.now() - ts) / 60_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return new Date(ts).toISOString().slice(0, 10);
}

export function NewsFlowPanel({ symbol }: NewsFlowPanelProps) {
  const [scope, setScope] = useState<NewsScope>(
    symbol.market === "CN" || symbol.market === "HK" ? "market" : "symbol"
  );
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadNews = useCallback(
    async (targetScope: NewsScope, forceRefresh = false) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({
          scope: targetScope,
          symbol: symbol.id,
        });
        if (forceRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/news?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as NewsResponse;
        setData(json);
      } catch {
        setErrorMsg("请求本地资讯接口失败，请检查服务是否运行后点击重试。");
      } finally {
        setLoading(false);
      }
    },
    [symbol.id]
  );

  useEffect(() => {
    void loadNews(scope, false);
  }, [scope, symbol.id, loadNews]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="tb-border flex h-[36px] shrink-0 items-center justify-between border-b px-3">
        <span className="text-[12px] font-semibold tb-text-primary">
          财经资讯流
        </span>
        <button
          type="button"
          onClick={() => void loadNews(scope, true)}
          disabled={loading}
          title="手动刷新资讯"
          className="tb-hover flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
        >
          <IconRefresh
            size={13}
            className={loading ? "animate-spin" : undefined}
          />
          <span>刷新</span>
        </button>
      </div>

      {/* Scope Toggle */}
      <div className="tb-border shrink-0 border-b px-2.5 py-2">
        <div
          className="grid grid-cols-2 rounded p-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--bg-canvas)" }}
        >
          <button
            type="button"
            onClick={() => setScope("symbol")}
            className={`rounded py-1 transition-colors truncate px-1.5 cursor-pointer ${
              scope === "symbol"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            当前品种 ({symbol.ticker})
          </button>
          <button
            type="button"
            onClick={() => setScope("market")}
            className={`rounded py-1 transition-colors px-1.5 cursor-pointer ${
              scope === "market"
                ? "bg-[var(--bg-active)] tb-text-primary"
                : "tb-text-secondary hover:text-[var(--text-primary)]"
            }`}
          >
            全市场 / 宏观
          </button>
        </div>

        {/* Source & Delay Note */}
        {data && (
          <div className="mt-2 rounded border tb-border bg-[var(--bg-canvas)] px-2 py-1.5 text-[10px] leading-snug">
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

      {/* Body */}
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
              加载资讯失败
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {errorMsg}
            </p>
            <button
              type="button"
              onClick={() => void loadNews(scope, true)}
              className="mt-3 rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-5 text-center">
            <div className="text-[12px] font-semibold tb-text-primary">
              暂无可展示的资讯条目
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {data?.emptyHint ||
                "未获取到合规公开源资讯，请检查网络或配置可选 API Key。"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {scope === "symbol" && (
                <button
                  type="button"
                  onClick={() => setScope("market")}
                  className="rounded border tb-border-subtle px-2.5 py-1 text-[11px] tb-text-primary tb-hover cursor-pointer"
                >
                  查看全市场/宏观
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadNews(scope, true)}
                className="rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
              >
                重试刷新
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-hairline)]">
            {data.items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tb-hover group block px-3 py-2.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="shrink-0 rounded px-1.5 py-0.2 font-semibold"
                      style={{
                        backgroundColor: "var(--bg-active)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {item.sourceBadge}
                    </span>
                    {item.category && (
                      <span className="truncate tb-text-muted">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums tb-text-muted">
                    {formatRelativeTime(item.publishedAt)}
                  </span>
                </div>

                <div className="mt-1 flex items-start justify-between gap-1.5">
                  <h4 className="text-[12px] font-medium leading-snug tb-text-primary group-hover:text-[var(--accent-primary)] transition-colors">
                    {item.title}
                  </h4>
                  <IconExternalLink
                    size={12}
                    className="mt-0.5 shrink-0 tb-text-muted group-hover:text-[var(--accent-primary)]"
                  />
                </div>

                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] tb-text-muted">
                  <span className="truncate">{item.source}</span>
                  {item.relatedSymbols && item.relatedSymbols.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {item.relatedSymbols.slice(0, 3).map((sym) => (
                        <span
                          key={sym}
                          className="rounded bg-[var(--bg-canvas)] px-1 text-[9px] tb-text-secondary"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
