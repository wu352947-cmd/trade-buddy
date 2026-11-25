"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  ColorScheme,
  DataSourceHealthItem,
  DataSourcesHealthResponse,
  MarketCategory,
  ThemeMode,
  UserPreferences,
} from "@trade-buddy/shared-types";
import {
  DEFAULT_USER_PREFERENCES,
  MARKET_GROUP_LABELS,
} from "@trade-buddy/shared-types";
import {
  IconArrowLeft,
  IconMoon,
  IconRefresh,
  IconSettings,
  IconShield,
  IconSun,
  TradeBuddyLogo,
} from "@trade-buddy/ui-tokens";

import {
  applyDocumentPreferences,
  DEFAULT_SYMBOL_BY_MARKET,
  loadUserPreferences,
  patchUserPreferences,
} from "@/lib/preferences";

interface SettingsViewProps {
  initialHealth: DataSourcesHealthResponse;
}

const MARKET_OPTIONS: Array<{
  id: MarketCategory;
  label: string;
  defaultTicker: string;
}> = [
  { id: "US", label: MARKET_GROUP_LABELS.US, defaultTicker: "AAPL" },
  { id: "CN", label: MARKET_GROUP_LABELS.CN, defaultTicker: "600519 贵州茅台" },
  { id: "HK", label: MARKET_GROUP_LABELS.HK, defaultTicker: "00700 腾讯控股" },
  {
    id: "FUTURES_INDEX",
    label: MARKET_GROUP_LABELS.FUTURES_INDEX,
    defaultTicker: "QQQ / SP500",
  },
];

function StatusBadge({ item }: { item: DataSourceHealthItem }) {
  if (item.status === "online") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          backgroundColor: "rgba(16, 185, 129, 0.16)",
          color: "var(--status-live)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--status-live)" }}
        />
        在线{item.latencyMs ? ` (${item.latencyMs}ms)` : ""}
      </span>
    );
  }
  if (item.status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          backgroundColor: "rgba(242, 72, 91, 0.16)",
          color: "var(--market-down)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--market-down)" }}
        />
        最近失败
      </span>
    );
  }
  if (item.status === "disabled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium tb-text-muted">
        已关闭
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium tb-text-secondary">
      未知 / 未检测
    </span>
  );
}

function ConfigBadge({ item }: { item: DataSourceHealthItem }) {
  if (!item.requiresKey && item.category === "public") {
    return (
      <span
        className="rounded px-2 py-0.5 text-[11px] font-medium"
        style={{
          backgroundColor: item.enabled
            ? "rgba(56, 189, 248, 0.14)"
            : "var(--bg-elevated)",
          color: item.enabled ? "var(--status-iex)" : "var(--text-muted)",
        }}
      >
        {item.configLabel}
      </span>
    );
  }
  if (item.configured) {
    return (
      <span
        className="rounded px-2 py-0.5 text-[11px] font-semibold"
        style={{
          backgroundColor: "rgba(16, 185, 129, 0.16)",
          color: "var(--status-live)",
        }}
      >
        {item.configLabel}
      </span>
    );
  }
  return (
    <span className="rounded bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium tb-text-muted">
      {item.configLabel}
    </span>
  );
}

