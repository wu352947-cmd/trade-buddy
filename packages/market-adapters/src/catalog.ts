import type { SymbolMeta } from "@trade-buddy/shared-types";

export const SYMBOL_CATALOG: SymbolMeta[] = [
  // === 美股 (US) ===
  {
    id: "US:AAPL",
    ticker: "AAPL",
    name: "苹果",
    nameEn: "Apple Inc.",
    market: "US",
    exchange: "NASDAQ",
    currency: "USD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["60m", "1D", "1W", "1M"],
    sector: "消费电子 / 科技",
    description: "全球消费电子与生态平台龙头（纳斯达克上市）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线/60m",
      provider: "EODHD & Twelve Data 官方 Demo 历史样本",
      delayNote: "本地捆绑真实历史数据（非实时）；可配置免费 API Key 获取更新",
      isSample: true,
    },
  },
  {
    id: "US:MSFT",
    ticker: "MSFT",
    name: "微软",
    nameEn: "Microsoft Corp.",
    market: "US",
    exchange: "NASDAQ",
    currency: "USD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "企业软件 / 云计算",
    description: "全球企业软件、Azure 云服务与 AI 基础设施龙头",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "EODHD 官方 Demo 历史样本",
      delayNote: "本地捆绑真实历史日线（非实时）；配置免费 Key 后可更新",
      isSample: true,
    },
  },
  {
    id: "US:TSLA",
    ticker: "TSLA",
    name: "特斯拉",
    nameEn: "Tesla Inc.",
    market: "US",
    exchange: "NASDAQ",
    currency: "USD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "新能源汽车 / 储能",
    description: "电动车、储能系统与自动驾驶研发企业",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "EODHD 官方 Demo 历史样本",
      delayNote: "本地捆绑真实历史日线（非实时）；配置免费 Key 后可更新",
      isSample: true,
    },
  },
  {
    id: "US:AMZN",
    ticker: "AMZN",
    name: "亚马逊",
    nameEn: "Amazon.com Inc.",
    market: "US",
    exchange: "NASDAQ",
    currency: "USD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "电商零售 / 云计算",
    description: "全球零售电商与 AWS 云服务提供商",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "EODHD 官方 Demo 历史样本",
      delayNote: "本地捆绑真实历史日线（非实时）；配置免费 Key 后可更新",
      isSample: true,
    },
  },

  // === A 股 (CN) ===
  {
    id: "CN:600519.SH",
    ticker: "600519",
    name: "贵州茅台",
    nameEn: "Kweichow Moutai",
    market: "CN",
    exchange: "SSE",
    currency: "CNY",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "食品饮料 / 白酒",
    description: "中国高端酱香型白酒龙头企业（上交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "Tushare 历史归档样本（开源数据集）",
      delayNote: "本地捆绑真实历史日线；配置 TUSHARE_TOKEN 可拉取最新收盘日线",
      isSample: true,
    },
  },
  {
    id: "CN:000001.SZ",
    ticker: "000001",
    name: "平安银行",
    nameEn: "Ping An Bank",
    market: "CN",
    exchange: "SZSE",
    currency: "CNY",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "金融 / 商业银行",
    description: "全国性股份制商业银行（深交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "Tushare 历史归档样本（开源数据集）",
      delayNote: "本地捆绑真实历史日线；配置 TUSHARE_TOKEN 可拉取最新收盘日线",
      isSample: true,
    },
  },
  {
    id: "CN:600036.SH",
    ticker: "600036",
    name: "招商银行",
    nameEn: "China Merchants Bank",
    market: "CN",
    exchange: "SSE",
    currency: "CNY",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "金融 / 零售银行",
    description: "中国领先零售商业银行（上交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "Tushare 历史归档样本（开源数据集）",
      delayNote: "本地捆绑真实历史日线；配置 TUSHARE_TOKEN 可拉取最新收盘日线",
      isSample: true,
    },
  },

  // === 港股 (HK) ===
  {
    id: "HK:00700.HK",
    ticker: "00700",
    name: "腾讯控股",
    nameEn: "Tencent Holdings",
    market: "HK",
    exchange: "HKEX",
    currency: "HKD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "互联网 / 游戏与社交",
    description: "中国领先互联网社交、游戏及云服务科技公司（港交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "HKEX 历史归档样本（开源数据集）",
      delayNote: "港股免费档仅提供收盘日线历史样本；配置 EODHD_API_KEY 可更新 EOD",
      isSample: true,
    },
  },
  {
    id: "HK:09988.HK",
    ticker: "09988",
    name: "阿里巴巴-W",
    nameEn: "Alibaba Group",
    market: "HK",
    exchange: "HKEX",
    currency: "HKD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "互联网 / 电子商务",
    description: "综合电商、云计算与数字商业基础设施集团（港交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "HKEX 历史归档样本（开源数据集）",
      delayNote: "港股免费档仅提供收盘日线历史样本；配置 EODHD_API_KEY 可更新 EOD",
      isSample: true,
    },
  },
  {
    id: "HK:03690.HK",
    ticker: "03690",
    name: "美团-W",
    nameEn: "Meituan",
    market: "HK",
    exchange: "HKEX",
    currency: "HKD",
    pricePrecision: 2,
    assetType: "STOCK",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "互联网 / 本地生活",
    description: "科技零售与本地生活服务平台（港交所主板）",
    defaultProvenance: {
      kind: "sample",
      badge: "历史样本 · 日线 EOD",
      provider: "HKEX 历史归档样本（开源数据集）",
      delayNote: "港股免费档仅提供收盘日线历史样本；配置 EODHD_API_KEY 可更新 EOD",
      isSample: true,
    },
  },

  // === 期货与指数 (FUTURES_INDEX) ===
  {
    id: "IDX:QQQ",
    ticker: "QQQ",
    name: "纳指100 ETF 代理",
    nameEn: "Invesco QQQ Trust (NDX/NQ Proxy)",
    market: "FUTURES_INDEX",
    exchange: "NASDAQ",
    currency: "USD",
    pricePrecision: 2,
    assetType: "FUTURES_PROXY",
    supportedIntervals: ["60m", "1D", "1W", "1M"],
    sector: "股指 ETF 代理",
    description: "跟踪纳斯达克 100 指数，作为免费档研究 NQ 期指与科技大盘的合法 ETF 代理",
    defaultProvenance: {
      kind: "proxy",
      badge: "ETF代理 · 样本",
      provider: "Twelve Data 官方 Demo 历史样本",
      delayNote: "以 QQQ ETF 作为纳指100/NQ 代理研究（非 CME 实时期货合约）",
      isSample: true,
      isProxy: true,
      proxyOf: "纳斯达克 100 / NQ 期货代理",
    },
  },
  {
    id: "IDX:VTI",
    ticker: "VTI",
    name: "美股全市场 ETF 代理",
    nameEn: "Vanguard Total Stock Market ETF",
    market: "FUTURES_INDEX",
    exchange: "NYSE Arca",
    currency: "USD",
    pricePrecision: 2,
    assetType: "FUTURES_PROXY",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "宽基指数 ETF 代理",
    description: "覆盖美股全市场大中小盘的宽基 ETF 代理标的",
    defaultProvenance: {
      kind: "proxy",
      badge: "ETF代理 · 样本",
      provider: "EODHD 官方 Demo 历史样本",
      delayNote: "以 VTI ETF 作为美股宽基大盘代理研究（非期货实时流）",
      isSample: true,
      isProxy: true,
      proxyOf: "CRSP 美国全市场指数",
    },
  },
  {
    id: "IDX:SP500",
    ticker: "SP500",
    name: "标普 500 指数",
    nameEn: "S&P 500 Index (FRED Official)",
    market: "FUTURES_INDEX",
    exchange: "FRED / US",
    currency: "USD",
    pricePrecision: 2,
    assetType: "INDEX",
    supportedIntervals: ["1D", "1W", "1M"],
    sector: "全球核心股指",
    description: "美国 500 家核心大盘股基准指数（美联储 FRED 官方收盘序列，免 Key 可在线刷新）",
    defaultProvenance: {
      kind: "official_fred",
      badge: "FRED 官方日线",
      provider: "FRED 美联储官方公开收盘指数",
      delayNote: "官方滞后 1 交易日收盘序列（仅含收盘指数，无成交量，失败自动回退本地样本）",
      isSample: false,
    },
  },
];

export const DEFAULT_SYMBOL_ID = "US:AAPL";

export function getSymbolById(id: string): SymbolMeta | undefined {
  return SYMBOL_CATALOG.find(
    (item) =>
      item.id.toUpperCase() === id.toUpperCase() ||
      item.ticker.toUpperCase() === id.toUpperCase()
  );
}

export function searchCatalog(query: string, market?: string): SymbolMeta[] {
  const q = query.trim().toLowerCase();
  return SYMBOL_CATALOG.filter((s) => {
    if (market && market !== "ALL" && s.market !== market) return false;
    if (!q) return true;
    return (
      s.ticker.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.nameEn?.toLowerCase().includes(q) ?? false) ||
      (s.sector?.toLowerCase().includes(q) ?? false)
    );
  });
}
