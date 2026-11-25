import {
  DEFAULT_USER_PREFERENCES,
  MarketCategorySchema,
  ColorSchemeSchema,
  ThemeModeSchema,
  type MarketCategory,
  type UserPreferences,
} from "@trade-buddy/shared-types";

export const PREFERENCES_STORAGE_KEY = "trade-buddy:preferences:v1";

export const DEFAULT_SYMBOL_BY_MARKET: Record<MarketCategory, string> = {
  US: "US:AAPL",
  CN: "CN:600519.SH",
  HK: "HK:00700.HK",
  FUTURES_INDEX: "IDX:QQQ",
};

export function loadUserPreferences(): UserPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_USER_PREFERENCES;
  }
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    const theme = ThemeModeSchema.safeParse(parsed.theme);
    const colorScheme = ColorSchemeSchema.safeParse(parsed.colorScheme);
    const defaultMarket = MarketCategorySchema.safeParse(parsed.defaultMarket);
    return {
      theme: theme.success ? theme.data : DEFAULT_USER_PREFERENCES.theme,
      colorScheme: colorScheme.success
        ? colorScheme.data
        : DEFAULT_USER_PREFERENCES.colorScheme,
      defaultMarket: defaultMarket.success
        ? defaultMarket.data
        : DEFAULT_USER_PREFERENCES.defaultMarket,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function patchUserPreferences(
  patch: Partial<UserPreferences>
): UserPreferences {
  const next: UserPreferences = {
    ...loadUserPreferences(),
    ...patch,
  };
  saveUserPreferences(next);
  applyDocumentPreferences(next);
  return next;
}

export function applyDocumentPreferences(
  prefs: Pick<UserPreferences, "theme" | "colorScheme">
): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", prefs.theme);
  document.documentElement.setAttribute("data-color-scheme", prefs.colorScheme);
}
