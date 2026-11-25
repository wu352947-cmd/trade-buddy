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

export const PaperSettingsSchema = z.object({
  /** Commission rate in percentage of notional (e.g., 0.1 means 0.1%) */
  feeRatePct: z.number().finite().min(0).max(5).default(0.1),
  /** Minimum fee charged per executed fill (in virtual account currency) */
  minFee: z.number().finite().min(0).max(10_000).default(0),
  /** Slippage rate in percentage of reference price (e.g., 0.05 means 0.05%) */
  slippagePct: z.number().finite().min(0).max(5).default(0.05),
  /** Toggle visibility of paper trading overlays on KLineChart */
  showChartMarkers: z.boolean().default(true),
});
export type PaperSettings = z.infer<typeof PaperSettingsSchema>;

export const DEFAULT_PAPER_SETTINGS: PaperSettings = {
  feeRatePct: 0.1,
  minFee: 0,
  slippagePct: 0.05,
  showChartMarkers: true,
};

export const PaperEquityReasonSchema = z.enum(["init", "fill", "mark"]);
export type PaperEquityReason = z.infer<typeof PaperEquityReasonSchema>;

export const PaperEquityPointSchema = z.object({
  timestamp: z.number().finite(),
  recordedAt: z.string(),
  equity: z.number().finite(),
  cash: z.number().finite(),
  marketValue: z.number().finite(),
  realizedPnl: z.number().finite(),
  totalFees: z.number().finite().nonnegative().default(0),
  reason: PaperEquityReasonSchema,
  label: z.string().optional(),
});
export type PaperEquityPoint = z.infer<typeof PaperEquityPointSchema>;

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
  referencePrice: z.number().finite().positive().optional(),
  slippagePct: z.number().finite().nonnegative().default(0),
  notional: z.number().finite().nonnegative(),
  fee: z.number().finite().nonnegative().default(0),
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
  totalFees: z.number().finite().nonnegative().default(0),
  settings: PaperSettingsSchema.default(DEFAULT_PAPER_SETTINGS),
  positions: z.array(PaperPositionSchema),
  orders: z.array(PaperOrderSchema),
  fills: z.array(PaperFillSchema),
  equityCurve: z.array(PaperEquityPointSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaperAccount = z.infer<typeof PaperAccountSchema>;

// === Batch 4B: Custom Watchlist Groups, Workspace Templates & Local Alerts ===

export const IndicatorIdSchema = z.enum(["MA", "EMA", "BOLL", "VOL", "RSI", "MACD"]);

export const DrawingToolIdSchema = z.enum([
  "cursor",
  "trendline",
  "horizontal",
  "ray",
  "channel",
  "rectangle",
  "fibonacci",
  "text",
  "measure",
]);

export const LayoutModeSchema = z.enum([
  "single",
  "split_h",
  "split_v",
  "grid_2x2",
]);

export const PaneIdSchema = z.enum(["pane-1", "pane-2", "pane-3", "pane-4"]);
export type PaneId = z.infer<typeof PaneIdSchema>;

export const LayoutSyncConfigSchema = z.object({
  symbol: z.boolean(),
  interval: z.boolean(),
  crosshair: z.boolean(),
});

export const PaneLinkOverridesSchema = z.object({
  symbol: z.boolean(),
  interval: z.boolean(),
  crosshair: z.boolean(),
});

// --- B1: Custom Watchlist Groups ---

export const WatchlistGroupSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  symbolIds: z.array(z.string().min(1)),
  collapsed: z.boolean().default(false),
  marketKey: MarketCategorySchema.optional(),
});
export type WatchlistGroup = z.infer<typeof WatchlistGroupSchema>;

export const WatchlistGroupsStoreSchema = z.object({
  version: z.literal(1),
  groups: z.array(WatchlistGroupSchema),
  updatedAt: z.string(),
});
export type WatchlistGroupsStore = z.infer<typeof WatchlistGroupsStoreSchema>;

// --- B2: Workspace Templates ---

export const TemplateDrawingPointSchema = z.object({
  timestamp: z.number().finite().optional(),
  value: z.number().finite().optional(),
});
export type TemplateDrawingPoint = z.infer<typeof TemplateDrawingPointSchema>;

export const TemplateDrawingSchema = z.object({
  id: z.string().min(1),
  tool: DrawingToolIdSchema,
  label: z.string().max(120),
  klineOverlayName: z.string().min(1).max(64),
  points: z.array(TemplateDrawingPointSchema),
  annotationText: z.string().max(160).optional(),
  measurePricePrecision: z.number().int().min(0).max(6).optional(),
  measureInterval: IntervalSchema.optional(),
  createdAt: z.number().finite(),
});
export type TemplateDrawing = z.infer<typeof TemplateDrawingSchema>;

export const TemplatePaneSnapshotSchema = z.object({
  paneId: PaneIdSchema,
  initialized: z.boolean(),
  symbolId: z.string().min(1),
  interval: IntervalSchema,
  chartType: ChartTypeSchema,
  activeIndicators: z.array(IndicatorIdSchema),
  drawings: z.array(TemplateDrawingSchema).default([]),
  links: PaneLinkOverridesSchema,
});
export type TemplatePaneSnapshot = z.infer<typeof TemplatePaneSnapshotSchema>;

