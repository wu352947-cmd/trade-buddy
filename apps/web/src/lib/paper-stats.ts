import type {
  PaperAccount,
  PaperEquityPoint,
  PaperFill,
} from "@trade-buddy/shared-types";

import { computeAccountMetrics } from "./paper-trading";

const EPSILON = 1e-8;

export interface ClosedRoundTrip {
  symbolId: string;
  ticker: string;
  openedAt: string;
  closedAt: string;
  buyCount: number;
  sellCount: number;
  realizedPnl: number;
  totalFees: number;
}

export interface PaperReviewStats {
  initialCash: number;
  currentEquity: number;
  totalPnl: number;
  totalReturnPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  maxDrawdownAmount: number;
  maxDrawdownPct: number;
  totalFills: number;
  buyFills: number;
  sellFills: number;
  closedRounds: ClosedRoundTrip[];
  closedRoundsCount: number;
  winningRoundsCount: number;
  losingRoundsCount: number;
  breakevenRoundsCount: number;
  winRatePct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** avgWin / avgLoss; null when no closed rounds; Infinity when wins > 0 and losses === 0 */
  profitLossRatio: number | null;
  equitySeries: PaperEquityPoint[];
}

function roundMoney(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/**
 * Reconstruct closed round-trips per symbol from chronological fills.
 * A round-trip opens when a symbol's position transitions from 0 -> >0,
 * accumulates realized PnL across partial/full sells, and closes when position returns to 0.
 */
export function computeClosedRoundTrips(fills: PaperFill[]): ClosedRoundTrip[] {
  if (fills.length === 0) return [];
  // account.fills is stored newest-first; iterate oldest-first
  const chronological = [...fills].reverse();

  interface ActiveRound {
    symbolId: string;
    ticker: string;
    qty: number;
    openedAt: string;
    buyCount: number;
    sellCount: number;
    realizedPnl: number;
    totalFees: number;
  }

  const activeBySymbol = new Map<string, ActiveRound>();
  const closed: ClosedRoundTrip[] = [];

  for (const f of chronological) {
    let cur = activeBySymbol.get(f.symbolId);

    if (f.side === "buy") {
      if (!cur) {
        cur = {
          symbolId: f.symbolId,
          ticker: f.ticker,
          qty: f.quantity,
          openedAt: f.filledAt,
          buyCount: 1,
          sellCount: 0,
          realizedPnl: 0,
          totalFees: f.fee ?? 0,
        };
        activeBySymbol.set(f.symbolId, cur);
      } else {
        cur.qty += f.quantity;
        cur.buyCount += 1;
        cur.totalFees += f.fee ?? 0;
      }
    } else {
      if (!cur) {
        // Defensive guard for truncated fill history (if oldest buy exceeded 500-fill cap)
        continue;
      }
      cur.qty = Math.max(0, cur.qty - f.quantity);
      cur.sellCount += 1;
      cur.realizedPnl += f.realizedPnl ?? 0;
      cur.totalFees += f.fee ?? 0;

      if (cur.qty <= EPSILON) {
        closed.push({
          symbolId: cur.symbolId,
          ticker: cur.ticker,
          openedAt: cur.openedAt,
          closedAt: f.filledAt,
          buyCount: cur.buyCount,
          sellCount: cur.sellCount,
          realizedPnl: roundMoney(cur.realizedPnl),
          totalFees: roundMoney(cur.totalFees),
        });
        activeBySymbol.delete(f.symbolId);
      }
    }
  }

  return closed;
}

export function computePaperReviewStats(
  account: PaperAccount,
  markPriceBySymbol: Record<string, number>
): PaperReviewStats {
  const metrics = computeAccountMetrics(account, markPriceBySymbol);

  // Build effective equity curve (ensuring initial point + latest live equity point)
  const baseSeries: PaperEquityPoint[] =
    account.equityCurve.length > 0
      ? [...account.equityCurve]
      : [
          {
            timestamp: Date.parse(account.createdAt) || Date.now(),
            recordedAt: account.createdAt,
            equity: account.initialCash,
            cash: account.initialCash,
            marketValue: 0,
            realizedPnl: 0,
            totalFees: 0,
            reason: "init",
            label: "账户初始化",
          },
        ];

  const lastPt = baseSeries[baseSeries.length - 1];
  const equitySeries: PaperEquityPoint[] =
    lastPt && Math.abs(lastPt.equity - metrics.totalEquity) >= 0.01
      ? [
          ...baseSeries,
          {
            timestamp: Date.now(),
            recordedAt: new Date().toISOString(),
            equity: metrics.totalEquity,
            cash: metrics.cash,
            marketValue: metrics.marketValue,
            realizedPnl: metrics.realizedPnl,
            totalFees: metrics.totalFees,
            reason: "mark",
            label: "当前实时估值",
          },
        ]
      : baseSeries;

  // Peak-to-trough max drawdown over equity series
  let peak = equitySeries[0]?.equity ?? account.initialCash;
  let maxDrawdownAmount = 0;
  let maxDrawdownPct = 0;
  for (const pt of equitySeries) {
    if (pt.equity > peak) {
      peak = pt.equity;
    }
    const ddAmt = Math.max(0, peak - pt.equity);
    const ddPct = peak > 0 ? (ddAmt / peak) * 100 : 0;
    if (ddAmt > maxDrawdownAmount) maxDrawdownAmount = ddAmt;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  // Round-trip win rate & profit/loss ratio
  const closedRounds = computeClosedRoundTrips(account.fills);
  const winningRounds = closedRounds.filter((r) => r.realizedPnl > EPSILON);
  const losingRounds = closedRounds.filter((r) => r.realizedPnl < -EPSILON);
  const breakevenRounds = closedRounds.filter(
    (r) => Math.abs(r.realizedPnl) <= EPSILON
  );

  const winRatePct =
    closedRounds.length > 0
      ? (winningRounds.length / closedRounds.length) * 100
      : null;

  const avgWin =
    winningRounds.length > 0
      ? roundMoney(
          winningRounds.reduce((s, r) => s + r.realizedPnl, 0) /
            winningRounds.length
        )
      : null;

  const avgLoss =
    losingRounds.length > 0
      ? roundMoney(
          Math.abs(losingRounds.reduce((s, r) => s + r.realizedPnl, 0)) /
            losingRounds.length
        )
      : null;

  let profitLossRatio: number | null = null;
  if (closedRounds.length > 0) {
    if (avgWin !== null && avgLoss !== null && avgLoss > EPSILON) {
      profitLossRatio = avgWin / avgLoss;
    } else if (avgWin !== null && (avgLoss === null || avgLoss <= EPSILON)) {
      profitLossRatio = Number.POSITIVE_INFINITY;
    } else if (avgWin === null && avgLoss !== null) {
      profitLossRatio = 0;
    }
  }

  let buyFills = 0;
  let sellFills = 0;
  for (const f of account.fills) {
    if (f.side === "buy") buyFills += 1;
    else sellFills += 1;
  }

  return {
    initialCash: account.initialCash,
    currentEquity: metrics.totalEquity,
    totalPnl: metrics.totalPnl,
    totalReturnPct: metrics.totalPnlPct,
    realizedPnl: metrics.realizedPnl,
    unrealizedPnl: metrics.unrealizedPnl,
    totalFees: metrics.totalFees,
    maxDrawdownAmount: roundMoney(maxDrawdownAmount),
    maxDrawdownPct,
    totalFills: account.fills.length,
    buyFills,
    sellFills,
    closedRounds,
    closedRoundsCount: closedRounds.length,
    winningRoundsCount: winningRounds.length,
    losingRoundsCount: losingRounds.length,
    breakevenRoundsCount: breakevenRounds.length,
    winRatePct,
    avgWin,
    avgLoss,
    profitLossRatio,
    equitySeries,
  };
}

// === UTF-8 BOM CSV Builders & Browser Download Helpers ===

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvWithBom(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => r.map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function makeExportStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function buildFillsCsv(fills: PaperFill[]): string {
  const headers = [
    "成交编号",
    "委托编号",
    "成交时间",
    "K线时间",
    "品种代码",
    "品种名称",
    "币种",
    "方向",
    "委托类型",
    "撮合模式",
    "参考价",
    "成交价",
    "滑点(%)",
    "数量",
    "成交额",
    "手续费",
    "已实现盈亏",
  ];

  // Chronological ascending order is friendlier for Excel review
  const ordered = [...fills].reverse();
  const rows = ordered.map((f) => [
    f.id,
    f.orderId,
    f.filledAt,
    f.barTimeLabel ?? "",
    f.ticker,
    f.symbolName,
    f.currency,
    f.side === "buy" ? "买入" : "卖出",
    f.type === "market" ? "市价" : "限价",
    f.matchMode === "replay" ? "回放撮合" : "当前价撮合",
    f.referencePrice !== undefined
      ? f.referencePrice.toFixed(f.pricePrecision)
      : "",
    f.price.toFixed(f.pricePrecision),
    (f.slippagePct ?? 0).toFixed(4),
    f.quantity,
    f.notional.toFixed(2),
    (f.fee ?? 0).toFixed(2),
    f.realizedPnl === null ? "" : f.realizedPnl.toFixed(2),
  ]);

  return buildCsvWithBom(headers, rows);
}

export function buildEquityCurveCsv(
  equitySeries: PaperEquityPoint[],
  initialCash: number
): string {
  const headers = [
    "序号",
    "记录时间",
    "事件类型",
    "说明",
    "总虚拟权益",
    "现金",
    "持仓市值",
    "已实现盈亏",
    "累计手续费",
    "累计收益率(%)",
    "较峰值回撤(%)",
  ];

  let peak = equitySeries[0]?.equity ?? initialCash;
  const rows = equitySeries.map((pt, idx) => {
    if (pt.equity > peak) peak = pt.equity;
    const retPct =
      initialCash > 0 ? ((pt.equity - initialCash) / initialCash) * 100 : 0;
    const ddPct = peak > 0 ? (Math.max(0, peak - pt.equity) / peak) * 100 : 0;
    const reasonLabel =
      pt.reason === "init"
        ? "初始化"
        : pt.reason === "fill"
        ? "成交采样"
        : "行情估值";

    return [
      idx + 1,
      pt.recordedAt,
      reasonLabel,
      pt.label ?? "",
      pt.equity.toFixed(2),
      pt.cash.toFixed(2),
      pt.marketValue.toFixed(2),
      pt.realizedPnl.toFixed(2),
      (pt.totalFees ?? 0).toFixed(2),
      retPct.toFixed(2),
      ddPct.toFixed(2),
    ];
  });

  return buildCsvWithBom(headers, rows);
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export function downloadFillsCsv(fills: PaperFill[]): string {
  const filename = `trade-buddy-fills-${makeExportStamp()}.csv`;
  triggerCsvDownload(filename, buildFillsCsv(fills));
  return filename;
}

export function downloadEquityCurveCsv(
  equitySeries: PaperEquityPoint[],
  initialCash: number
): string {
  const filename = `trade-buddy-equity-${makeExportStamp()}.csv`;
  triggerCsvDownload(filename, buildEquityCurveCsv(equitySeries, initialCash));
  return filename;
}
