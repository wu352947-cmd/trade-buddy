"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  FundamentalPeriodRow,
  FundamentalPeriodType,
  FundamentalsResponse,
  SymbolMeta,
} from "@trade-buddy/shared-types";
import { IconExternalLink, IconRefresh } from "@trade-buddy/ui-tokens";

interface FundamentalsPanelProps {
  symbol: SymbolMeta;
  onSelectSymbol?: (symbolId: string) => void;
}

type ChartMetricKey = "revenue" | "netIncome" | "epsDiluted" | "totalAssets";

const METRIC_LABELS: Record<ChartMetricKey, string> = {
  revenue: "营收",
  netIncome: "净利润",
  epsDiluted: "稀释 EPS",
  totalAssets: "总资产",
};

function formatFinancialAmount(
  val: number | null | undefined,
  currency: string
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : "";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${prefix}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}${prefix}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

function formatEps(val: number | null | undefined, currency: string): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "—";
  const prefix = currency === "USD" ? "$" : currency === "CNY" ? "¥" : "";
  return `${val < 0 ? "-" : ""}${prefix}${Math.abs(val).toFixed(2)}`;
}

export function FundamentalsPanel({
  symbol,
  onSelectSymbol,
}: FundamentalsPanelProps) {
  const [data, setData] = useState<FundamentalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<FundamentalPeriodType>("annual");
  const [chartMetric, setChartMetric] = useState<ChartMetricKey>("revenue");

  const loadFundamentals = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setNetworkError(null);
      try {
        const params = new URLSearchParams({ symbol: symbol.id });
        if (forceRefresh) params.set("refresh", "1");
        const res = await fetch(`/api/fundamentals?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as FundamentalsResponse;
        setData(json);
        if (json.annual.length === 0 && json.quarterly.length > 0) {
          setPeriodType("quarterly");
        }
      } catch {
        setNetworkError("请求本地财务数据接口失败，请检查服务是否正常运行后重试。");
      } finally {
        setLoading(false);
      }
    },
    [symbol.id]
  );

  useEffect(() => {
    void loadFundamentals(false);
  }, [loadFundamentals]);

  const rows: FundamentalPeriodRow[] = useMemo(() => {
    if (!data) return [];
    return periodType === "annual" ? data.annual : data.quarterly;
  }, [data, periodType]);

  // Chronological (oldest -> newest) for mini bar chart
  const chartPoints = useMemo(() => {
    const chrono = [...rows].reverse();
    const values = chrono
      .map((r) => r[chartMetric])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const maxAbs = values.length > 0 ? Math.max(...values.map((v) => Math.abs(v)), 1e-6) : 1;
    return { chrono, maxAbs, hasAny: values.length > 0 };
  }, [rows, chartMetric]);

  const currency = data?.currency ?? symbol.currency;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="tb-border flex h-[36px] shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-semibold tb-text-primary">
            财务数据
          </span>
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.2 text-[10px] font-medium tb-text-secondary truncate">
            {symbol.ticker}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void loadFundamentals(true)}
          disabled={loading}
          title="刷新财务数据"
          className="tb-hover flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tb-text-secondary hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
        >
          <IconRefresh
            size={13}
            className={loading ? "animate-spin" : undefined}
          />
          <span>刷新</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (!data || data.symbol.id !== symbol.id) ? (
          <div className="space-y-2.5">
            <div className="h-14 animate-pulse rounded bg-[var(--bg-elevated)]" />
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-14 animate-pulse rounded bg-[var(--bg-elevated)]"
                />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded bg-[var(--bg-elevated)]" />
          </div>
        ) : networkError ? (
          <div className="flex flex-col items-center justify-center rounded border tb-border bg-[var(--bg-canvas)] p-5 text-center">
            <div className="text-[12px] font-semibold tb-text-primary">
              加载财务数据失败
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {networkError}
            </p>
            <button
              type="button"
              onClick={() => void loadFundamentals(true)}
              className="mt-3 rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : !data ? null : data.mode === "unsupported" ? (
          <div className="flex flex-col items-center justify-center rounded border tb-border bg-[var(--bg-canvas)] p-4 text-center">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: "var(--bg-elevated)",
                color: "var(--text-secondary)",
              }}
            >
              {data.sourceBadge}
            </span>
            <div className="mt-2 text-[12px] font-semibold tb-text-primary">
              {symbol.ticker} · {symbol.name} 暂无可用财务报表
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {data.emptyHint ||
                "无 key 时财务数据目前仅支持美股 SEC 公开 companyfacts；可在设置中配置可选 key。"}
            </p>

            {onSelectSymbol && (
              <div className="mt-3 w-full space-y-1.5 border-t tb-border pt-3">
                <div className="text-[10px] tb-text-muted">
                  快速切换至免 Key 美股查看 SEC EDGAR 财报：
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {["US:AAPL", "US:MSFT", "US:TSLA", "US:AMZN"].map((sid) => (
                    <button
                      key={sid}
                      type="button"
                      onClick={() => onSelectSymbol(sid)}
                      className="rounded border tb-border-subtle bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium tb-text-primary tb-hover cursor-pointer"
                    >
                      {sid.replace("US:", "")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/settings"
              className="mt-3 inline-flex items-center gap-1 rounded border tb-border-subtle px-2.5 py-1 text-[11px] text-[var(--accent-primary)] tb-hover"
            >
              <span>前往设置页查看数据源状态</span>
            </Link>
          </div>
        ) : data.mode === "error" ? (
          <div className="flex flex-col items-center justify-center rounded border tb-border bg-[var(--bg-canvas)] p-4 text-center">
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.16)",
                color: "var(--status-delayed)",
              }}
            >
              {data.sourceBadge}
            </span>
            <div className="mt-2 text-[12px] font-semibold tb-text-primary">
              获取 SEC EDGAR 财务数据暂未成功
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed tb-text-muted">
              {data.errorMessage || "请求 SEC 官方 companyfacts 接口失败，请稍后重试。"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadFundamentals(true)}
                className="rounded bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-medium text-white cursor-pointer"
              >
                重试加载
              </button>
              {data.secBrowseUrl && (
                <a
                  href={data.secBrowseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border tb-border-subtle px-2.5 py-1 text-[11px] tb-text-secondary tb-hover"
                >
                  <span>SEC 官网</span>
                  <IconExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Provenance & Unit Strip */}
            <div className="rounded border tb-border bg-[var(--bg-canvas)] px-2.5 py-2 text-[10px] leading-snug">
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent-primary)",
                  }}
                >
                  {data.sourceBadge}
                </span>
                {data.secBrowseUrl && (
                  <a
                    href={data.secBrowseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[var(--accent-primary)] hover:underline"
                  >
                    <span>CIK {data.cik}</span>
                    <IconExternalLink size={10} />
                  </a>
                )}
              </div>
              {data.entityName && (
                <div className="mt-1 font-medium tb-text-primary truncate">
                  {data.entityName}
                </div>
              )}
              <div className="mt-0.5 tb-text-muted">{data.unitNote}</div>
              {data.warning && (
                <div
                  className="mt-1 font-medium"
                  style={{ color: "var(--status-delayed)" }}
                >
                  {data.warning}
                </div>
              )}
            </div>

            {/* Key Summary Cards */}
            {data.summary && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[10px] tb-text-muted">
                  <span>关键财务指标（最新 {data.summary.latestPeriodLabel}）</span>
                  <span className="tabular-nums">截止 {data.summary.latestEndDate}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">营业收入</div>
                    <div className="mt-0.5 text-[13px] font-bold tabular-nums tb-text-primary">
                      {formatFinancialAmount(data.summary.revenue, currency)}
                    </div>
                    {data.summary.revenueYoYPct !== null && (
                      <div
                        className={`text-[10px] tabular-nums ${
                          data.summary.revenueYoYPct >= 0 ? "tb-up" : "tb-down"
                        }`}
                      >
                        同比 {data.summary.revenueYoYPct >= 0 ? "+" : ""}
                        {data.summary.revenueYoYPct.toFixed(1)}%
                      </div>
                    )}
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">净利润</div>
                    <div className="mt-0.5 text-[13px] font-bold tabular-nums tb-text-primary">
                      {formatFinancialAmount(data.summary.netIncome, currency)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] tabular-nums tb-text-muted">
                      {data.summary.netMarginPct !== null && (
                        <span>净利率 {data.summary.netMarginPct.toFixed(1)}%</span>
                      )}
                      {data.summary.netIncomeYoYPct !== null && (
                        <span
                          className={
                            data.summary.netIncomeYoYPct >= 0 ? "tb-up" : "tb-down"
                          }
                        >
                          {data.summary.netIncomeYoYPct >= 0 ? "+" : ""}
                          {data.summary.netIncomeYoYPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">稀释 EPS</div>
                    <div className="mt-0.5 text-[13px] font-bold tabular-nums tb-text-primary">
                      {formatEps(data.summary.epsDiluted, currency)}
                    </div>
                    <div className="text-[10px] tb-text-muted">{currency}/股</div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">总资产</div>
                    <div className="mt-0.5 text-[13px] font-bold tabular-nums tb-text-primary">
                      {formatFinancialAmount(data.summary.totalAssets, currency)}
                    </div>
                    {data.summary.debtToAssetPct !== null && (
                      <div className="text-[10px] tabular-nums tb-text-muted">
                        负债率 {data.summary.debtToAssetPct.toFixed(1)}%
                      </div>
                    )}
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">总负债</div>
                    <div className="mt-0.5 text-[12px] font-semibold tabular-nums tb-text-primary">
                      {formatFinancialAmount(data.summary.totalLiabilities, currency)}
                    </div>
                  </div>

                  <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2">
                    <div className="text-[10px] tb-text-muted">股东权益</div>
                    <div className="mt-0.5 text-[12px] font-semibold tabular-nums tb-text-primary">
                      {formatFinancialAmount(data.summary.stockholdersEquity, currency)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Period Toggle */}
            <div
              className="grid grid-cols-2 rounded p-0.5 text-[11px] font-medium"
              style={{ backgroundColor: "var(--bg-canvas)" }}
            >
              <button
                type="button"
                onClick={() => setPeriodType("annual")}
                className={`rounded py-1 transition-colors cursor-pointer ${
                  periodType === "annual"
                    ? "bg-[var(--bg-active)] tb-text-primary"
                    : "tb-text-secondary hover:text-[var(--text-primary)]"
                }`}
              >
                年报（10-K · {data.annual.length}）
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("quarterly")}
                className={`rounded py-1 transition-colors cursor-pointer ${
                  periodType === "quarterly"
                    ? "bg-[var(--bg-active)] tb-text-primary"
                    : "tb-text-secondary hover:text-[var(--text-primary)]"
                }`}
              >
                季报（10-Q · {data.quarterly.length}）
              </button>
            </div>

            {/* Historical Mini Bar Chart */}
            {chartPoints.hasAny && (
              <div className="rounded border tb-border bg-[var(--bg-canvas)] p-2.5">
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[10px] font-semibold tb-text-secondary">
                    历史趋势（{periodType === "annual" ? "年报" : "单季"}）
                  </span>
                  <div className="flex items-center gap-0.5">
                    {(
                      ["revenue", "netIncome", "epsDiluted", "totalAssets"] as ChartMetricKey[]
                    ).map((mKey) => (
                      <button
                        key={mKey}
                        type="button"
                        onClick={() => setChartMetric(mKey)}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors cursor-pointer ${
                          chartMetric === mKey
                            ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                            : "tb-text-muted tb-hover"
                        }`}
                      >
                        {METRIC_LABELS[mKey]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex h-[96px] items-end gap-1.5 pt-3">
                  {chartPoints.chrono.map((r) => {
                    const val = r[chartMetric];
                    const hasVal = typeof val === "number" && Number.isFinite(val);
                    const pct = hasVal
                      ? Math.max(8, Math.round((Math.abs(val) / chartPoints.maxAbs) * 100))
                      : 0;
                    const neg = hasVal && val < 0;
                    const displayVal =
                      chartMetric === "epsDiluted"
                        ? formatEps(val, currency)
                        : formatFinancialAmount(val, currency);

                    return (
                      <div
                        key={r.periodKey}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end h-full"
                        title={`${r.label} (${r.endDate}): ${displayVal}`}
                      >
                        <div className="mb-1 text-[9px] tabular-nums tb-text-muted truncate max-w-full">
                          {hasVal ? displayVal : "—"}
                        </div>
                        <div className="flex w-full flex-1 items-end justify-center">
                          {hasVal ? (
                            <div
                              className="w-full max-w-[26px] rounded-t transition-all"
                              style={{
                                height: `${pct}%`,
                                backgroundColor: neg
                                  ? "var(--market-down)"
                                  : "var(--accent-primary)",
                                opacity: 0.88,
                              }}
                            />
                          ) : (
                            <div className="h-1 w-4 rounded bg-[var(--bg-active)]" />
                          )}
                        </div>
                        <div className="mt-1 text-[9px] tabular-nums tb-text-secondary truncate max-w-full">
                          {r.label.replace(/^20/, "")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historical Table */}
            <div className="rounded border tb-border bg-[var(--bg-canvas)] overflow-hidden">
              <div className="tb-border flex items-center justify-between border-b px-2.5 py-1.5 text-[10px]">
                <span className="font-semibold tb-text-secondary">
                  历史财务明细（{periodType === "annual" ? "年报" : "季报"}）
                </span>
                <span className="tb-text-muted">单位：{currency} · 来源 {data.source}</span>
              </div>

              {rows.length === 0 ? (
                <div className="p-4 text-center text-[11px] tb-text-muted">
                  该报告口径暂无解析记录，可切换年报/季报查看。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[410px] border-collapse text-[10px] tabular-nums">
                    <thead className="tb-border border-b tb-text-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">期间</th>
                        <th className="px-1.5 py-1.5 text-right font-medium">营收</th>
                        <th className="px-1.5 py-1.5 text-right font-medium">净利润</th>
                        <th className="px-1.5 py-1.5 text-right font-medium">EPS</th>
                        <th className="px-1.5 py-1.5 text-right font-medium">总资产</th>
                        <th className="px-2 py-1.5 text-right font-medium">总负债</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)]">
                      {rows.map((r) => (
                        <tr key={r.periodKey} className="tb-hover">
                          <td className="px-2 py-1.5 text-left">
                            <div className="font-semibold tb-text-primary">
                              {r.label}
                            </div>
                            <div className="text-[9px] tb-text-muted">
                              {r.form} · {r.endDate}
                            </div>
                          </td>
                          <td className="px-1.5 py-1.5 text-right tb-text-primary">
                            {formatFinancialAmount(r.revenue, currency)}
                          </td>
                          <td
                            className={`px-1.5 py-1.5 text-right font-medium ${
                              r.netIncome !== null && r.netIncome < 0
                                ? "tb-down"
                                : "tb-text-primary"
                            }`}
                          >
                            {formatFinancialAmount(r.netIncome, currency)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right tb-text-primary">
                            {formatEps(r.epsDiluted, currency)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right tb-text-secondary">
                            {formatFinancialAmount(r.totalAssets, currency)}
                          </td>
                          <td className="px-2 py-1.5 text-right tb-text-secondary">
                            {formatFinancialAmount(r.totalLiabilities, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
