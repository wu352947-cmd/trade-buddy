# Trade Buddy — 本地版实现说明（IMPLEMENTATION）

本文档记录 Trade Buddy **第一批 + 第二批**本地可运行看盘终端的完整实现架构、数据源行为、公开源清单与已知边界（纯本地运行，不上服务器，无 Docker/Caddy，无登录鉴权）。

---

## 1. 技术栈与目录结构

- **前端框架**：Next.js 15（App Router）+ React 19 + TypeScript 5 + Tailwind CSS v4
- **图表引擎**：`klinecharts` v10.1.1（Apache 2.0 开源许可，客户端动态导入）
- **数据校验**：Zod v3
- **工程组织**：pnpm / npm 兼容 Workspace Monorepo

```text
trade-buddy/
├── apps/web/
│   └── src/
│       ├── app/
│       │   ├── api/
│       │   │   ├── bars/route.ts         # K 线 + 报价 + 数据来源 Route Handler
│       │   │   ├── quote/route.ts        # 独立最新参考报价 Route Handler（第二批新增）
│       │   │   ├── symbols/route.ts      # 品种搜索、自选摘要与非敏感 env 状态
│       │   │   ├── news/route.ts         # 财经资讯流服务端代理与 RSS/SEC 解析（第二批新增）
│       │   │   └── calendar/route.ts     # 宏观经济与财报日历服务端代理（第二批新增）
│       │   ├── page.tsx                  # 根路由直接进入工作区
│       │   └── chart/page.tsx
│       └── components/
│           ├── chart/KLineChartStage.tsx # KLineChart v10 封装、tbRect 与 tbMeasure 测距尺 Overlay
│           ├── workspace/                # TopBar, LeftDrawingBar, RightIconRail, BottomDock, TerminalWorkspace
│           ├── panels/
│           │   ├── WatchlistAndDetails.tsx
│           │   ├── DataWindowAndTree.tsx
│           │   ├── NewsFlowPanel.tsx          # 财经资讯流面板（第二批新增）
│           │   └── EconomicCalendarPanel.tsx  # 宏观与财报日历面板（第二批新增）
│           └── dialogs/                  # SymbolSearchModal, IndicatorModal
├── packages/
│   ├── shared-types/                     # Zod Schema 与共享类型（新增 Quote/News/Calendar 类型）
│   ├── ui-tokens/                        # 原创 Logo、几何图标（新增 Refresh/ExternalLink）、Tokens
│   └── market-adapters/
│       ├── src/
│       │   ├── cache-limiter.ts          # 按源限流器、429 指数退避、Fresh+Stale 内存缓存（第二批新增）
│       │   ├── catalog.ts                # 14 个核心品种（含 FRED NASDAQCOM）与 SEC CIK 映射
│       │   ├── providers.ts              # 统一行情与报价适配（TwelveData/Polygon/Finnhub/EODHD/Tushare/FRED/Baostock）
│       │   ├── news.ts                   # Finnhub/Polygon 新闻 + SEC EDGAR/美联储/BLS/SEC 官方 RSS（第二批新增）
│       │   ├── calendar.ts               # Finnhub 经济/财报日历 + BLS/FRED 官方 iCal + SEC 财报申报（第二批新增）
│       │   └── resample.ts               # 日线聚合成周线/月线及 52 周/阶段涨跌幅计算
│       └── data/samples/                 # 15 份真实公开历史 OHLCV JSON 样本
├── .env.example                          # 可选免费 API Key 与非密钥公开源配置模板
└── README.md
```

---

## 2. 第二批重点交付内容

### 2.1 免费数据适配器加固（`packages/market-adapters`）
- **独立限流与退避（`cache-limiter.ts`）**：
  - 为每个免费源设置保守的分钟/每日配额与最小请求间隔（Twelve Data `7/分·750/天`、Polygon `4/分`、Finnhub `45/分`、EODHD `18/天`、SEC EDGAR `40/分` 等）。
  - 遇到 HTTP `429` 或配额错误码自动进入指数退避冷却（60s 起，上限 600s），避免打爆免费档。
- **两级内存缓存与优雅降级**：
  - 新鲜缓存：日线 10 分钟、60m 日内 5 分钟、独立报价 60 秒、资讯 10 分钟、日历 30 分钟。
  - 上游失败或触发限流时，**优先返回未超期的 Stale 缓存**（最长达 6~12 小时，并在 UI 诚实标注），最后再回退仓库捆绑样本，绝不白屏或抛未捕获异常。
- **多源补齐与优先级**：
  - **美股及美股 ETF（`US:*`、`IDX:QQQ`、`IDX:VTI`）**：
    - K 线：有 Key 时按 `Twelve Data (60m/1D)` → `Polygon (60m/1D)` → `EODHD (1D)` → `Finnhub Candle` 顺序尝试；配置 Twelve Data 或 Polygon Key 后自动为全部美股/ETF 解锁 `60m` 周期。
    - 最新报价（`/api/quote` 与 `/api/bars` 报价增强）：按 `Finnhub Quote` → `Twelve Data Quote` → `Polygon Prev Close` 尝试；Finnhub 报价成功时诚实标注报价来源，不篡改历史 K 线。
  - **无 Key 免配置官方指数**：扩展 FRED 官方公开 CSV 支持 `IDX:SP500`（带捆绑样本回退）与 `IDX:NASDAQCOM`（联网免 Key 拉取，离线时给出清晰空状态提示，不伪造样本）。
  - **A 股 / 港股**：A 股支持可选 `TUSHARE_TOKEN` 与可选本地 Python `ENABLE_BAOSTOCK=true`（默认关闭，不强制安装）；港股支持可选 `EODHD_API_KEY`；均在无配置或失败时优雅回退本地真实历史样本。

