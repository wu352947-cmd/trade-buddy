/**
 * Trade Buddy — 服务端免费档限流器、退避冷却与带 Stale 回退的内存缓存
 * 仅在 Next.js 服务端 Route Handler / Server Component 中运行。
 */

export type ProviderKey =
  | "twelvedata"
  | "polygon"
  | "finnhub"
  | "eodhd"
  | "tushare"
  | "fred"
  | "sec_edgar"
  | "public_rss"
  | "public_calendar"
  | "baostock";

interface RateLimitRule {
  maxPerMinute: number;
  maxPerDay?: number;
  minIntervalMs: number;
}

const PROVIDER_RULES: Record<ProviderKey, RateLimitRule> = {
  // Twelve Data Free: 8/min, 800/day -> 保守限流避免触发配额封禁
  twelvedata: { maxPerMinute: 7, maxPerDay: 750, minIntervalMs: 1200 },
  // Polygon Stocks Free: 5/min
  polygon: { maxPerMinute: 4, minIntervalMs: 12500 },
  // Finnhub Free: 60/min
  finnhub: { maxPerMinute: 45, minIntervalMs: 250 },
  // EODHD Free: 20/day
  eodhd: { maxPerMinute: 4, maxPerDay: 18, minIntervalMs: 2500 },
  // Tushare Pro 个人账号保守间隔
  tushare: { maxPerMinute: 25, minIntervalMs: 1000 },
  // FRED 官方公开 CSV
  fred: { maxPerMinute: 24, minIntervalMs: 500 },
  // SEC EDGAR 要求 <= 10 req/s，保守限流 4 req/s
  sec_edgar: { maxPerMinute: 40, minIntervalMs: 300 },
  // 官方公开 RSS
  public_rss: { maxPerMinute: 24, minIntervalMs: 400 },
  // 官方公开 iCal/日历
  public_calendar: { maxPerMinute: 16, minIntervalMs: 600 },
  // 本地可选 Baostock Python 子进程
  baostock: { maxPerMinute: 8, minIntervalMs: 1500 },
};

interface ProviderState {
  minuteTimestamps: number[];
  dayKey: string;
  dayCount: number;
  lastRequestAt: number;
  cooldownUntil: number;
  consecutiveRateLimits: number;
  lastError?: string;
}

const providerStates = new Map<ProviderKey, ProviderState>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrInitState(provider: ProviderKey): ProviderState {
  let st = providerStates.get(provider);
  const today = todayKey();
  if (!st) {
    st = {
      minuteTimestamps: [],
      dayKey: today,
      dayCount: 0,
      lastRequestAt: 0,
      cooldownUntil: 0,
      consecutiveRateLimits: 0,
    };
    providerStates.set(provider, st);
  } else if (st.dayKey !== today) {
    st.dayKey = today;
    st.dayCount = 0;
  }
  return st;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 检查某数据源当前是否允许发起请求；若允许则立即占用一次配额。
 */
export function tryAcquireQuota(provider: ProviderKey): QuotaCheckResult {
  const rule = PROVIDER_RULES[provider];
  const st = getOrInitState(provider);
  const now = Date.now();

  if (st.cooldownUntil > now) {
    const secLeft = Math.ceil((st.cooldownUntil - now) / 1000);
    return {
      allowed: false,
      reason: `触发退避冷却（剩余约 ${secLeft} 秒）`,
    };
  }

  if (now - st.lastRequestAt < rule.minIntervalMs) {
    return {
      allowed: false,
      reason: "触发请求最小间隔保护",
    };
  }

  const oneMinAgo = now - 60_000;
  st.minuteTimestamps = st.minuteTimestamps.filter((ts) => ts > oneMinAgo);

  if (st.minuteTimestamps.length >= rule.maxPerMinute) {
    return {
      allowed: false,
      reason: `达到分钟配额上限（${rule.maxPerMinute}/分）`,
    };
  }

  if (rule.maxPerDay && st.dayCount >= rule.maxPerDay) {
    return {
      allowed: false,
      reason: `达到每日免费配额上限（${rule.maxPerDay}/天）`,
    };
  }

  st.minuteTimestamps.push(now);
  st.dayCount += 1;
  st.lastRequestAt = now;
  return { allowed: true };
}

/**
 * 遇到 HTTP 429 或明确限流响应时，记录指数退避冷却。
 */
export function recordRateLimitBackoff(
  provider: ProviderKey,
  retryAfterSeconds?: number
): void {
  const st = getOrInitState(provider);
  st.consecutiveRateLimits += 1;
  const baseSec = retryAfterSeconds && retryAfterSeconds > 0
    ? retryAfterSeconds
    : Math.min(600, 60 * Math.pow(2, st.consecutiveRateLimits - 1));
  st.cooldownUntil = Date.now() + baseSec * 1000;
  st.lastError = `HTTP 429 限流退避 ${baseSec}s`;
}

/**
 * 遇到网络错误或 5xx 时，记录短暂冷却（默认 20s）避免重复雪崩请求。
 */
export function recordTransientFailure(
  provider: ProviderKey,
  errorLabel: string,
  cooldownSec = 20
): void {
  const st = getOrInitState(provider);
  st.cooldownUntil = Math.max(st.cooldownUntil, Date.now() + cooldownSec * 1000);
  st.lastError = errorLabel;
}

export function recordProviderSuccess(provider: ProviderKey): void {
  const st = getOrInitState(provider);
  st.consecutiveRateLimits = 0;
  st.lastError = undefined;
}

export interface StaleCacheEntry<T> {
  value: T;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
}

/**
 * 支持 Fresh + Stale-If-Error 回退的轻量内存缓存
 */
export class StaleCache<T> {
  private map = new Map<string, StaleCacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries = 300) {
    this.maxEntries = maxEntries;
  }

  getFresh(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.freshUntil > Date.now()) {
      return entry.value;
    }
    return null;
  }

  getStale(key: string): { value: T; ageMinutes: number } | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (entry.staleUntil > now) {
      return {
        value: entry.value,
        ageMinutes: Math.max(1, Math.round((now - entry.storedAt) / 60_000)),
      };
    }
    this.map.delete(key);
    return null;
  }

  set(
    key: string,
    value: T,
    freshTtlMs: number,
    staleTtlMs: number = 6 * 60 * 60 * 1000
  ): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey) this.map.delete(oldestKey);
    }
    const now = Date.now();
    this.map.set(key, {
      value,
      storedAt: now,
      freshUntil: now + freshTtlMs,
      staleUntil: now + Math.max(freshTtlMs, staleTtlMs),
    });
  }
}

export const DEFAULT_SEC_USER_AGENT =
  "TradeBuddy/0.2 (local-research; contact: trade-buddy-local@example.com)";

export function getSecUserAgent(): string {
  const custom = process.env.SEC_EDGAR_USER_AGENT?.trim();
  return custom && custom.length >= 8 ? custom : DEFAULT_SEC_USER_AGENT;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "TradeBuddy/0.2 (local-research)",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}
