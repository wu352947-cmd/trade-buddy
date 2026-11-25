import {
  MARKET_GROUP_LABELS,
  WatchlistGroupsStoreSchema,
  type MarketCategory,
  type WatchlistGroup,
  type WatchlistGroupsStore,
  type WatchlistSummaryItem,
} from "@trade-buddy/shared-types";

export const WATCHLIST_GROUPS_STORAGE_KEY = "trade-buddy:watchlist-groups:v1";

const DEFAULT_MARKET_ORDER: MarketCategory[] = [
  "US",
  "CN",
  "HK",
  "FUTURES_INDEX",
];

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function buildDefaultWatchlistGroups(
  watchlist: WatchlistSummaryItem[],
  defaultMarket: MarketCategory = "US"
): WatchlistGroup[] {
  const orderedMarkets: MarketCategory[] = [
    defaultMarket,
    ...DEFAULT_MARKET_ORDER.filter((m) => m !== defaultMarket),
  ];

  const byMarket: Record<MarketCategory, string[]> = {
    US: [],
    CN: [],
    HK: [],
    FUTURES_INDEX: [],
  };

  for (const item of watchlist) {
    byMarket[item.symbol.market].push(item.symbol.id);
  }

  return orderedMarkets.map((marketKey) => ({
    id: `default-${marketKey.toLowerCase()}`,
    name: MARKET_GROUP_LABELS[marketKey],
    symbolIds: byMarket[marketKey],
    collapsed: false,
    marketKey,
  }));
}

export function createDefaultWatchlistGroupsStore(
  watchlist: WatchlistSummaryItem[],
  defaultMarket: MarketCategory = "US"
): WatchlistGroupsStore {
  return {
    version: 1,
    groups: buildDefaultWatchlistGroups(watchlist, defaultMarket),
    updatedAt: new Date().toISOString(),
  };
}

export function loadWatchlistGroupsStore(
  watchlist: WatchlistSummaryItem[],
  defaultMarket: MarketCategory = "US"
): WatchlistGroupsStore {
  if (typeof window === "undefined") {
    return createDefaultWatchlistGroupsStore(watchlist, defaultMarket);
  }
  try {
    const raw = window.localStorage.getItem(WATCHLIST_GROUPS_STORAGE_KEY);
    if (!raw) {
      return createDefaultWatchlistGroupsStore(watchlist, defaultMarket);
    }
    const parsed = JSON.parse(raw);
    const validated = WatchlistGroupsStoreSchema.safeParse(parsed);
    if (!validated.success) {
      return createDefaultWatchlistGroupsStore(watchlist, defaultMarket);
    }
    const validIds = new Set(watchlist.map((w) => w.symbol.id));
    const cleanedGroups = validated.data.groups.map((g) => ({
      ...g,
      // Deduplicate & keep only valid catalog symbols
      symbolIds: Array.from(
        new Set(g.symbolIds.filter((id) => validIds.has(id)))
      ),
    }));
    return {
      ...validated.data,
      groups: cleanedGroups,
    };
  } catch {
    return createDefaultWatchlistGroupsStore(watchlist, defaultMarket);
  }
}

export function saveWatchlistGroupsStore(store: WatchlistGroupsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WATCHLIST_GROUPS_STORAGE_KEY,
      JSON.stringify(store)
    );
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function createWatchlistGroup(
  groups: WatchlistGroup[],
  name: string,
  initialSymbolIds: string[] = []
): WatchlistGroup[] {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return groups;
  const nextGroup: WatchlistGroup = {
    id: makeId("grp"),
    name: trimmed,
    symbolIds: Array.from(new Set(initialSymbolIds)),
    collapsed: false,
  };
  return [nextGroup, ...groups];
}

export function renameWatchlistGroup(
  groups: WatchlistGroup[],
  groupId: string,
  nextName: string
): WatchlistGroup[] {
  const trimmed = nextName.trim().slice(0, 40);
  if (!trimmed) return groups;
  return groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g));
}