### 2.2 财经资讯流面板（替换右侧占位）
- 路由：`GET /api/news?scope=symbol|market&symbol=...`
- 支持 **「当前品种」** 与 **「全市场 / 宏观」** 一键切换及手动刷新。
- **有 Key**：接入 Finnhub（`/company-news`、`/news?category=general`）与 Polygon（`/v2/reference/news`）。
- **无 Key（合法官方公开源，纯 JSON / XML RSS / Atom 解析，零 HTML 爬虫、零全文转载）**：
  - 美股个股：SEC EDGAR 官方 Submissions API（`data.sec.gov/submissions/CIK{cik}.json`，带可配置的 `SEC_EDGAR_USER_AGENT`）提取最新 `8-K / 10-Q / 10-K / DEF 14A` 公告与官方原文直达链接。
  - 全市场/宏观：美联储官方新闻稿 RSS（`federalreserve.gov/feeds/press_all.xml`）、BLS 官方最新数据 RSS（`bls.gov/feed/bls_latest.rss`）、SEC 官方新闻 RSS（`sec.gov/news/pressreleases.rss`）及 SEC EDGAR 最新 8-K Atom。
- 顶部明确展示数据来源徽章与延迟说明；离线/失败时展示可读错误或空状态引导与重试按钮。

### 2.3 宏观与财报日历面板（替换右侧占位）
- 路由：`GET /api/calendar?days=7|14|30&symbol=...`
- 按日期分组展示事件时间、时区、国家/地区、事件类型（宏观 / 财报 / SEC 申报）、重要性柱条、前值/预测/公布（有则展示）及官方外链，支持 `全部 / 高重要 / 宏观 / 财报` 与 `7天 / 14天 / 30天` 筛选。
- **有 Key（`FINNHUB_API_KEY`）**：拉取 Finnhub 免费经济日历（含前值/预测/公布）与美股财报日历（含预期/实际 EPS）。
- **无 Key（合法官方公开源）**：解析 **BLS 官方经济发布日程 iCalendar（`bls.gov/schedule/news_release/bls.ics`）**、**FRED 官方发布日历 iCalendar（`fred.stlouisfed.org/releases/calendar.ics`）** 以及当前美股的 **SEC EDGAR 近期 `10-Q / 10-K` 财报申报记录**。若离线或上游暂不可达，展示清晰空状态说明（明确指出无 Key 公开源范围与 `FINNHUB_API_KEY` 解锁项）。

### 2.4 可用涨跌幅测距尺（替换左侧占位）
- 在 `KLineChartStage.tsx` 注册自定义 KLineChart Overlay `tbMeasure`，与现有 7 种画线工具共存互不干扰。
- **操作方式**：点击左侧工具栏「测距尺」图标或按 `Alt+M` → 在主图依次点击起点与终点 → 实时渲染半透明涨跌色测距框、十字虚线参考线与自动防裁切读数徽章（显示 **价差、涨跌幅百分比、间隔 K 线根数、时间跨度**）。
- 测距完成后：
  - 随当前主题（深/浅）及涨跌配色（`intl` 绿涨红跌 / `cn` 红涨绿跌）自动变色；
  - 支持直接拖拽两个端点实时重算读数；
  - 自动登记进右侧 **对象树**（如 `测距尺 (+8.65% · 18根)`），可逐条删除或一键清空；
  - 绘制中途按 `Esc` 或点击顶部横幅「取消」会立即移除未完成的半成品并切回十字光标。

---

## 3. 内置样本与在线数据源对照表

| 市场 | 品种 | 无 Key 离线/回退行为 | 无 Key 联网公开源 | 有 Key 在线增强 |
|---|---|---|---|---|
| **美股** | `AAPL / MSFT / TSLA / AMZN` | 捆绑真实历史 1D（AAPL 另含 60m） | SEC EDGAR 公告与财报申报 | TwelveData / Polygon (60m & 1D)、Finnhub (参考报价/新闻/日历)、EODHD (1D) |
| **A 股** | `600519.SH / 000001.SZ / 600036.SH` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `TUSHARE_TOKEN`（1D EOD）或可选本地 `ENABLE_BAOSTOCK=true` |
| **港股** | `00700.HK / 09988.HK / 03690.HK` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `EODHD_API_KEY`（1D EOD） |
| **期货与指数** | `QQQ / VTI / SP500 / NASDAQCOM` | `QQQ/VTI/SP500` 捆绑样本（QQQ 含 60m）；`NASDAQCOM` 展示联网提示 | `SP500`、`NASDAQCOM` 直连 FRED 官方 CSV；宏观 RSS 与 BLS/FRED 日历 | `QQQ / VTI` 支持 TwelveData / Polygon / Finnhub / EODHD |

---

## 4. 已知限制与后续演进范围

- **无 Key 场景限制**：
  - 美股/A 股/港股个股默认仍为本地历史样本（不伪造实时行情）；仅 `SP500` / `NASDAQCOM` 具备合法免 Key 官方在线日线。
  - 无 Key 经济日历的官方 iCal（BLS / FRED）仅含发布日期、时间与指标名称，不包含「前值 / 预测 / 公布」数值对比（需配置免费 `FINNHUB_API_KEY`）。
  - A 股/港股暂未接入免 Key 个股新闻聚合源（避免爬取新闻网站 HTML），可切换「全市场/宏观」查看官方监管与央行资讯。
- **仍刻意不做（遵循本地版约束）**：
  - 无云服务器部署（无 Docker / Caddy）、无数据库/登录鉴权、无多图宫格/全市场筛选器/财务覆盖层/K 线回放。
  - **永久禁止**：任何真实交易、券商下单、杠杆及 TradingView 商标或爬虫。
