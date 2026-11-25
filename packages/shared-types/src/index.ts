import { z } from "zod";

export const MarketCategorySchema = z.enum([
  "US",
  "CN",
  "HK",
  "FUTURES_INDEX",
]);
export type MarketCategory = z.infer<typeof MarketCategorySchema>;

export const MARKET_GROUP_LABELS: Record<MarketCategory, string> = {
  US: "美股",
  CN: "A 股",
  HK: "港股",
  FUTURES_INDEX: "期货与指数",
};

export const IntervalSchema = z.enum(["60m", "1D", "1W", "1M"]);
export type Interval = z.infer<typeof IntervalSchema>;

export const INTERVAL_LABELS: Record<Interval, string> = {
  "60m": "60分",
  "1D": "日线",
  "1W": "周线",
  "1M": "月线",
};

export const ChartTypeSchema = z.enum([
  "candle_solid",
  "candle_stroke",
  "ohlc",
  "line",
  "area",
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ColorSchemeSchema = z.enum(["intl", "cn"]);
export type ColorScheme = z.infer<typeof ColorSchemeSchema>;

export const ThemeModeSchema = z.enum(["dark", "light"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const ProvenanceKindSchema = z.enum([
  "sample",
  "eod",
  "delayed",
  "proxy",
  "official_fred",
  "live_ref",
]);
export type ProvenanceKind = z.infer<typeof ProvenanceKindSchema>;

export const DataProvenanceSchema = z.object({
  kind: ProvenanceKindSchema,
  badge: z.string(),
  provider: z.string(),
  delayNote: z.string(),
  dateRange: z.string().optional(),
  isSample: z.boolean(),
  isProxy: z.boolean().optional(),
  proxyOf: z.string().optional(),
  delayMinutes: z.number().int().nonnegative().optional(),
  quoteProvider: z.string().optional(),
  cached: z.boolean().optional(),
  stale: z.boolean().optional(),
  fallbackReason: z.string().optional(),
});
export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

export const SymbolMetaSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  name: z.string(),
  nameEn: z.string().optional(),
  market: MarketCategorySchema,
  exchange: z.string(),
  currency: z.string(),
  pricePrecision: z.number().int().min(0).max(6),
  assetType: z.enum(["STOCK", "ETF", "INDEX", "FUTURES_PROXY"]),
  supportedIntervals: z.array(IntervalSchema),
  defaultProvenance: DataProvenanceSchema,
  sector: z.string().optional(),
  description: z.string().optional(),
});
export type SymbolMeta = z.infer<typeof SymbolMetaSchema>;

export const NormalizedBarSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});
export type NormalizedBar = z.infer<typeof NormalizedBarSchema>;

export const NormalizedQuoteSchema = z.object({
  symbolId: z.string(),
  last: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  prevClose: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  high52w: z.number(),
  low52w: z.number(),
  updatedAt: z.string(),
  perf: z.object({
    w1: z.number().optional(),
    m1: z.number().optional(),
    m3: z.number().optional(),
    m6: z.number().optional(),
    y1: z.number().optional(),
  }),
});
export type NormalizedQuote = z.infer<typeof NormalizedQuoteSchema>;

export const WatchlistSummaryItemSchema = z.object({
  symbol: SymbolMetaSchema,
  quote: NormalizedQuoteSchema,
  provenance: DataProvenanceSchema,
});
export type WatchlistSummaryItem = z.infer<typeof WatchlistSummaryItemSchema>;

export const BarsResponseSchema = z.object({
  symbol: SymbolMetaSchema,
  interval: IntervalSchema,
  bars: z.array(NormalizedBarSchema),
  quote: NormalizedQuoteSchema,
  provenance: DataProvenanceSchema,
  fetchedAt: z.string(),
});
export type BarsResponse = z.infer<typeof BarsResponseSchema>;

