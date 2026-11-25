"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_PAPER_INITIAL_CASH,
  type PaperAccount,
  type PaperFill,
  type PaperOrderInput,
  type PaperSettings,
} from "@trade-buddy/shared-types";

import {
  cancelPaperOrder,
  createPaperAccount,
  evaluatePendingOrders,
  loadPaperAccount,
  PAPER_ACCOUNT_STORAGE_KEY,
  recordEquityMarkSample,
  savePaperAccount,
  submitPaperOrder,
  updatePaperAccountSettings,
  type PaperMarketSnapshot,
  type PaperOrderResult,
} from "./paper-trading";

export interface PaperTradingContextValue {
  hydrated: boolean;
  account: PaperAccount | null;
  initAccount: (initialCash?: number) => PaperAccount;
  resetAccount: (initialCash?: number) => PaperAccount;
  updateSettings: (patch: Partial<PaperSettings>) => void;
  toggleChartMarkers: () => void;
  placeOrder: (
    input: PaperOrderInput,
    marketSnap: PaperMarketSnapshot | null,
    markPriceBySymbol?: Record<string, number>
  ) => PaperOrderResult;
  cancelOrder: (orderId: string) => boolean;
  processMarketSnapshots: (
    snapshotsBySymbol: Record<string, PaperMarketSnapshot>,
    markPriceBySymbol?: Record<string, number>,
    markSampleLabel?: string
  ) => PaperFill[];
}

const PaperTradingContext = createContext<PaperTradingContextValue | null>(
  null
);

interface PaperTradingProviderProps {
  children: React.ReactNode;
  onOrderFilled?: (fills: PaperFill[]) => void;
}

export function PaperTradingProvider({
  children,
  onOrderFilled,
}: PaperTradingProviderProps) {
  const [hydrated, setHydrated] = useState(false);
  const [account, setAccount] = useState<PaperAccount | null>(null);

  const accountRef = useRef<PaperAccount | null>(account);
  accountRef.current = account;

  const onOrderFilledRef = useRef(onOrderFilled);
  onOrderFilledRef.current = onOrderFilled;

  // Hydrate from browser localStorage & sync across tabs
  useEffect(() => {
    setAccount(loadPaperAccount());
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== PAPER_ACCOUNT_STORAGE_KEY) return;
      setAccount(loadPaperAccount());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: PaperAccount) => {
    accountRef.current = next;
    setAccount(next);
    savePaperAccount(next);
  }, []);

  const initAccount = useCallback(
    (initialCash: number = DEFAULT_PAPER_INITIAL_CASH): PaperAccount => {
      const created = createPaperAccount(initialCash);
      persist(created);
      return created;
    },
    [persist]
  );

  const resetAccount = useCallback(
    (initialCash: number = DEFAULT_PAPER_INITIAL_CASH): PaperAccount => {
      // Preserve user's fee/slippage & chart-marker preferences across account reset
      const existingSettings = accountRef.current?.settings;
      const fresh = createPaperAccount(initialCash, existingSettings);
      persist(fresh);
      return fresh;
    },
    [persist]
  );

  const updateSettings = useCallback(
    (patch: Partial<PaperSettings>) => {
      const cur = accountRef.current;
      if (!cur) return;
      const next = updatePaperAccountSettings(cur, patch);
      persist(next);
    },
    [persist]
  );

  const toggleChartMarkers = useCallback(() => {
    const cur = accountRef.current;
    if (!cur) return;
    const next = updatePaperAccountSettings(cur, {
      showChartMarkers: !cur.settings.showChartMarkers,
    });
    persist(next);
  }, [persist]);

  const placeOrder = useCallback(
    (
      input: PaperOrderInput,
      marketSnap: PaperMarketSnapshot | null,
      markPriceBySymbol?: Record<string, number>
    ): PaperOrderResult => {
      const cur = accountRef.current;
      if (!cur) {
        const fallback = createPaperAccount(DEFAULT_PAPER_INITIAL_CASH);
        return {
          ok: false,
          account: fallback,
          error: "请先开启虚拟资金模拟账户",
        };
      }
      const res = submitPaperOrder(cur, input, marketSnap, markPriceBySymbol);
      if (res.ok) {
        persist(res.account);
      }
      return res;
    },
    [persist]
  );

  const cancelOrder = useCallback(
    (orderId: string): boolean => {
      const cur = accountRef.current;
      if (!cur) return false;
      const res = cancelPaperOrder(cur, orderId);
      if (res.canceled) {
        persist(res.account);
        return true;
      }
      return false;
    },
    [persist]
  );

  const processMarketSnapshots = useCallback(
    (
      snapshotsBySymbol: Record<string, PaperMarketSnapshot>,
      markPriceBySymbol?: Record<string, number>,
      markSampleLabel?: string
    ): PaperFill[] => {
      const cur = accountRef.current;
      if (!cur) return [];

      const res = evaluatePendingOrders(
        cur,
        snapshotsBySymbol,
        markPriceBySymbol
      );
      let working = res.account;
      let changed = res.changed;

      // Sample equity curve on meaningful price changes while holding open positions
      if (
        res.filled.length === 0 &&
        working.positions.length > 0 &&
        markPriceBySymbol
      ) {
        const sampled = recordEquityMarkSample(
          working,
          markPriceBySymbol,
          markSampleLabel
        );
        if (sampled.recorded) {
          working = sampled.account;
          changed = true;
        }
      }

      if (changed) {
        persist(working);
      }
      if (res.filled.length > 0) {
        onOrderFilledRef.current?.(res.filled);
      }
      return res.filled;
    },
    [persist]
  );

  const value = useMemo<PaperTradingContextValue>(
    () => ({
      hydrated,
      account,
      initAccount,
      resetAccount,
      updateSettings,
      toggleChartMarkers,
      placeOrder,
      cancelOrder,
      processMarketSnapshots,
    }),
    [
      hydrated,
      account,
      initAccount,
      resetAccount,
      updateSettings,
      toggleChartMarkers,
      placeOrder,
      cancelOrder,
      processMarketSnapshots,
    ]
  );

  return (
    <PaperTradingContext.Provider value={value}>
      {children}
    </PaperTradingContext.Provider>
  );
}

export function usePaperTrading(): PaperTradingContextValue {
  const ctx = useContext(PaperTradingContext);
  if (!ctx) {
    throw new Error(
      "usePaperTrading must be used within a PaperTradingProvider"
    );
  }
  return ctx;
}
