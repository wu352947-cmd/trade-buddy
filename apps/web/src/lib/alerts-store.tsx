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
import type {
  AlertConditionType,
  AlertFrequency,
  AlertTriggerEvent,
  Interval,
  LocalAlertRule,
  LocalAlertsSettings,
  LocalAlertsStore,
} from "@trade-buddy/shared-types";
import {
  createAlertTriggerEvent,
  createEmptyLocalAlertsStore,
  evaluateAlertRule,
  isChangePctAlertCondition,
  isPriceAlertCondition,
  loadLocalAlertsStore,
  LOCAL_ALERTS_STORAGE_KEY,
  MAX_ALERT_HISTORY,
  saveLocalAlertsStore,
  type AlertEvaluationFeed,
} from "./local-alerts";

export interface CreateLocalAlertInput {
  name?: string;
  symbolId: string;
  ticker: string;
  symbolName: string;
  pricePrecision: number;
  interval: Interval;
  condition: AlertConditionType;
  threshold?: number;
  maFastPeriod?: number;
  maSlowPeriod?: number;
  rsiPeriod?: number;
  frequency: AlertFrequency;
  note?: string;
}

export type BrowserNotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

interface AlertsContextValue {
  hydrated: boolean;
  rules: LocalAlertRule[];
  history: AlertTriggerEvent[];
  settings: LocalAlertsSettings;
  unreadCount: number;
  browserPermission: BrowserNotificationPermissionState;
  addRule: (input: CreateLocalAlertInput) => LocalAlertRule;
  toggleRuleEnabled: (id: string) => void;
  deleteRule: (id: string) => void;
  updateSettings: (patch: Partial<LocalAlertsSettings>) => void;
  requestBrowserNotificationPermission: () => Promise<BrowserNotificationPermissionState>;
  markAllHistoryRead: () => void;
  clearHistory: () => void;
  evaluateFeeds: (
    feeds: AlertEvaluationFeed[],
    options?: {
      sourceMode?: AlertTriggerEvent["sourceMode"];
      forceAllSymbols?: boolean;
    }
  ) => {
    triggeredEvents: AlertTriggerEvent[];
    checkedCount: number;
    skippedReplayCount: number;
    detailsByRuleId: Record<string, string>;
  };
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

function makeRuleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `alr-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `alr-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function readBrowserPermission(): BrowserNotificationPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

interface AlertsProviderProps {
  children: React.ReactNode;
  onAlertsTriggered?: (events: AlertTriggerEvent[]) => void;
}

export function AlertsProvider({
  children,
  onAlertsTriggered,
}: AlertsProviderProps) {
  const [store, setStore] = useState<LocalAlertsStore>(() =>
    createEmptyLocalAlertsStore()
  );
  const [hydrated, setHydrated] = useState(false);
  const [browserPermission, setBrowserPermission] =
    useState<BrowserNotificationPermissionState>("default");

  const storeRef = useRef(store);
  storeRef.current = store;

  const onTriggeredRef = useRef(onAlertsTriggered);
  onTriggeredRef.current = onAlertsTriggered;

  // Track last observed price per rule id in memory (for clean price crossover detection)
  const lastObservedPriceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const loaded = loadLocalAlertsStore();
    setStore(loaded);
    setBrowserPermission(readBrowserPermission());
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCAL_ALERTS_STORAGE_KEY) return;
      setStore(loadLocalAlertsStore());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistStore = useCallback(
    (updater: (prev: LocalAlertsStore) => LocalAlertsStore) => {
      setStore((prev) => {
        const next = updater(prev);
        const withTs: LocalAlertsStore = {
          ...next,
          updatedAt: new Date().toISOString(),
        };
        storeRef.current = withTs;
        saveLocalAlertsStore(withTs);
        return withTs;
      });
    },
    []
  );