export const WorkspaceTemplateSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  schemaVersion: z.literal(1),
  layout: LayoutModeSchema,
  activePaneId: PaneIdSchema,
  syncConfig: LayoutSyncConfigSchema,
  panes: z.array(TemplatePaneSnapshotSchema).min(1).max(4),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceTemplate = z.infer<typeof WorkspaceTemplateSchema>;

export const WorkspaceTemplateExportSingleSchema = z.object({
  app: z.literal("trade-buddy"),
  kind: z.literal("workspace_template"),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  template: WorkspaceTemplateSchema,
});
export type WorkspaceTemplateExportSingle = z.infer<
  typeof WorkspaceTemplateExportSingleSchema
>;

export const WorkspaceTemplateExportBundleSchema = z.object({
  app: z.literal("trade-buddy"),
  kind: z.literal("workspace_templates"),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  templates: z.array(WorkspaceTemplateSchema).min(1),
});
export type WorkspaceTemplateExportBundle = z.infer<
  typeof WorkspaceTemplateExportBundleSchema
>;

export const WorkspaceTemplatesStoreSchema = z.object({
  version: z.literal(1),
  activeTemplateId: z.string().nullable().default(null),
  templates: z.array(WorkspaceTemplateSchema),
  updatedAt: z.string(),
});
export type WorkspaceTemplatesStore = z.infer<
  typeof WorkspaceTemplatesStoreSchema
>;

// --- B3: Local Alerts ---

export const AlertConditionTypeSchema = z.enum([
  "price_cross_above",
  "price_cross_below",
  "change_pct_up",
  "change_pct_down",
  "change_pct_abs",
  "ma_golden_cross",
  "ma_death_cross",
  "rsi_above",
  "rsi_below",
]);
export type AlertConditionType = z.infer<typeof AlertConditionTypeSchema>;

export const ALERT_CONDITION_LABELS: Record<AlertConditionType, string> = {
  price_cross_above: "价格上穿",
  price_cross_below: "价格下穿",
  change_pct_up: "涨幅达到阈值",
  change_pct_down: "跌幅达到阈值",
  change_pct_abs: "涨跌幅波动达到阈值",
  ma_golden_cross: "均线金叉",
  ma_death_cross: "均线死叉",
  rsi_above: "RSI 高于阈值",
  rsi_below: "RSI 低于阈值",
};

export const AlertFrequencySchema = z.enum(["once", "once_per_bar"]);
export type AlertFrequency = z.infer<typeof AlertFrequencySchema>;

export const LocalAlertRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(80).optional(),
  symbolId: z.string().min(1),
  ticker: z.string().min(1),
  symbolName: z.string().min(1),
  pricePrecision: z.number().int().min(0).max(6).default(2),
  interval: IntervalSchema,
  condition: AlertConditionTypeSchema,
  threshold: z.number().finite().optional(),
  maFastPeriod: z.number().int().min(2).max(250).optional(),
  maSlowPeriod: z.number().int().min(3).max(500).optional(),
  rsiPeriod: z.number().int().min(2).max(100).optional(),
  frequency: AlertFrequencySchema.default("once"),
  enabled: z.boolean().default(true),
  note: z.string().max(160).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  triggeredCount: z.number().int().nonnegative().default(0),
  lastTriggeredAt: z.string().nullable().default(null),
  lastTriggeredBarTimestamp: z.number().finite().nullable().default(null),
});
export type LocalAlertRule = z.infer<typeof LocalAlertRuleSchema>;

export const AlertTriggerEventSchema = z.object({
  id: z.string().min(1),
  alertId: z.string().min(1),
  symbolId: z.string().min(1),
  ticker: z.string().min(1),
  symbolName: z.string().min(1),
  interval: IntervalSchema,
  condition: AlertConditionTypeSchema,
  title: z.string(),
  message: z.string(),
  triggerValue: z.number().finite(),
  barTimestamp: z.number().finite().nullable(),
  sourceMode: z.enum(["latest", "replay", "manual_check"]),
  triggeredAt: z.string(),
  read: z.boolean().default(false),
});
export type AlertTriggerEvent = z.infer<typeof AlertTriggerEventSchema>;

export const LocalAlertsSettingsSchema = z.object({
  browserNotificationEnabled: z.boolean().default(false),
  triggerInReplayMode: z.boolean().default(false),
  showChartLines: z.boolean().default(true),
});
export type LocalAlertsSettings = z.infer<typeof LocalAlertsSettingsSchema>;

export const DEFAULT_LOCAL_ALERTS_SETTINGS: LocalAlertsSettings = {
  browserNotificationEnabled: false,
  triggerInReplayMode: false,
  showChartLines: true,
};

