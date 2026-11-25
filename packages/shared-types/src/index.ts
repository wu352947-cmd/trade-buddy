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