export const QuoteResponseSchema = z.object({
  symbol: SymbolMetaSchema,
  quote: NormalizedQuoteSchema,
  provenance: DataProvenanceSchema,
  fetchedAt: z.string(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const NewsScopeSchema = z.enum(["symbol", "market"]);
export type NewsScope = z.infer<typeof NewsScopeSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  sourceBadge: z.string(),
  publishedAt: z.string(),
  category: z.string().optional(),
  relatedSymbols: z.array(z.string()).optional(),
  summary: z.string().optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsResponseSchema = z.object({
  scope: NewsScopeSchema,
  symbolId: z.string().optional(),
  items: z.array(NewsItemSchema),
  sources: z.array(z.string()),
  delayNote: z.string(),
  mode: z.enum(["api_key", "public_official", "stale_cache", "empty"]),
  fetchedAt: z.string(),
  warning: z.string().optional(),
  emptyHint: z.string().optional(),
});
export type NewsResponse = z.infer<typeof NewsResponseSchema>;

export const CalendarImportanceSchema = z.enum(["high", "medium", "low"]);
export type CalendarImportance = z.infer<typeof CalendarImportanceSchema>;

export const CalendarEventKindSchema = z.enum(["macro", "earnings", "filing"]);
export type CalendarEventKind = z.infer<typeof CalendarEventKindSchema>;

export const CalendarEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  time: z.string(),
  timezone: z.string().optional(),
  country: z.string(),
  title: z.string(),
  kind: CalendarEventKindSchema,
  importance: CalendarImportanceSchema.optional(),
  previous: z.string().optional(),
  forecast: z.string().optional(),
  actual: z.string().optional(),
  unit: z.string().optional(),
  symbol: z.string().optional(),
  source: z.string(),
  url: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const CalendarResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  symbolId: z.string().optional(),
  events: z.array(CalendarEventSchema),
  sources: z.array(z.string()),
  delayNote: z.string(),
  mode: z.enum(["api_key", "public_official", "stale_cache", "empty"]),
  fetchedAt: z.string(),
  warning: z.string().optional(),
  emptyHint: z.string().optional(),
});
export type CalendarResponse = z.infer<typeof CalendarResponseSchema>;

export type IndicatorId = "MA" | "EMA" | "BOLL" | "VOL" | "RSI" | "MACD";

export interface IndicatorMeta {
  id: IndicatorId;
  name: string;
  shortName: string;
  placement: "main" | "sub";
  description: string;
  defaultParams: string;
}

export const BUILTIN_INDICATORS: IndicatorMeta[] = [
  {
    id: "MA",
    name: "移动平均线 (MA)",
    shortName: "MA",
    placement: "main",
    description: "主图叠加多周期简单移动平均线（5 / 10 / 20 / 60）",
    defaultParams: "5, 10, 20, 60",
  },
  {
    id: "EMA",
    name: "指数移动平均线 (EMA)",
    shortName: "EMA",
    placement: "main",
    description: "主图叠加指数加权移动平均线（6 / 12 / 20）",
    defaultParams: "6, 12, 20",
  },
  {
    id: "BOLL",
    name: "布林带 (BOLL)",
    shortName: "BOLL",
    placement: "main",
    description: "主图叠加布林轨道（20日均线 ± 2倍标准差）",
    defaultParams: "20, 2",
  },
  {
    id: "VOL",
    name: "成交量 (VOL)",
    shortName: "VOL",
    placement: "sub",
    description: "副图成交量柱状图与量能均线（默认开启）",
    defaultParams: "5, 10, 20",
  },
  {
    id: "RSI",
    name: "相对强弱指标 (RSI)",
    shortName: "RSI",
    placement: "sub",
    description: "副图动量震荡指标（6 / 12 / 24）",
    defaultParams: "6, 12, 24",
  },
  {
    id: "MACD",
    name: "平滑异同移动平均线 (MACD)",
    shortName: "MACD",
    placement: "sub",
    description: "副图趋势动量柱与快慢线（12, 26, 9）",
    defaultParams: "12, 26, 9",
  },
];

export type DrawingToolId =
  | "cursor"
  | "trendline"
  | "horizontal"
  | "ray"
  | "channel"
  | "rectangle"
  | "fibonacci"
  | "text"
  | "measure";

export interface DrawnOverlayRecord {
  id: string;
  tool: DrawingToolId;
  label: string;
  klineOverlayName: string;
  createdAt: number;
}

export interface ResearchNote {
  symbolId: string;
  content: string;
  updatedAt: string;
}

export type LayoutMode = "single" | "split_h" | "split_v" | "grid_2x2";

export interface LayoutSyncConfig {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
}

export interface PaneLinkOverrides {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
}

export type ReplaySpeed = 0.5 | 1 | 2 | 5 | 10;

export const REPLAY_SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 5, 10];

export interface ReplaySnapshot {
  active: boolean;
  targetPaneId: string;
  symbolId: string;
  interval: Interval;
  startIndex: number;
  currentIndex: number;
  totalBars: number;
  currentBar: NormalizedBar | null;
  currentTimestamp: number | null;
  isPlaying: boolean;
  speed: ReplaySpeed;
  pickStartMode: boolean;
  syncLinkedPanes: boolean;
}

// === Batch 3B: Screener, Fundamentals & Settings Types ===