export function SettingsView({ initialHealth }: SettingsViewProps) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [health, setHealth] = useState<DataSourcesHealthResponse>(initialHealth);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadUserPreferences();
    setPrefs(loaded);
    applyDocumentPreferences(loaded);
    setHydrated(true);
  }, []);

  const updatePref = useCallback((patch: Partial<UserPreferences>, label: string) => {
    const next = patchUserPreferences(patch);
    setPrefs(next);
    setSavedToast(`已保存：${label}`);
    window.setTimeout(() => {
      setSavedToast((prev) => (prev === `已保存：${label}` ? null : prev));
    }, 2200);
  }, []);

  const handleProbeSources = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const res = await fetch("/api/health/sources?probe=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DataSourcesHealthResponse;
      setHealth(json);
    } catch {
      setProbeError("探测接口调用失败，请确认本地 Next.js 服务正在运行。");
    } finally {
      setProbing(false);
    }
  }, []);

  const handleTheme = (theme: ThemeMode) =>
    updatePref({ theme }, theme === "dark" ? "深色主题" : "浅色主题");

  const handleColorScheme = (colorScheme: ColorScheme) =>
    updatePref(
      { colorScheme },
      colorScheme === "intl" ? "绿涨红跌（国际）" : "红涨绿跌（A 股）"
    );

  const handleDefaultMarket = (defaultMarket: MarketCategory) =>
    updatePref(
      { defaultMarket },
      `默认市场 · ${MARKET_GROUP_LABELS[defaultMarket]}`
    );

  return (
    <div className="tb-canvas h-screen w-screen overflow-y-auto select-text">
      {/* Top Bar */}
      <header className="tb-panel tb-border sticky top-0 z-20 flex h-[48px] items-center justify-between border-b px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="tb-hover tb-border-subtle flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12px] font-medium tb-text-primary transition-colors"
          >
            <IconArrowLeft size={14} />
            <span>返回看盘终端</span>
          </Link>
          <div className="h-4 w-px bg-[var(--border-hairline)]" />
          <div className="flex items-center gap-2">
            <TradeBuddyLogo size={20} />
            <IconSettings size={15} className="text-[var(--accent-primary)]" />
            <h1 className="text-[14px] font-semibold tb-text-primary">
              Trade Buddy 设置
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedToast && (
            <span
              className="rounded px-2.5 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: "var(--accent-soft)",
                color: "var(--accent-primary)",
              }}
            >
              {savedToast}
            </span>
          )}
          <div
            className="hidden sm:flex items-center gap-1 rounded px-2.5 py-1 text-[11px] tb-text-secondary"
            style={{ backgroundColor: "var(--bg-elevated)" }}
          >
            <IconShield size={13} className="text-[#16B981]" />
            <span>仅研究与虚拟模拟 · 无实盘</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[960px] space-y-6 px-4 py-6 md:px-6">
        {/* Section 1: Appearance & Default Market */}
        <section className="tb-panel tb-border rounded-lg border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b tb-border">
            <div>
              <h2 className="text-[15px] font-semibold tb-text-primary">
                外观与默认市场
              </h2>
              <p className="mt-0.5 text-[12px] tb-text-muted">
                偏好设置会自动持久化至浏览器本地 localStorage，并与主工作区顶栏开关实时同步。
              </p>
            </div>
            <span className="rounded bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] tb-text-muted">
              {hydrated ? "本地持久化已同步" : "读取偏好中..."}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Theme */}
            <div className="space-y-2">
              <div className="text-[12px] font-semibold tb-text-primary">
                界面主题
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTheme("dark")}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                    prefs.theme === "dark"
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "tb-border tb-text-secondary tb-hover"
                  }`}
                >
                  <IconMoon size={15} />
                  <span>深色模式（默认）</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTheme("light")}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                    prefs.theme === "light"
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "tb-border tb-text-secondary tb-hover"
                  }`}
                >
                  <IconSun size={15} />
                  <span>浅色模式</span>
                </button>
              </div>
            </div>

            {/* Color Scheme */}
            <div className="space-y-2">
              <div className="text-[12px] font-semibold tb-text-primary">
                涨跌配色
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleColorScheme("intl")}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                    prefs.colorScheme === "intl"
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "tb-border tb-text-secondary tb-hover"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#16b981]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f2485b]" />
                  </span>
                  <span>绿涨红跌（默认）</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleColorScheme("cn")}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                    prefs.colorScheme === "cn"
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                      : "tb-border tb-text-secondary tb-hover"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f2485b]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#16b981]" />
                  </span>
                  <span>红涨绿跌（A 股）</span>
                </button>
              </div>
            </div>
          </div>

          {/* Default Market */}
          <div className="mt-5 space-y-2 border-t tb-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold tb-text-primary">
                默认市场分组与初始品种
              </div>
              <span className="text-[11px] tb-text-muted">
                当前默认首开标的：{DEFAULT_SYMBOL_BY_MARKET[prefs.defaultMarket]}
              </span>
            </div>
            <p className="text-[11px] tb-text-muted">
              重新打开或刷新工作区时，自选列表会将所选市场置顶展开，并将活动图默认切换到该市场代表品种。
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
              {MARKET_OPTIONS.map((m) => {
                const selected = prefs.defaultMarket === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleDefaultMarket(m.id)}
                    className={`rounded-md border px-3 py-2 text-left transition-colors cursor-pointer ${
                      selected
                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                        : "tb-border tb-text-primary tb-hover"
                    }`}
                  >
                    <div className="text-[12px] font-semibold">{m.label}</div>
                    <div className="mt-0.5 text-[10px] opacity-75 truncate">
                      默认：{m.defaultTicker}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 2: Data Source Status (Booleans Only, Zero Key Exposure) */}
        <section className="tb-panel tb-border rounded-lg border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b tb-border">
            <div>
              <h2 className="text-[15px] font-semibold tb-text-primary">
                数据源配置与运行状态
              </h2>
              <p className="mt-0.5 text-[12px] tb-text-muted">
                密钥仅保存在本地服务端环境变量（<code className="tb-text-primary">.env.local</code>），绝不下发前端，本页仅显示布尔配置与在线探测状态。
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleProbeSources()}
              disabled={probing}
              className="flex items-center gap-1.5 rounded bg-[var(--accent-primary)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <IconRefresh
                size={13}
                className={probing ? "animate-spin" : undefined}
              />
              <span>{probing ? "探测公开源中..." : "轻量检测在线状态"}</span>
            </button>
          </div>

          {probeError && (
            <div
              className="mt-3 rounded border px-3 py-2 text-[12px]"
              style={{
                borderColor: "var(--market-down)",
                backgroundColor: "var(--market-down-soft)",
                color: "var(--market-down)",
              }}
            >
              {probeError}
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
              <thead className="tb-border border-b text-[11px] tb-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">数据源名称</th>
                  <th className="py-2 px-3 font-medium">用途</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">
                    配置状态
                  </th>
                  <th className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                    运行 / 在线状态
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {health.sources.map((src) => (
                  <tr key={src.id} className="tb-hover">
                    <td className="py-2.5 pr-3 font-medium tb-text-primary">
                      {src.name}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] tb-text-secondary">
                      <div>{src.purpose}</div>
                      {src.note && (
                        <div className="mt-0.5 text-[10px] tb-text-muted">
                          说明：{src.note}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <ConfigBadge item={src} />
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <StatusBadge item={src} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded border tb-border bg-[var(--bg-canvas)] px-3 py-2 text-[11px] leading-relaxed tb-text-muted">
            <div>
              • 「轻量检测在线状态」仅向免 Key 官方公开源（FRED、美联储 RSS、SEC EDGAR）发送轻量 HEAD 探测，不消耗您的免费 API Key 日配额；已配置 Key 的数据源状态随实际行情/资讯请求自动更新。
            </div>
            <div className="mt-0.5">
              • 如需配置可选免费 API Key，请参考仓库根目录 <code className="tb-text-primary">.env.example</code>，复制为本地 <code className="tb-text-primary">.env.local</code> 并重启本地开发服务。
            </div>
          </div>
        </section>

        {/* Section 3: Compliance & Scope Statement */}
        <section className="tb-panel tb-border rounded-lg border p-5">
          <div className="flex items-center gap-2 pb-2 border-b tb-border">
            <IconShield size={16} className="text-[#16B981]" />
            <h2 className="text-[15px] font-semibold tb-text-primary">
              合规声明与功能边界
            </h2>
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed tb-text-secondary">
            <li>
              <strong className="tb-text-primary">仅研究与虚拟模拟，无实盘</strong>：Trade Buddy 仅用于行情图表学习、历史复盘、财务研究及纯本地虚拟模拟练习，不提供任何真实交易、券商下单接口、真实资金充提、融资融券或杠杆功能。
            </li>
            <li>
              <strong className="tb-text-primary">原创本地终端与数据透明</strong>：无 API Key 时自动使用仓库捆绑的真实历史样本与合法官方公开源（FRED / SEC EDGAR / 美联储 / BLS），绝不抓取商业终端或财经站点受限页面。
            </li>
            <li>
              <strong className="tb-text-primary">本地隐私安全</strong>：所有偏好、研究笔记仅存储在您当前浏览器 localStorage；任何可选 API Key 仅由本地服务端 Route Handler 读取，永不回传前端界面。
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
