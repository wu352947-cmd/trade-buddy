"use client";

import React, { useEffect, useState } from "react";
import type { DataProvenance, SymbolMeta } from "@trade-buddy/shared-types";
import type { AdapterEnvStatus } from "@trade-buddy/market-adapters";
import {
  IconChevronDown,
  IconNotes,
  IconPaperSim,
  IconShield,
} from "@trade-buddy/ui-tokens";

import { PaperTradingPanel } from "@/components/panels/PaperTradingPanel";
import type { PaperMarketSnapshot } from "@/lib/paper-trading";
import { usePaperTrading } from "@/lib/paper-trading-store";

interface BottomDockProps {
  symbol: SymbolMeta;
  provenance: DataProvenance;
  envStatus: AdapterEnvStatus;
  activePaperSnapshot: PaperMarketSnapshot | null;
  paperSnapshotsBySymbol: Record<string, PaperMarketSnapshot>;
  markPriceBySymbol: Record<string, number>;
  onSelectSymbol: (symbolId: string) => void;
  onNotify?: (msg: string) => void;
}

type DockTab = "paper" | "notes" | "provenance";

export function BottomDock({
  symbol,
  provenance,
  envStatus,
  activePaperSnapshot,
  paperSnapshotsBySymbol,
  markPriceBySymbol,
  onSelectSymbol,
  onNotify,
}: BottomDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [tallPaper, setTallPaper] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>("paper");
  const [noteText, setNoteText] = useState("");
  const [savedAt, setSavedAt] = useState<string>("");

  const { account } = usePaperTrading();
  const openOrdersCount =
    account?.orders.filter((o) => o.status === "open").length ?? 0;
  const positionsCount = account?.positions.length ?? 0;

  const storageKey = `trade-buddy:note:${symbol.id}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { content?: string; updatedAt?: string };
        setNoteText(parsed.content ?? "");
        setSavedAt(parsed.updatedAt ?? "");
      } else {
        setNoteText("");
        setSavedAt("");
      }
    } catch {
      setNoteText("");
      setSavedAt("");
    }
  }, [storageKey]);

  const handleNoteChange = (val: string) => {
    setNoteText(val);
    const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setSavedAt(now);
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ content: val, updatedAt: now })
      );
    } catch {
      // Ignore storage quota errors in private mode
    }
  };

  const dockHeight = !expanded
    ? 32
    : activeTab === "paper"
    ? tallPaper
      ? 368
      : 276
    : 196;

  return (
    <section
      aria-label="底部虚拟模拟盘、研究笔记与数据说明面板"
      className="tb-panel tb-border flex shrink-0 flex-col border-t transition-all"
      style={{ height: dockHeight }}
    >
      {/* Dock Header Bar (always 32px) */}
      <div className="flex h-[32px] shrink-0 items-center justify-between px-3 text-[11px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (expanded && activeTab === "paper") {
                setExpanded(false);
              } else {
                setActiveTab("paper");
                setExpanded(true);
              }
            }}
            className={`flex items-center gap-1.5 rounded px-2 py-1 font-semibold transition-colors cursor-pointer ${
              expanded && activeTab === "paper"
                ? "bg-[rgba(245,158,11,0.18)] text-[var(--status-delayed)]"
                : "tb-text-primary tb-hover"
            }`}
            title="打开纯本地虚拟资金模拟盘（1 倍现货，禁止卖空）"
          >
            <IconPaperSim size={13} className="text-[var(--status-delayed)]" />
            <span>虚拟资金·模拟</span>
            {account && (positionsCount > 0 || openOrdersCount > 0) && (
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent-primary)",
                }}
              >
                {positionsCount}仓{openOrdersCount > 0 ? `/${openOrdersCount}挂` : ""}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (expanded && activeTab === "notes") {
                setExpanded(false);
              } else {
                setActiveTab("notes");
                setExpanded(true);
              }
            }}
            className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              expanded && activeTab === "notes"
                ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                : "tb-text-secondary tb-hover"
            }`}
          >
            <IconNotes size={13} />
            <span>研究笔记 ({symbol.ticker})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (expanded && activeTab === "provenance") {
                setExpanded(false);
              } else {
                setActiveTab("provenance");
                setExpanded(true);
              }
            }}
            className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors cursor-pointer ${
              expanded && activeTab === "provenance"
                ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                : "tb-text-secondary tb-hover"
            }`}
          >
            <IconShield size={13} />
            <span>数据源与合规声明</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline tb-text-muted">
            当前来源：{provenance.provider}
            {provenance.dateRange ? `（${provenance.dateRange}）` : ""}
          </span>
          {expanded && activeTab === "paper" && (
            <button
              type="button"
              onClick={() => setTallPaper((v) => !v)}
              title={tallPaper ? "恢复标准高度" : "增高模拟盘面板"}
              className="tb-hover rounded px-1.5 py-0.5 text-[10px] tb-text-secondary cursor-pointer"
            >
              {tallPaper ? "标准高" : "加高"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "折叠底部面板" : "展开底部面板"}
            className="tb-hover flex items-center gap-1 rounded px-1.5 py-0.5 tb-text-secondary cursor-pointer"
          >
            <span>{expanded ? "收起" : "展开"}</span>
            <IconChevronDown
              size={13}
              className={`transition-transform ${expanded ? "" : "rotate-180"}`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Body */}
      {expanded && (
        <div
          className={`tb-border flex-1 border-t text-[12px] ${
            activeTab === "paper"
              ? "overflow-hidden"
              : "overflow-y-auto px-3 py-2"
          }`}
        >
          {activeTab === "paper" ? (
            <PaperTradingPanel
              activeSymbol={symbol}
              activeSnapshot={activePaperSnapshot}
              snapshotsBySymbol={paperSnapshotsBySymbol}
              markPriceBySymbol={markPriceBySymbol}
              onSelectSymbol={onSelectSymbol}
              onNotify={onNotify}
            />
          ) : activeTab === "notes" ? (
            <div className="flex h-full flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] tb-text-muted">
                <span>
                  {symbol.ticker} · {symbol.name} — 复盘观察与结构记录（仅保存在当前浏览器 localStorage）
                </span>
                <span>{savedAt ? `已自动保存 ${savedAt}` : "未编辑"}</span>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder={`记录你对 ${symbol.ticker}（${symbol.name}）的趋势结构、关键支撑阻力位、指标背离或学习心得...\n提示：本工具仅用于行情研究学习，不构成投资建议。`}
                className="tb-border-subtle flex-1 resize-none rounded border bg-[var(--bg-input)] p-2 text-[12px] tb-text-primary outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-muted)]"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
              <div className="rounded border tb-border p-2.5 bg-[var(--bg-canvas)]">
                <div className="font-semibold tb-text-primary mb-1">
                  本地数据源适配状态（无 Key 自动回退历史样本）
                </div>
                <div className="grid grid-cols-2 gap-y-1 gap-x-3 tb-text-secondary">
                  <span>FRED 官方指数（免 Key）</span>
                  <span className={envStatus.fredPublicEnabled ? "tb-up" : "tb-text-muted"}>
                    {envStatus.fredPublicEnabled ? "已启用（SP500 / NASDAQCOM）" : "已关闭"}
                  </span>
                  <span>官方公开资讯/日历（免 Key）</span>
                  <span className={envStatus.publicFeedsEnabled ? "tb-up" : "tb-text-muted"}>
                    {envStatus.publicFeedsEnabled ? "已启用（SEC / 美联储 / BLS）" : "已关闭"}
                  </span>
                  <span>Twelve Data Free</span>
                  <span>
                    {envStatus.twelveDataConfigured ? "已配置 Key（美股 60m/日线）" : "未配置（使用样本）"}
                  </span>
                  <span>Polygon.io Free</span>
                  <span>
                    {envStatus.polygonConfigured ? "已配置 Key（美股 60m/日线/新闻）" : "未配置（使用样本）"}
                  </span>
                  <span>Finnhub Free</span>
                  <span>
                    {envStatus.finnhubConfigured ? "已配置 Key（报价/新闻/日历）" : "未配置（使用公开源）"}
                  </span>
                  <span>EODHD Free</span>
                  <span>
                    {envStatus.eodhdConfigured ? "已配置 Key（美/港股 EOD）" : "未配置（使用样本）"}
                  </span>
                  <span>Tushare Pro / Baostock</span>
                  <span>
                    {envStatus.tushareConfigured
                      ? "Tushare 已配置（A股 EOD）"
                      : envStatus.baostockEnabled
                      ? "Baostock 本地已启用"
                      : "未配置（使用样本）"}
                  </span>
                </div>
              </div>

              <div className="rounded border tb-border p-2.5 bg-[var(--bg-canvas)]">
                <div className="font-semibold tb-text-primary mb-1">
                  合规与未成年人保护声明
                </div>
                <ul className="list-disc pl-4 space-y-0.5 tb-text-secondary">
                  <li>
                    <strong className="tb-text-primary">Trade Buddy</strong> 为原创个人行情研究终端，与任何商业看盘软件无隶属关系。
                  </li>
                  <li>
                    仅限金融图表学习与复盘研究，严禁真实交易、券商下单、融资融券及任何杠杆功能。
                  </li>
                  <li>
                    默认捆绑数据为真实公开历史日线/小时样本，界面诚实标注来源与区间，不伪装交易所实时行情。
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