export function deleteWatchlistGroup(
  groups: WatchlistGroup[],
  groupId: string
): WatchlistGroup[] {
  return groups.filter((g) => g.id !== groupId);
}

export function toggleWatchlistGroupCollapsed(
  groups: WatchlistGroup[],
  groupId: string
): WatchlistGroup[] {
  return groups.map((g) =>
    g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
  );
}

export function addSymbolToWatchlistGroup(
  groups: WatchlistGroup[],
  groupId: string,
  symbolId: string
): WatchlistGroup[] {
  return groups.map((g) => {
    if (g.id !== groupId) return g;
    if (g.symbolIds.includes(symbolId)) return g;
    return {
      ...g,
      collapsed: false,
      symbolIds: [...g.symbolIds, symbolId],
    };
  });
}

export function removeSymbolFromWatchlistGroup(
  groups: WatchlistGroup[],
  groupId: string,
  symbolId: string
): WatchlistGroup[] {
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, symbolIds: g.symbolIds.filter((id) => id !== symbolId) }
      : g
  );
}

export function reorderWatchlistGroups(
  groups: WatchlistGroup[],
  sourceGroupId: string,
  targetGroupId: string,
  position: "before" | "after" = "before"
): WatchlistGroup[] {
  if (sourceGroupId === targetGroupId) return groups;
  const fromIdx = groups.findIndex((g) => g.id === sourceGroupId);
  const toIdx = groups.findIndex((g) => g.id === targetGroupId);
  if (fromIdx < 0 || toIdx < 0) return groups;

  const next = [...groups];
  const [moved] = next.splice(fromIdx, 1);
  const adjustedTarget = next.findIndex((g) => g.id === targetGroupId);
  const insertAt = position === "after" ? adjustedTarget + 1 : adjustedTarget;
  next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, moved);
  return next;
}

export function reorderSymbolInWatchlistGroups(
  groups: WatchlistGroup[],
  params: {
    sourceGroupId: string;
    symbolId: string;
    targetGroupId: string;
    targetSymbolId?: string | null;
    position?: "before" | "after";
  }
): WatchlistGroup[] {
  const {
    sourceGroupId,
    symbolId,
    targetGroupId,
    targetSymbolId = null,
    position = "before",
  } = params;

  const sourceGroup = groups.find((g) => g.id === sourceGroupId);
  const targetGroup = groups.find((g) => g.id === targetGroupId);
  if (!sourceGroup || !targetGroup) return groups;
  if (!sourceGroup.symbolIds.includes(symbolId)) return groups;

  if (sourceGroupId === targetGroupId) {
    if (targetSymbolId === symbolId) return groups;
    const filtered = sourceGroup.symbolIds.filter((id) => id !== symbolId);
    let insertIdx = filtered.length;
    if (targetSymbolId) {
      const idx = filtered.indexOf(targetSymbolId);
      if (idx >= 0) {
        insertIdx = position === "after" ? idx + 1 : idx;
      }
    }
    filtered.splice(insertIdx, 0, symbolId);
    return groups.map((g) =>
      g.id === sourceGroupId ? { ...g, symbolIds: filtered } : g
    );
  }

  // Move across groups (deduplicate if target already contains symbol)
  return groups.map((g) => {
    if (g.id === sourceGroupId) {
      return {
        ...g,
        symbolIds: g.symbolIds.filter((id) => id !== symbolId),
      };
    }
    if (g.id === targetGroupId) {
      const withoutDup = g.symbolIds.filter((id) => id !== symbolId);
      let insertIdx = withoutDup.length;
      if (targetSymbolId) {
        const idx = withoutDup.indexOf(targetSymbolId);
        if (idx >= 0) {
          insertIdx = position === "after" ? idx + 1 : idx;
        }
      }
      withoutDup.splice(insertIdx, 0, symbolId);
      return {
        ...g,
        collapsed: false,
        symbolIds: withoutDup,
      };
    }
    return g;
  });
}