export const ScreenerItemSchema = z.object({
  symbol: SymbolMetaSchema,
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  turnover: z.number(),
  ma20: z.number().nullable(),
  ma60: z.number().nullable(),
  aboveMa20: z.boolean().nullable(),
  aboveMa60: z.boolean().nullable(),
  distMa20Pct: z.number().nullable(),
  distMa60Pct: z.number().nullable(),
  high52w: z.number(),
  low52w: z.number(),
  perf: z.object({
    w1: z.number().optional(),
    m1: z.number().optional(),
    m3: z.number().optional(),
    m6: z.number().optional(),
    y1: z.number().optional(),
  }),
  updatedAt: z.string(),
  hasData: z.boolean(),
  provenance: DataProvenanceSchema,
});
export type ScreenerItem = z.infer<typeof ScreenerItemSchema>;

export const ScreenerResponseSchema = z.object({
  items: z.array(ScreenerItemSchema),
  total: z.number().int().nonnegative(),
  cached: z.boolean().optional(),
  fetchedAt: z.string(),
  note: z.string(),
});
export type ScreenerResponse = z.infer<typeof ScreenerResponseSchema>;

export const FundamentalPeriodTypeSchema = z.enum(["annual", "quarterly"]);
export type FundamentalPeriodType = z.infer<typeof FundamentalPeriodTypeSchema>;

export const FundamentalPeriodRowSchema = z.object({
  periodKey: z.string(),
  label: z.string(),
  fiscalYear: z.number().int().optional(),
  fiscalPeriod: z.string(),
  form: z.string(),
  endDate: z.string(),
  filedDate: z.string().optional(),
  revenue: z.number().nullable(),
  netIncome: z.number().nullable(),
  epsDiluted: z.number().nullable(),
  totalAssets: z.number().nullable(),
  totalLiabilities: z.number().nullable(),
  stockholdersEquity: z.number().nullable(),
  sharesOutstanding: z.number().nullable(),
});
export type FundamentalPeriodRow = z.infer<typeof FundamentalPeriodRowSchema>;

export const FundamentalsSummarySchema = z.object({
  latestPeriodLabel: z.string(),
  latestEndDate: z.string(),
  revenue: z.number().nullable(),
  netIncome: z.number().nullable(),
  epsDiluted: z.number().nullable(),
  totalAssets: z.number().nullable(),
  totalLiabilities: z.number().nullable(),
  stockholdersEquity: z.number().nullable(),
  sharesOutstanding: z.number().nullable(),
  netMarginPct: z.number().nullable(),
  debtToAssetPct: z.number().nullable(),
  revenueYoYPct: z.number().nullable(),
  netIncomeYoYPct: z.number().nullable(),
});
export type FundamentalsSummary = z.infer<typeof FundamentalsSummarySchema>;

export const FundamentalsResponseSchema = z.object({
  symbol: SymbolMetaSchema,
  mode: z.enum(["sec_edgar", "api_key", "stale_cache", "unsupported", "error"]),
  source: z.string(),
  sourceBadge: z.string(),
  currency: z.string(),
  cik: z.string().optional(),
  entityName: z.string().optional(),
  secBrowseUrl: z.string().optional(),
  unitNote: z.string(),
  annual: z.array(FundamentalPeriodRowSchema),
  quarterly: z.array(FundamentalPeriodRowSchema),
  summary: FundamentalsSummarySchema.nullable(),
  fetchedAt: z.string(),
  cached: z.boolean().optional(),
  stale: z.boolean().optional(),
  warning: z.string().optional(),
  emptyHint: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type FundamentalsResponse = z.infer<typeof FundamentalsResponseSchema>;

export const DataSourceHealthItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  category: z.enum(["public", "api_key", "local_optional"]),
  requiresKey: z.boolean(),
  configured: z.boolean(),
  enabled: z.boolean(),
  configLabel: z.string(),
  status: z.enum(["online", "failed", "unknown", "disabled"]),
  statusLabel: z.string(),
  lastCheckedAt: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
});
export type DataSourceHealthItem = z.infer<typeof DataSourceHealthItemSchema>;

export const DataSourcesHealthResponseSchema = z.object({
  sources: z.array(DataSourceHealthItemSchema),
  probed: z.boolean(),
  checkedAt: z.string(),
});
export type DataSourcesHealthResponse = z.infer<
  typeof DataSourcesHealthResponseSchema
>;