export const LocalAlertsStoreSchema = z.object({
  version: z.literal(1),
  rules: z.array(LocalAlertRuleSchema),
  history: z.array(AlertTriggerEventSchema),
  settings: LocalAlertsSettingsSchema.default(DEFAULT_LOCAL_ALERTS_SETTINGS),
  updatedAt: z.string(),
});
export type LocalAlertsStore = z.infer<typeof LocalAlertsStoreSchema>;

// === Batch 4C: Educational Backtest Sandbox Types (1x Spot Only, No Shorting, No Lookahead) ===

export const BacktestStrategyTypeSchema = z.enum([
  "ma_cross",
  "bollinger",
  "rsi",
]);
export type BacktestStrategyType = z.infer<typeof BacktestStrategyTypeSchema>;

export const BacktestBollingerSellTargetSchema = z.enum(["middle", "upper"]);
export type BacktestBollingerSellTarget = z.infer<
  typeof BacktestBollingerSellTargetSchema
>;

export const BacktestStrategyConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ma_cross"),
    fastPeriod: z.number().int().min(2).max(200).default(5),
    slowPeriod: z.number().int().min(3).max(400).default(20),
  }),
  z.object({
    type: z.literal("bollinger"),
    period: z.number().int().min(2).max(200).default(20),
    stdDevMultiplier: z.number().finite().min(0.5).max(5).default(2),
    sellTarget: BacktestBollingerSellTargetSchema.default("middle"),
  }),
  z.object({
    type: z.literal("rsi"),
    period: z.number().int().min(2).max(100).default(14),
    oversold: z.number().finite().min(1).max(49).default(30),
    overbought: z.number().finite().min(51).max(99).default(70),
  }),
]);
export type BacktestStrategyConfig = z.infer<
  typeof BacktestStrategyConfigSchema
>;

export const BacktestPositionSizingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("full"),
  }),
  z.object({
    mode: z.literal("fixed_ratio"),
    ratioPct: z.number().finite().min(1).max(100).default(50),
  }),
]);
export type BacktestPositionSizing = z.infer<
  typeof BacktestPositionSizingSchema
>;

export interface BacktestRunParams {
  bars: NormalizedBar[];
  strategy: BacktestStrategyConfig;
  initialCash: number;
  /** Commission rate in percentage of notional (e.g., 0.1 = 0.1%) */
  feeRatePct: number;
  /** Minimum fee per trade in account currency */
  minFee?: number;
  /** Slippage rate in percentage of execution open price (e.g., 0.05 = 0.05%) */
  slippagePct: number;
  /** Position sizing rule (always 1x spot, never exceeds available cash) */
  positionSizing?: BacktestPositionSizing;
  /** Allow fractional units (default false: integer shares/units) */
  allowFractionalShares?: boolean;
  /** Hard-coded safety invariants: 1x spot only, no shorting */
  leverage?: 1;
  allowShort?: false;
}

export interface BacktestTrade {
  id: string;
  side: "buy" | "sell";
  /** Bar index where the signal was generated (using data <= signalBarIndex) */
  signalBarIndex: number;
  signalTimestamp: number;
  /** Bar index where the order actually filled (strictly signalBarIndex + 1 open) */
  barIndex: number;
  timestamp: number;
  /** Raw open price of barIndex before slippage */
  openPrice: number;
  /** Execution price after slippage: buy = open*(1+s), sell = open*(1-s) */
  price: number;
  quantity: number;
  notional: number;
  fee: number;
  /** Net realized PnL after both buy and sell fees (non-null on sell trades) */
  realizedPnl: number | null;
  /** Round-trip return % relative to total buy cost (non-null on sell trades) */
  returnPct: number | null;
  cashAfter: number;
  reason: string;
}

export interface BacktestEquityPoint {
  barIndex: number;
  timestamp: number;
  close: number;
  equity: number;
  cash: number;
  positionValue: number;
  shares: number;
  drawdownPct: number;
  benchmarkEquity: number;
  benchmarkDrawdownPct: number;
}

export interface BacktestSummary {
  initialCash: number;
  finalEquity: number;
  totalPnl: number;
  totalReturnPct: number;
  annualizedReturnPct: number | null;
  maxDrawdownAmount: number;
  maxDrawdownPct: number;
  benchmarkFinalEquity: number;
  benchmarkReturnPct: number;
  benchmarkMaxDrawdownPct: number;
  benchmarkFees: number;
  excessReturnPct: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  closedRoundTrips: number;
  winningTrips: number;
  losingTrips: number;
  breakevenTrips: number;
  winRatePct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitLossRatio: number | null;
  totalFees: number;
  hasOpenPositionAtEnd: boolean;
  endingShares: number;
  endingCash: number;
  barCount: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
}

export interface BacktestUnexecutedSignal {
  side: "buy" | "sell";
  barIndex: number;
  timestamp: number;
  reason: string;
}

export interface BacktestResult {
  strategy: BacktestStrategyConfig;
  initialCash: number;
  feeRatePct: number;
  minFee: number;
  slippagePct: number;
  positionSizing: BacktestPositionSizing;
  allowFractionalShares: boolean;
  leverage: 1;
  allowShort: false;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
  summary: BacktestSummary;
  unexecutedLastSignal: BacktestUnexecutedSignal | null;
}
