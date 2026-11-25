import {
  DEFAULT_PAPER_INITIAL_CASH,
  PaperAccountSchema,
  PaperOrderInputSchema,
  type NormalizedBar,
  type PaperAccount,
  type PaperFill,
  type PaperMatchMode,
  type PaperOrder,
  type PaperOrderInput,
  type PaperPosition,
} from "@trade-buddy/shared-types";

export const PAPER_ACCOUNT_STORAGE_KEY = "trade-buddy:paper-account:v1";
const EPSILON = 1e-8;
const MAX_STORED_FILLS = 500;
const MAX_STORED_CLOSED_ORDERS = 300;

export interface PaperMarketSnapshot {
  symbolId: string;
  currentPrice: number;
  mode: PaperMatchMode;
  bar: NormalizedBar | null;
  barTimestamp: number | null;
  barTimeLabel?: string;
  steppedBars?: Array<{ bar: NormalizedBar; timeLabel?: string }>;
}

export interface PaperOrderResult {
  ok: boolean;
  account: PaperAccount;
  order?: PaperOrder;
  fill?: PaperFill;
  error?: string;
  message?: string;
}

export interface PaperMatchResult {
  account: PaperAccount;
  filled: PaperFill[];
  changed: boolean;
}

export interface PaperAccountMetrics {
  initialCash: number;
  cash: number;
  frozenCash: number;
  availableCash: number;
  marketValue: number;
  totalEquity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  openOrdersCount: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundQty(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function createPaperAccount(
  rawInitialCash: number = DEFAULT_PAPER_INITIAL_CASH
): PaperAccount {
  const initialCash =
    Number.isFinite(rawInitialCash) && rawInitialCash > 0
      ? roundMoney(rawInitialCash)
      : DEFAULT_PAPER_INITIAL_CASH;
  const now = new Date().toISOString();

  return PaperAccountSchema.parse({
    version: 1,
    isVirtualSimulation: true,
    leverage: 1,
    allowShort: false,
    initialCash,
    cash: initialCash,
    realizedPnl: 0,
    positions: [],
    orders: [],
    fills: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function loadPaperAccount(): PaperAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PAPER_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = PaperAccountSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export function savePaperAccount(account: PaperAccount | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!account) {
      window.localStorage.removeItem(PAPER_ACCOUNT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      PAPER_ACCOUNT_STORAGE_KEY,
      JSON.stringify(account)
    );
  } catch {
    // Ignore private-mode or quota storage errors
  }
}

export function computeFrozenCash(orders: PaperOrder[]): number {
  let sum = 0;
  for (const o of orders) {
    if (o.status === "open" && o.side === "buy" && o.limitPrice) {
      sum += o.limitPrice * o.quantity;
    }
  }
  return roundMoney(sum);
}

export function computeFrozenSellQty(
  orders: PaperOrder[],
  symbolId: string
): number {
  let sum = 0;
  for (const o of orders) {
    if (o.status === "open" && o.side === "sell" && o.symbolId === symbolId) {
      sum += o.quantity;
    }
  }
  return roundQty(sum);
}

export function getAvailableCash(account: PaperAccount): number {
  return Math.max(0, roundMoney(account.cash - computeFrozenCash(account.orders)));
}

export function getAvailableSellQty(
  account: PaperAccount,
  symbolId: string
): number {
  const pos = account.positions.find((p) => p.symbolId === symbolId);
  if (!pos) return 0;
  const frozen = computeFrozenSellQty(account.orders, symbolId);
  return Math.max(0, roundQty(pos.quantity - frozen));
}

export function computeAccountMetrics(
  account: PaperAccount,
  markPriceBySymbol: Record<string, number>
): PaperAccountMetrics {
  const frozenCash = computeFrozenCash(account.orders);
  const availableCash = Math.max(0, roundMoney(account.cash - frozenCash));
  let marketValue = 0;
  let costBasis = 0;

  for (const pos of account.positions) {
    const livePrice = markPriceBySymbol[pos.symbolId];
    const mark =
      typeof livePrice === "number" && Number.isFinite(livePrice) && livePrice > 0
        ? livePrice
        : pos.lastKnownPrice;
    marketValue += pos.quantity * mark;
    costBasis += pos.quantity * pos.avgCost;
  }

  marketValue = roundMoney(marketValue);
  const unrealizedPnl = roundMoney(marketValue - costBasis);
  const totalEquity = roundMoney(account.cash + marketValue);
  const totalPnl = roundMoney(totalEquity - account.initialCash);
  const totalPnlPct =
    account.initialCash > 0 ? (totalPnl / account.initialCash) * 100 : 0;
  const openOrdersCount = account.orders.filter((o) => o.status === "open").length;

  return {
    initialCash: account.initialCash,
    cash: account.cash,
    frozenCash,
    availableCash,
    marketValue,
    totalEquity,
    unrealizedPnl,
    realizedPnl: account.realizedPnl,
    totalPnl,
    totalPnlPct,
    openOrdersCount,
  };
}

function pruneOrders(orders: PaperOrder[]): PaperOrder[] {
  const openOrders = orders.filter((o) => o.status === "open");
  const closedOrders = orders
    .filter((o) => o.status !== "open")
    .slice(0, MAX_STORED_CLOSED_ORDERS);
  return [...openOrders, ...closedOrders];
}

function applyExecution(
  account: PaperAccount,
  order: PaperOrder,
  fillPrice: number,
  matchMode: PaperMatchMode,
  barTimestamp: number | null,
  barTimeLabel?: string
): { account: PaperAccount; order: PaperOrder; fill: PaperFill } | null {
  const execPrice = roundMoney(fillPrice);
  const qty = roundQty(order.quantity);
  const notional = roundMoney(execPrice * qty);
  const now = new Date().toISOString();

  let nextCash = account.cash;
  let nextRealizedPnl = account.realizedPnl;
  let fillRealizedPnl: number | null = null;
  const nextPositions: PaperPosition[] = account.positions.map((p) => ({ ...p }));
  const posIdx = nextPositions.findIndex((p) => p.symbolId === order.symbolId);

  if (order.side === "buy") {
    if (notional > nextCash + 1e-5) {
      return null;
    }
    nextCash = Math.max(0, roundMoney(nextCash - notional));
    if (posIdx >= 0) {
      const existing = nextPositions[posIdx];
      const combinedQty = roundQty(existing.quantity + qty);
      const weightedCost = roundMoney(
        (existing.avgCost * existing.quantity + notional) / combinedQty
      );
      nextPositions[posIdx] = {
        ...existing,
        quantity: combinedQty,
        avgCost: weightedCost,
        lastKnownPrice: execPrice,
        updatedAt: now,
      };
    } else {
      nextPositions.push({
        symbolId: order.symbolId,
        ticker: order.ticker,
        symbolName: order.symbolName,
        currency: order.currency,
        pricePrecision: order.pricePrecision,
        quantity: qty,
        avgCost: execPrice,
        lastKnownPrice: execPrice,
        updatedAt: now,
      });
    }
  } else {
    // Sell: strictly 1x spot, never allow short selling
    if (posIdx < 0) return null;
    const existing = nextPositions[posIdx];
    if (qty > existing.quantity + EPSILON) {
      return null;
    }
    nextCash = roundMoney(nextCash + notional);
    fillRealizedPnl = roundMoney((execPrice - existing.avgCost) * qty);
    nextRealizedPnl = roundMoney(nextRealizedPnl + fillRealizedPnl);

    const remaining = roundQty(existing.quantity - qty);
    if (remaining <= EPSILON) {
      nextPositions.splice(posIdx, 1);
    } else {
      nextPositions[posIdx] = {
        ...existing,
        quantity: remaining,
        lastKnownPrice: execPrice,
        updatedAt: now,
      };
    }
  }

  const filledOrder: PaperOrder = {
    ...order,
    status: "filled",
    matchMode,
    filledAt: now,
    filledPrice: execPrice,
    lastEvaluatedBarTimestamp: barTimestamp ?? order.lastEvaluatedBarTimestamp,
  };

  const fill: PaperFill = {
    id: makeId("fill"),
    orderId: order.id,
    symbolId: order.symbolId,
    ticker: order.ticker,
    symbolName: order.symbolName,
    currency: order.currency,
    pricePrecision: order.pricePrecision,
    side: order.side,
    type: order.type,
    quantity: qty,
    price: execPrice,
    notional,
    realizedPnl: fillRealizedPnl,
    matchMode,
    barTimestamp,
    barTimeLabel,
    filledAt: now,
  };

  const existsInList = account.orders.some((o) => o.id === order.id);
  const updatedOrders = existsInList
    ? account.orders.map((o) => (o.id === order.id ? filledOrder : o))
    : [filledOrder, ...account.orders];

  const nextAccount: PaperAccount = {
    ...account,
    leverage: 1,
    allowShort: false,
    isVirtualSimulation: true,
    cash: nextCash,
    realizedPnl: nextRealizedPnl,
    positions: nextPositions,
    orders: pruneOrders(updatedOrders),
    fills: [fill, ...account.fills].slice(0, MAX_STORED_FILLS),
    updatedAt: now,
  };

  return { account: nextAccount, order: filledOrder, fill };
}

/**
 * Validate and submit a virtual 1x spot order.
 * Hard-enforces leverage === 1 and allowShort === false in both schema and runtime checks.
 */
export function submitPaperOrder(
  account: PaperAccount,
  rawInput: PaperOrderInput | Record<string, unknown>,
  marketSnap: PaperMarketSnapshot | null
): PaperOrderResult {
  // Explicit pre-check for forbidden parameters
  if (
    rawInput &&
    typeof rawInput === "object" &&
    "leverage" in rawInput &&
    rawInput.leverage !== undefined &&
    rawInput.leverage !== 1
  ) {
    return {
      ok: false,
      account,
      error: "虚拟模拟盘固定为 1 倍现货，拒绝非 1 倍参数",
    };
  }
  if (
    rawInput &&
    typeof rawInput === "object" &&
    "allowShort" in rawInput &&
    rawInput.allowShort !== undefined &&
    rawInput.allowShort !== false
  ) {
    return {
      ok: false,
      account,
      error: "虚拟模拟盘禁止卖空，仅支持卖出已有持仓",
    };
  }

  const parsed = PaperOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstMsg = parsed.error.issues[0]?.message ?? "委托参数校验未通过";
    return {
      ok: false,
      account,
      error: firstMsg,
    };
  }

  const input = parsed.data;
  if (input.leverage !== 1 || input.allowShort !== false) {
    return {
      ok: false,
      account,
      error: "虚拟模拟盘固定为 1 倍现货且禁止卖空",
    };
  }

  if (
    !marketSnap ||
    !Number.isFinite(marketSnap.currentPrice) ||
    marketSnap.currentPrice <= 0
  ) {
    return {
      ok: false,
      account,
      error: "当前品种暂无可用参考价格，无法提交虚拟委托",
    };
  }

  const qty = roundQty(input.quantity);
  const limitPrice =
    input.type === "limit" && input.limitPrice !== undefined
      ? roundMoney(input.limitPrice)
      : undefined;

  // 1x Spot cash & position constraints
  if (input.side === "buy") {
    const availableCash = getAvailableCash(account);
    const checkPrice =
      input.type === "market" ? marketSnap.currentPrice : limitPrice!;
    const required = roundMoney(checkPrice * qty);
    if (required > availableCash + 1e-5) {
      return {
        ok: false,
        account,
        error: `可用虚拟现金不足（需 ${required.toLocaleString("zh-CN", {
          maximumFractionDigits: 2,
        })}，可用 ${availableCash.toLocaleString("zh-CN", {
          maximumFractionDigits: 2,
        })}）`,
      };
    }
  } else {
    const availableQty = getAvailableSellQty(account, input.symbolId);
    if (availableQty <= EPSILON) {
      return {
        ok: false,
        account,
        error: "当前品种无可用持仓，虚拟模拟盘禁止卖空",
      };
    }
    if (qty > availableQty + EPSILON) {
      return {
        ok: false,
        account,
        error: `卖出数量超过可用持仓（可用 ${availableQty}，模拟盘禁止卖空）`,
      };
    }
  }

  const now = new Date().toISOString();
  const baseOrder: PaperOrder = {
    id: makeId("ord"),
    symbolId: input.symbolId,
    ticker: input.ticker,
    symbolName: input.symbolName,
    currency: input.currency,
    pricePrecision: input.pricePrecision,
    side: input.side,
    type: input.type,
    quantity: qty,
    limitPrice,
    status: "open",
    leverage: 1,
    allowShort: false,
    matchMode: marketSnap.mode,
    createdAt: now,
    createdBarTimestamp: marketSnap.barTimestamp,
    lastEvaluatedBarTimestamp: marketSnap.barTimestamp,
  };

  // Market order fills immediately at current visible/replay price
  if (input.type === "market") {
    const executed = applyExecution(
      account,
      baseOrder,
      marketSnap.currentPrice,
      marketSnap.mode,
      marketSnap.barTimestamp,
      marketSnap.barTimeLabel
    );
    if (!executed) {
      return {
        ok: false,
        account,
        error: "撮合执行失败，请检查虚拟资金或可用持仓",
      };
    }
    return {
      ok: true,
      account: executed.account,
      order: executed.order,
      fill: executed.fill,
      message: `虚拟市价${input.side === "buy" ? "买入" : "卖出"}已成交：${input.ticker} × ${qty} @ ${executed.fill.price.toFixed(input.pricePrecision)}`,
    };
  }

  // Limit order: fill immediately if current visible price already satisfies limit
  const immediatelyMarketable =
    limitPrice !== undefined &&
    ((input.side === "buy" && marketSnap.currentPrice <= limitPrice) ||
      (input.side === "sell" && marketSnap.currentPrice >= limitPrice));

  if (immediatelyMarketable) {
    const executed = applyExecution(
      account,
      baseOrder,
      marketSnap.currentPrice,
      marketSnap.mode,
      marketSnap.barTimestamp,
      marketSnap.barTimeLabel
    );
    if (executed) {
      return {
        ok: true,
        account: executed.account,
        order: executed.order,
        fill: executed.fill,
        message: `虚拟限价${input.side === "buy" ? "买" : "卖"}单即时成交：${input.ticker} × ${qty} @ ${executed.fill.price.toFixed(input.pricePrecision)}`,
      };
    }
  }

  // Otherwise rest as an open limit order
  const nextAccount: PaperAccount = {
    ...account,
    orders: pruneOrders([baseOrder, ...account.orders]),
    updatedAt: now,
  };

  return {
    ok: true,
    account: nextAccount,
    order: baseOrder,
    message: `已提交虚拟限价${input.side === "buy" ? "买" : "卖"}单：${input.ticker} × ${qty} @ ${limitPrice!.toFixed(input.pricePrecision)}`,
  };
}

export function cancelPaperOrder(
  account: PaperAccount,
  orderId: string
): { account: PaperAccount; canceled: PaperOrder | null } {
  const target = account.orders.find(
    (o) => o.id === orderId && o.status === "open"
  );
  if (!target) {
    return { account, canceled: null };
  }
  const now = new Date().toISOString();
  const canceledOrder: PaperOrder = {
    ...target,
    status: "canceled",
    canceledAt: now,
  };
  const nextAccount: PaperAccount = {
    ...account,
    orders: pruneOrders(
      account.orders.map((o) => (o.id === orderId ? canceledOrder : o))
    ),
    updatedAt: now,
  };
  return { account: nextAccount, canceled: canceledOrder };
}

function checkBarLimitTrigger(
  order: PaperOrder,
  bar: NormalizedBar
): number | null {
  if (order.type !== "limit" || order.limitPrice === undefined) return null;
  const limit = order.limitPrice;
  if (order.side === "buy") {
    if (bar.low <= limit) {
      // If bar gapped below limit, fill at open; otherwise fill at limit
      return Math.max(bar.low, Math.min(bar.open, limit));
    }
    return null;
  }
  if (bar.high >= limit) {
    // If bar gapped above limit, fill at open; otherwise fill at limit
    return Math.min(bar.high, Math.max(bar.open, limit));
  }
  return null;
}

/**
 * Evaluate all resting open limit orders against updated latest/replay market snapshots.
 */
export function evaluatePendingOrders(
  account: PaperAccount,
  snapshotsBySymbol: Record<string, PaperMarketSnapshot>
): PaperMatchResult {
  const openOrders = account.orders.filter((o) => o.status === "open");
  if (openOrders.length === 0) {
    return { account, filled: [], changed: false };
  }

  // Evaluate oldest orders first
  const orderedIds = [...openOrders].reverse().map((o) => o.id);
  let working = account;
  const filled: PaperFill[] = [];
  let changed = false;

  for (const oid of orderedIds) {
    const order = working.orders.find((o) => o.id === oid && o.status === "open");
    if (!order || order.type !== "limit" || order.limitPrice === undefined) {
      continue;
    }
    const snap = snapshotsBySymbol[order.symbolId];
    if (!snap || !Number.isFinite(snap.currentPrice) || snap.currentPrice <= 0) {
      continue;
    }

    if (snap.mode === "replay") {
      const candidates: Array<{ bar: NormalizedBar; timeLabel?: string }> =
        snap.steppedBars && snap.steppedBars.length > 0
          ? snap.steppedBars
          : snap.bar
          ? [{ bar: snap.bar, timeLabel: snap.barTimeLabel }]
          : [];

      let latestSeenTs = order.lastEvaluatedBarTimestamp;
      let matched = false;

      for (const item of candidates) {
        const ts = item.bar.timestamp;
        // For replay orders, strictly advance forward in time (ignore same bar or backward seeks)
        if (order.matchMode === "replay") {
          if (latestSeenTs !== null && ts <= latestSeenTs) {
            continue;
          }
        } else {
          // Order created in latest mode then replay entered: skip only exact same bar timestamp
          if (latestSeenTs !== null && ts === latestSeenTs) {
            continue;
          }
        }

        const fillPrice = checkBarLimitTrigger(order, item.bar);
        latestSeenTs = ts;

        if (fillPrice !== null) {
          const executed = applyExecution(
            working,
            order,
            fillPrice,
            "replay",
            ts,
            item.timeLabel
          );
          if (executed) {
            working = executed.account;
            filled.push(executed.fill);
            changed = true;
            matched = true;
            break;
          }
        }
      }

      if (!matched && latestSeenTs !== order.lastEvaluatedBarTimestamp) {
        working = {
          ...working,
          orders: working.orders.map((o) =>
            o.id === order.id
              ? { ...o, lastEvaluatedBarTimestamp: latestSeenTs }
              : o
          ),
        };
        changed = true;
      }
    } else {
      // Non-replay latest quote/bar matching
      let fillPrice: number | null = null;
      if (order.side === "buy" && snap.currentPrice <= order.limitPrice) {
        fillPrice = snap.currentPrice;
      } else if (order.side === "sell" && snap.currentPrice >= order.limitPrice) {
        fillPrice = snap.currentPrice;
      } else if (
        snap.bar &&
        order.lastEvaluatedBarTimestamp !== null &&
        snap.bar.timestamp > order.lastEvaluatedBarTimestamp
      ) {
        fillPrice = checkBarLimitTrigger(order, snap.bar);
      }

      if (fillPrice !== null) {
        const executed = applyExecution(
          working,
          order,
          fillPrice,
          "latest",
          snap.barTimestamp,
          snap.barTimeLabel
        );
        if (executed) {
          working = executed.account;
          filled.push(executed.fill);
          changed = true;
        }
      } else if (
        snap.barTimestamp !== null &&
        (order.lastEvaluatedBarTimestamp === null ||
          snap.barTimestamp > order.lastEvaluatedBarTimestamp)
      ) {
        working = {
          ...working,
          orders: working.orders.map((o) =>
            o.id === order.id
              ? { ...o, lastEvaluatedBarTimestamp: snap.barTimestamp }
              : o
          ),
        };
        changed = true;
      }
    }
  }

  return { account: working, filled, changed };
}