export const UserPreferencesSchema = z.object({
  theme: ThemeModeSchema,
  colorScheme: ColorSchemeSchema,
  defaultMarket: MarketCategorySchema,
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "dark",
  colorScheme: "intl",
  defaultMarket: "US",
};

// === Batch 3C: Local Virtual Paper Trading Types (1x Spot Only, No Shorting) ===

export const PaperOrderSideSchema = z.enum(["buy", "sell"]);
export type PaperOrderSide = z.infer<typeof PaperOrderSideSchema>;

export const PaperOrderTypeSchema = z.enum(["market", "limit"]);
export type PaperOrderType = z.infer<typeof PaperOrderTypeSchema>;

export const PaperOrderStatusSchema = z.enum(["open", "filled", "canceled"]);
export type PaperOrderStatus = z.infer<typeof PaperOrderStatusSchema>;

export const PaperMatchModeSchema = z.enum(["latest", "replay"]);
export type PaperMatchMode = z.infer<typeof PaperMatchModeSchema>;

export const DEFAULT_PAPER_INITIAL_CASH = 1_000_000;

/**
 * Strict order submission schema:
 * - Hardcodes leverage = 1 (rejects any other value)
 * - Hardcodes allowShort = false (rejects any shorting attempt)
 * - Positive finite quantity required
 * - Limit orders require positive finite limitPrice
 */
export const PaperOrderInputSchema = z
  .object({
    symbolId: z.string().min(1),
    ticker: z.string().min(1),
    symbolName: z.string().min(1),
    currency: z.string().min(1),
    pricePrecision: z.number().int().min(0).max(6).default(2),
    side: PaperOrderSideSchema,
    type: PaperOrderTypeSchema,
    quantity: z.number().finite().positive("数量必须大于 0"),
    limitPrice: z.number().finite().positive("限价必须大于 0").optional(),
    leverage: z.literal(1).default(1),
    allowShort: z.literal(false).default(false),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.type === "limit" && (val.limitPrice === undefined || val.limitPrice <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limitPrice"],
        message: "限价单必须输入大于 0 的委托价格",
      });
    }
  });
export type PaperOrderInput = z.input<typeof PaperOrderInputSchema>;
export type ValidatedPaperOrderInput = z.infer<typeof PaperOrderInputSchema>;

export const PaperPositionSchema = z.object({
  symbolId: z.string(),
  ticker: z.string(),
  symbolName: z.string(),
  currency: z.string(),
  pricePrecision: z.number().int().min(0).max(6),
  quantity: z.number().finite().positive(),
  avgCost: z.number().finite().positive(),
  lastKnownPrice: z.number().finite().positive(),
  updatedAt: z.string(),
});
export type PaperPosition = z.infer<typeof PaperPositionSchema>;

export const PaperOrderSchema = z.object({
  id: z.string(),
  symbolId: z.string(),
  ticker: z.string(),
  symbolName: z.string(),
  currency: z.string(),
  pricePrecision: z.number().int().min(0).max(6),
  side: PaperOrderSideSchema,
  type: PaperOrderTypeSchema,
  quantity: z.number().finite().positive(),
  limitPrice: z.number().finite().positive().optional(),
  status: PaperOrderStatusSchema,
  leverage: z.literal(1),
  allowShort: z.literal(false),
  matchMode: PaperMatchModeSchema,
  createdAt: z.string(),
  createdBarTimestamp: z.number().nullable(),
  lastEvaluatedBarTimestamp: z.number().nullable(),
  filledAt: z.string().optional(),
  filledPrice: z.number().finite().positive().optional(),
  canceledAt: z.string().optional(),
});
export type PaperOrder = z.infer<typeof PaperOrderSchema>;

export const PaperFillSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  symbolId: z.string(),
  ticker: z.string(),
  symbolName: z.string(),
  currency: z.string(),
  pricePrecision: z.number().int().min(0).max(6),
  side: PaperOrderSideSchema,
  type: PaperOrderTypeSchema,
  quantity: z.number().finite().positive(),
  price: z.number().finite().positive(),
  notional: z.number().finite().nonnegative(),
  realizedPnl: z.number().finite().nullable(),
  matchMode: PaperMatchModeSchema,
  barTimestamp: z.number().nullable(),
  barTimeLabel: z.string().optional(),
  filledAt: z.string(),
});
export type PaperFill = z.infer<typeof PaperFillSchema>;

export const PaperAccountSchema = z.object({
  version: z.literal(1),
  isVirtualSimulation: z.literal(true),
  leverage: z.literal(1),
  allowShort: z.literal(false),
  initialCash: z.number().finite().positive(),
  cash: z.number().finite().nonnegative(),
  realizedPnl: z.number().finite(),
  positions: z.array(PaperPositionSchema),
  orders: z.array(PaperOrderSchema),
  fills: z.array(PaperFillSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaperAccount = z.infer<typeof PaperAccountSchema>;
