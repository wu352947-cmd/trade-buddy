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
} from "@trade-buddy/shared-types";

import {
  cancelPaperOrder,
  createPaperAccount,
  evaluatePendingOrders,
  loadPaperAccount,
  PAPER_ACCOUNT_STORAGE_KEY,
  savePaperAccount,
  submitPaperOrder,
  type PaperMarketSnapshot,
  type PaperOrderResult,
} from "./paper-trading";

export interface PaperTradingContextValue {
  hydrated: boolean;
  account: PaperAccount | null;
  initAccount: (initialCash?: number) => PaperAccount;
  resetAccount: (initialCash?: number) => PaperAccount;
  placeOrder: (
    input: PaperOrderInput,
    marketSnap: PaperMarketSnapshot | null
  ) => PaperOrderResult;
  cancelOrder: (orderId: string) => boolean;
  processMarketSnapshots: (
    snapshotsBySymbol: Record<string, PaperMarketSnapshot>
  ) => PaperFill[];
}

const PaperTradingContext = createContext<PaperTradingContextValue | null>(null);

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
      const fresh = createPaperAccount(initialCash);
      persist(fresh);
      return fresh;
    },
    [persist]
  );

  const placeOrder = useCallback(
    (
      input: PaperOrderInput,
      marketSnap: PaperMarketSnapshot | null
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
      const res = submitPaperOrder(cur, input, marketSnap);
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
    (snapshotsBySymbol: Record<string, PaperMarketSnapshot>): PaperFill[] => {
      const cur = accountRef.current;
      if (!cur) return [];
      const res = evaluatePendingOrders(cur, snapshotsBySymbol);
      if (res.changed) {
        persist(res.account);
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
      placeOrder,
      cancelOrder,
      processMarketSnapshots,
    }),
    [
      hydrated,
      account,
      initAccount,
      resetAccount,
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