  const addRule = useCallback(
    (input: CreateLocalAlertInput): LocalAlertRule => {
      const now = new Date().toISOString();
      const rule: LocalAlertRule = {
        id: makeRuleId(),
        name: input.name?.trim() || undefined,
        symbolId: input.symbolId,
        ticker: input.ticker,
        symbolName: input.symbolName,
        pricePrecision: input.pricePrecision,
        interval: input.interval,
        condition: input.condition,
        threshold: input.threshold,
        maFastPeriod: input.maFastPeriod,
        maSlowPeriod: input.maSlowPeriod,
        rsiPeriod: input.rsiPeriod,
        frequency: input.frequency,
        enabled: true,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        triggeredCount: 0,
        lastTriggeredAt: null,
        lastTriggeredBarTimestamp: null,
      };
      persistStore((prev) => ({
        ...prev,
        rules: [rule, ...prev.rules],
      }));
      return rule;
    },
    [persistStore]
  );

  const toggleRuleEnabled = useCallback(
    (id: string) => {
      persistStore((prev) => ({
        ...prev,
        rules: prev.rules.map((r) =>
          r.id === id
            ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() }
            : r
        ),
      }));
    },
    [persistStore]
  );

  const deleteRule = useCallback(
    (id: string) => {
      delete lastObservedPriceRef.current[id];
      persistStore((prev) => ({
        ...prev,
        rules: prev.rules.filter((r) => r.id !== id),
      }));
    },
    [persistStore]
  );

  const updateSettings = useCallback(
    (patch: Partial<LocalAlertsSettings>) => {
      persistStore((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
        },
      }));
    },
    [persistStore]
  );

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setBrowserPermission("unsupported");
      return "unsupported" as const;
    }
    try {
      const res = await Notification.requestPermission();
      setBrowserPermission(res);
      if (res === "granted") {
        updateSettings({ browserNotificationEnabled: true });
      } else {
        updateSettings({ browserNotificationEnabled: false });
      }
      return res;
    } catch {
      const cur = readBrowserPermission();
      setBrowserPermission(cur);
      return cur;
    }
  }, [updateSettings]);

  const markAllHistoryRead = useCallback(() => {
    persistStore((prev) => ({
      ...prev,
      history: prev.history.map((h) => (h.read ? h : { ...h, read: true })),
    }));
  }, [persistStore]);

  const clearHistory = useCallback(() => {
    persistStore((prev) => ({
      ...prev,
      history: [],
    }));
  }, [persistStore]);

  const fireBrowserNotifications = useCallback((events: AlertTriggerEvent[]) => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return;
    }
    if (!storeRef.current.settings.browserNotificationEnabled) return;
    if (Notification.permission !== "granted") return;

    for (const ev of events.slice(0, 3)) {
      try {
        new Notification(`Trade Buddy 本地提醒 · ${ev.title}`, {
          body: ev.message,
          tag: `tb-alert-${ev.alertId}`,
        });
      } catch {
        // Ignore browser notification errors in restricted contexts
      }
    }
  }, []);

  const evaluateFeeds = useCallback(
    (
      feeds: AlertEvaluationFeed[],
      options?: {
        sourceMode?: AlertTriggerEvent["sourceMode"];
        forceAllSymbols?: boolean;
      }
    ) => {
      const current = storeRef.current;
      const triggeredEvents: AlertTriggerEvent[] = [];
      const detailsByRuleId: Record<string, string> = {};
      let checkedCount = 0;
      let skippedReplayCount = 0;

      // Index feeds by exact (symbolId, interval) and fallback by symbolId (for quote-based price/change alerts)
      const exactFeedMap = new Map<string, AlertEvaluationFeed>();
      const symbolFeedMap = new Map<string, AlertEvaluationFeed>();

      for (const feed of feeds) {
        exactFeedMap.set(`${feed.symbolId}::${feed.interval}`, feed);
        const existing = symbolFeedMap.get(feed.symbolId);
        // Prefer feed with bars over quote-only feed
        if (!existing || (existing.bars.length === 0 && feed.bars.length > 0)) {
          symbolFeedMap.set(feed.symbolId, feed);
        }
      }

      let rulesChanged = false;
      const nextRules = current.rules.map((rule) => {
        if (!rule.enabled) return rule;

        let feed = exactFeedMap.get(`${rule.symbolId}::${rule.interval}`);
        if (
          !feed &&
          (isPriceAlertCondition(rule.condition) ||
            isChangePctAlertCondition(rule.condition))
        ) {
          feed = symbolFeedMap.get(rule.symbolId);
        }
        if (!feed) {
          detailsByRuleId[rule.id] = `当前未加载 ${rule.ticker} (${rule.interval}) 数据`;
          return rule;
        }

        if (feed.isReplay && !current.settings.triggerInReplayMode) {
          skippedReplayCount++;
          detailsByRuleId[rule.id] = "回放中（已设置为回放不触发）";
          return rule;
        }

        checkedCount++;
        const prevObs = lastObservedPriceRef.current[rule.id] ?? null;
        const outcome = evaluateAlertRule(rule, feed, prevObs);
        detailsByRuleId[rule.id] = outcome.statusDetail;

        if (outcome.observedPrice !== null) {
          lastObservedPriceRef.current[rule.id] = outcome.observedPrice;
        }

        if (!outcome.triggered) return rule;

        // Frequency check: once_per_bar skips if already triggered on this exact bar timestamp
        if (
          rule.frequency === "once_per_bar" &&
          outcome.barTimestamp !== null &&
          rule.lastTriggeredBarTimestamp === outcome.barTimestamp
        ) {
          detailsByRuleId[rule.id] = `${outcome.statusDetail}（本根 K 线已触发过）`;
          return rule;
        }

        const effectiveSourceMode: AlertTriggerEvent["sourceMode"] =
          options?.sourceMode ?? (feed.isReplay ? "replay" : "latest");

        const event = createAlertTriggerEvent(rule, outcome, effectiveSourceMode);
        triggeredEvents.push(event);
        rulesChanged = true;

        return {
          ...rule,
          enabled: rule.frequency === "once" ? false : rule.enabled,
          triggeredCount: rule.triggeredCount + 1,
          lastTriggeredAt: event.triggeredAt,
          lastTriggeredBarTimestamp: outcome.barTimestamp,
          updatedAt: event.triggeredAt,
        };
      });

      if (rulesChanged && triggeredEvents.length > 0) {
        persistStore((prev) => ({
          ...prev,
          rules: nextRules,
          history: [...triggeredEvents, ...prev.history].slice(
            0,
            MAX_ALERT_HISTORY
          ),
        }));
        fireBrowserNotifications(triggeredEvents);
        onTriggeredRef.current?.(triggeredEvents);
      }

      return {
        triggeredEvents,
        checkedCount,
        skippedReplayCount,
        detailsByRuleId,
      };
    },
    [persistStore, fireBrowserNotifications]
  );

  const unreadCount = useMemo(
    () => store.history.filter((h) => !h.read).length,
    [store.history]
  );

  const value = useMemo<AlertsContextValue>(
    () => ({
      hydrated,
      rules: store.rules,
      history: store.history,
      settings: store.settings,
      unreadCount,
      browserPermission,
      addRule,
      toggleRuleEnabled,
      deleteRule,
      updateSettings,
      requestBrowserNotificationPermission,
      markAllHistoryRead,
      clearHistory,
      evaluateFeeds,
    }),
    [
      hydrated,
      store.rules,
      store.history,
      store.settings,
      unreadCount,
      browserPermission,
      addRule,
      toggleRuleEnabled,
      deleteRule,
      updateSettings,
      requestBrowserNotificationPermission,
      markAllHistoryRead,
      clearHistory,
      evaluateFeeds,
    ]
  );

  return (
    <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
  );
}

export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) {
    throw new Error("useAlerts must be used inside AlertsProvider");
  }
  return ctx;
}
