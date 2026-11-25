# Trade Buddy — 本地版实现说明（IMPLEMENTATION）

本文档记录 Trade Buddy **第一批 + 第二批 + 第三批（A/B/C 三轮）** 纯本地可运行看盘与虚拟练习终端的完整实现架构、数据源行为、撮合机制与已知边界（不上服务器、无 Docker/Caddy、无数据库、无登录鉴权）。

---

## 1. 技术栈与目录结构

- **前端框架**：Next.js 15（App Router）+ React 19 + TypeScript 5 + Tailwind CSS v4
- **图表引擎**：`klinecharts` v10.1.1（Apache 2.0 开源许可，客户端动态导入）
- **数据校验**：Zod v3（共享类型、API 响应结构与模拟盘 1 倍现货下单强校验）
- **工程组织**：pnpm / npm 兼容 Workspace Monorepo

```text
trade-buddy/
├── apps/web/
│   └── src/
│       ├── app/
│       │   ├── api/
│       │   │   ├── bars/route.ts              # K 线 + 报价 + 数据来源 Route Handler
│       │   │   ├── quote/route.ts             # 独立最新参考报价 Route Handler
│       │   │   ├── symbols/route.ts           # 品种搜索、自选摘要与非敏感 env 状态
│       │   │   ├── news/route.ts              # 财经资讯流服务端代理与 RSS/SEC 解析
│       │   │   ├── calendar/route.ts          # 宏观经济与财报日历服务端代理
│       │   │   ├── screener/route.ts          # 选股筛选器服务端指标计算与缓存（3B）
│       │   │   ├── fundamentals/route.ts      # 财务报表服务端代理（SEC EDGAR / Tushare）（3B）
│       │   │   └── health/sources/route.ts    # 数据源布尔配置与轻量在线探测（3B）
│       │   ├── page.tsx                       # 根路由直接进入五区看盘工作区
│       │   ├── chart/page.tsx                 # 等价看盘工作区路由
│       │   └── settings/page.tsx              # 设置页路由（3B）
│       ├── components/
│       │   ├── chart/KLineChartStage.tsx      # KLineChart v10 封装、画线/测距尺、受控光标与点选回放起点
│       │   ├── workspace/
│       │   │   ├── TopBar.tsx                 # 顶栏（品种/周期/图表类型/指标/回放/筛选器/多图布局/配色/主题/设置）
│       │   │   ├── LeftDrawingBar.tsx         # 左侧 8 种画线 + 涨跌幅测距尺 + 磁铁工具栏
│       │   │   ├── RightIconRail.tsx          # 右侧 6 标签图标导轨（含财务数据）
│       │   │   ├── ReplayBar.tsx              # K 线回放控制条（3A）
│       │   │   ├── BottomDock.tsx             # 底部可折叠停靠栏（虚拟资金·模拟 / 研究笔记 / 数据源声明）
│       │   │   └── TerminalWorkspace.tsx      # 多图宫格管理、联动状态、回放与模拟盘撮合桥接
│       │   ├── panels/
│       │   │   ├── WatchlistAndDetails.tsx    # 自选分组（按默认市场置顶）与品种详情
│       │   │   ├── DataWindowAndTree.tsx      # 随光标更新数据窗口 + 对象树
│       │   │   ├── FundamentalsPanel.tsx      # 财务数据面板（3B）
│       │   │   ├── NewsFlowPanel.tsx          # 财经资讯流面板
│       │   │   ├── EconomicCalendarPanel.tsx  # 宏观与财报日历面板
│       │   │   ├── ScreenerDrawer.tsx         # 宽幅选股筛选器抽屉（3B）
│       │   │   └── PaperTradingPanel.tsx      # 虚拟资金·模拟盘面板（3C）
│       │   ├── settings/SettingsView.tsx      # 设置页客户端视图（3B）
│       │   └── dialogs/                       # SymbolSearchModal, IndicatorModal
│       └── lib/
│           ├── chart-sync.ts                  # 二分时间戳对齐、无未来函数前缀切片与回放报价派生（3A）
│           ├── replay-store.tsx               # K 线回放状态 Context 与播放定时器（3A）
│           ├── preferences.ts                 # 主题/涨跌配色/默认市场 localStorage 持久化（3B）
│           ├── paper-trading.ts               # 纯本地 1 倍现货虚拟模拟盘校验与撮合引擎（3C）
│           └── paper-trading-store.tsx        # 虚拟模拟盘 React Context 与 localStorage 持久化（3C）
├── packages/
│   ├── shared-types/                          # 全量 Zod Schema 与共享类型（含多图/回放/筛选/财务/设置/模拟盘）
│   ├── ui-tokens/                             # 原创 Logo、几何 SVG 图标库、深浅色与涨跌色 CSS Tokens
│   └── market-adapters/
│       ├── src/
│       │   ├── cache-limiter.ts               # 按源限流器、429 指数退避、Fresh+Stale 缓存与运行时健康追踪
│       │   ├── catalog.ts                     # 14 个核心品种与美股 SEC CIK 映射
│       │   ├── providers.ts                   # 多源行情适配（TwelveData/Polygon/Finnhub/EODHD/Tushare/FRED/Baostock）
│       │   ├── news.ts                        # Finnhub/Polygon 新闻 + SEC EDGAR/美联储/BLS/SEC 官方 RSS
│       │   ├── calendar.ts                    # Finnhub 经济/财报日历 + BLS/FRED 官方 iCal + SEC 财报申报
│       │   ├── screener.ts                    # 品种日线快照聚合、MA20/MA60 计算与过滤（3B）
│       │   ├── fundamentals.ts                # SEC EDGAR companyfacts XBRL 解析 + 可选 Tushare A 股财报（3B）
│       │   ├── health.ts                      # 数据源布尔状态汇总与免 Key 公开源 HEAD 轻量探测（3B）
│       │   └── resample.ts                    # 日线聚合成周线/月线及 52 周/阶段涨跌幅计算
│       └── data/samples/                      # 15 份真实公开历史 OHLCV JSON 样本
├── .env.example                               # 可选免费 API Key 与非密钥公开源配置模板
└── README.md
```

---

## 2. 第一、二批基础能力回顾

- **五区看盘工作区与图表引擎**：基于 `klinecharts` v10 封装 `KLineChartStage`，支持 5 种图表类型、4 种周期、6 种内置技术指标（`MA/EMA/BOLL/VOL/RSI/MACD`）、8 种画线 + 自定义 `tbMeasure` 涨跌幅测距尺 Overlay + 磁铁吸附与对象树管理。
- **数据适配与限流保护**：`cache-limiter.ts` 为各免费数据源配置独立配额、429 指数退避与两级内存缓存（Fresh + Stale-If-Error），无 Key 时自动使用 15 份真实历史样本与合法公开源（FRED CSV、SEC EDGAR Submissions、美联储/BLS/SEC RSS、BLS/FRED iCal）。

---

## 3. 第三批（A / B / C 轮）实现详解

### 3.1 多图布局与联动（A 轮）
- **布局模式**：`TerminalWorkspace.tsx` 维护 4 个独立宫格状态（`pane-1` ~ `pane-4`），支持 `single`（单图）、`split_h`（左右 2 图）、`split_v`（上下 2 图）、`grid_2x2`（2×2 四宫格）。每个宫格渲染独立的 `KLineChartStage` 实例，拥有各自的品种、周期、图表类型、指标与画线。
- **活动图与联动**：
  - 维护 `activePaneId`、全局开关 `syncConfig: { symbol, interval, crosshair }` 及每宫格独立的 `links: { symbol, interval, crosshair }`。
  - 切换品种或周期时，若活动图处于全局+本图联动状态，则同步更新其余未解除对应联动的可见宫格；单图解除联动后即保持独立。
  - 十字光标通过 `onCrosshairTimestampChange` 广播时间戳，目标宫格经 `chart-sync.ts` 的二分查找 `findNearestBarByTimestamp` 对齐至相同或最近一根 K 线。

### 3.2 K 线回放（A 轮）
- **状态与驱动**：`apps/web/src/lib/replay-store.tsx` 提供 `ReplayProvider` 与 `useReplay`，暴露 `ReplaySnapshot`（`active`、`targetPaneId`、`symbolId`、`interval`、`startIndex`、`currentIndex`、`totalBars`、`currentBar`、`currentTimestamp`、`isPlaying`、`speed`、`pickStartMode`、`syncLinkedPanes`）。
- **无未来函数切片**：`TerminalWorkspace.tsx` 对回放目标宫格严格按 `bars.slice(0, currentIndex + 1)` 截断传入 `KLineChartStage`，并由 `deriveQuoteFromBars` 派生右侧详情报价；多图周期联动且开启 `syncLinkedPanes` 时，对其余已联动宫格调用 `sliceBarsUpToTimestamp` 同步截断。所有技术指标均仅根据截断后的可见前缀计算。
- **交互控制**：`ReplayBar.tsx` 提供点选起点、进度条拖动、播放/暂停（`Space`）、单步前进、回到起点、`0.5× / 1× / 2× / 5× / 10×` 调速及结束回放。

### 3.3 选股筛选器（B 轮）
- **服务端聚合**：`packages/market-adapters/src/screener.ts` + `GET /api/screener` 基于目录全部品种日线快照（优先复用缓存与样本/FRED，避免打爆外部免费配额）计算 `MA20`、`MA60`、偏离均线百分比、成交额与阶段涨跌幅，并做 5 分钟新鲜缓存 + 6 小时过期兜底缓存。
- **前端抽屉**：`ScreenerDrawer.tsx` 支持市场筛选、涨跌幅上下限、价格区间、成交量/成交额下限、MA20/MA60 上下位置及关键字搜索，支持多列升/降序排序与来源徽章展示；点击任意行将当前活动图切换到该品种（遵循多图品种联动/独立设置）。

### 3.4 财务数据面板（B 轮）
- **美股免 Key 财报**：`packages/market-adapters/src/fundamentals.ts` + `GET /api/fundamentals?symbol=...` 通过 `US_SYMBOL_CIK_MAP`（覆盖 `AAPL / MSFT / TSLA / AMZN`）请求官方 **SEC EDGAR `companyfacts` XBRL JSON**（带合规 `SEC_EDGAR_USER_AGENT`），标准化解析年报（`10-K`）与季报（`10-Q`）的营收、净利润、稀释 EPS、总资产、总负债、股东权益与总股本，并计算同比与净利率/资产负债率（6 小时新鲜缓存 + 48 小时 Stale 回退）。
- **可选 A 股财报与其他市场**：A 股在配置 `TUSHARE_TOKEN` 时自动拉取 Tushare Pro 利润表与资产负债表合并报表；无 Key 时的 A 股、港股以及宽基指数/ETF 代理均返回结构化 `unsupported` 状态，由 `FundamentalsPanel.tsx` 展示清晰空状态说明。

### 3.5 设置页与偏好持久化（B 轮）
- **持久化**：`apps/web/src/lib/preferences.ts` 使用 `localStorage` 键 `trade-buddy:preferences:v1` 存储 `{ theme, colorScheme, defaultMarket }`，并通过 `storage` 事件在设置页（`/settings`）与主工作区之间实时双向同步；首开工作区时若 `defaultMarket` 与默认美股不同，自动置顶对应自选分组并切换首开标的。
- **数据源布尔健康检查**：`packages/market-adapters/src/health.ts` + `GET /api/health/sources`（可选 `?probe=1`）返回 9 类数据源（FRED、公开资讯/日历、SEC EDGAR、Twelve Data、Polygon、Finnhub、EODHD、Tushare、Baostock）的布尔配置与运行时状态；`probe=1` 仅对免 Key 官方公开源发起 4 秒超时轻量 `HEAD` 探测，不消耗免费 Key 配额，且**永不返回任何密钥或 token 片段**。

### 3.6 虚拟资金模拟盘（C 轮）
- **强约束 Schema 与纯本地引擎**：
  - `packages/shared-types/src/index.ts` 定义 `PaperOrderInputSchema`（`.strict()`，`leverage: z.literal(1).default(1)`，`allowShort: z.literal(false).default(false)`）与 `PaperAccountSchema`（`version: 1`、`isVirtualSimulation: true`、`leverage: 1`、`allowShort: false`）。
  - `apps/web/src/lib/paper-trading.ts` 在运行时再次显式拒绝 `leverage !== 1`、`allowShort !== false`、非正数数量/限价、可用现金不足及超过可用持仓的卖单（禁止卖空）。
  - **资金与持仓冻结**：未成交限价买单按 `limitPrice × quantity` 冻结虚拟现金；未成交限价卖单按 `quantity` 冻结可用持仓；撤单后立即释放，杜绝并发挂单导致的超买或负持仓。
- **撮合规则**：
  - **非回放模式（`mode: "latest"`）**：取活动图最新可见价（`quote.last`，无则取最后一根 `bar.close`）。市价单即时按该价成交；限价单若下单瞬间已满足条件（买单 `currentPrice ≤ limitPrice` 或卖单 `currentPrice ≥ limitPrice`）则按 `currentPrice` 即时成交，否则保留为 `open` 挂单，记录 `lastEvaluatedBarTimestamp`，在后续价格更新触及或新 K 线高低价触及时自动成交。
  - **回放模式（`mode: "replay"`）**：`TerminalWorkspace.tsx` 将回放当前根 K 线（以及步进/前拖进度条时新揭示的有序 K 线切片 `steppedBars`）桥接至 `PaperTradingProvider`。回放点选起点（`pickStartMode`）期间锁定在当前回放根，防止未来 K 线泄漏。
    - 市价单：按当前回放根 **收盘价 (`close`)** 即时成交。
    - 限价单：下单瞬间若当前回放根收盘价已满足条件则按收盘价成交，否则挂单；当回放向前步进至新 K 线（`bar.timestamp > lastEvaluatedBarTimestamp`）时，买单检测 `bar.low ≤ limitPrice`（成交价 `min(bar.open, limitPrice)`，并限定在 `[low, high]` 内），卖单检测 `bar.high ≥ limitPrice`（成交价 `max(bar.open, limitPrice)`，并限定在 `[low, high]` 内）。
- **持久化与 UI**：
  - `apps/web/src/lib/paper-trading-store.tsx` 使用浏览器 `localStorage` 键 `trade-buddy:paper-account:v1` 持久化账户（含跨标签页 `storage` 同步），刷新后完整保留现金、持仓、挂单与成交记录（上限保留最近 500 笔成交与 300 笔历史已完结委托）。
  - `BottomDock.tsx` 新增常驻标签 **「虚拟资金·模拟」**，展开渲染 `PaperTradingPanel.tsx`：首次使用引导设定初始虚拟资金（默认 `1,000,000`），支持二次确认重置；顶部始终展示「虚拟资金·模拟」徽章、总权益/现金/市值/浮动与已实现盈亏及当前撮合价模式；支持市价/限价下单、25%/50%/全仓快捷比例、持仓一键市价平仓、挂单撤单、成交记录与规则说明；盈亏颜色使用 `.tb-up` / `.tb-down` 自动跟随涨跌配色。

---

## 4. 内置样本与在线数据源对照表

| 市场 | 品种 | 无 Key 离线/回退行为 | 无 Key 联网公开源 | 有 Key 在线增强 |
|---|---|---|---|---|
| **美股** | `AAPL / MSFT / TSLA / AMZN` | 捆绑真实历史 1D（AAPL 另含 60m） | SEC EDGAR `companyfacts` 财务报表、监管公告与财报申报 | TwelveData / Polygon (60m & 1D)、Finnhub (参考报价/新闻/日历)、EODHD (1D) |
| **A 股** | `600519.SH / 000001.SZ / 600036.SH` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `TUSHARE_TOKEN`（1D EOD + 合并财务报表）或可选本地 `ENABLE_BAOSTOCK=true`（1D） |
| **港股** | `00700.HK / 09988.HK / 03690.HK` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `EODHD_API_KEY`（1D EOD） |
| **期货与指数** | `QQQ / VTI / SP500 / NASDAQCOM` | `QQQ/VTI/SP500` 捆绑样本（QQQ 含 60m）；`NASDAQCOM` 展示联网提示 | `SP500`、`NASDAQCOM` 直连 FRED 官方 CSV；宏观 RSS 与 BLS/FRED 日历 | `QQQ / VTI` 支持 TwelveData / Polygon / Finnhub / EODHD |

---

## 5. 已知限制与演进边界

- **无 Key 场景限制**：
  - 个股 K 线默认使用捆绑历史样本（不伪造实时行情）；仅 `SP500` / `NASDAQCOM` 具备合法免 Key 官方在线日线。
  - 无 Key 财务数据仅支持美股个股的 SEC EDGAR `companyfacts`；A 股需配置 `TUSHARE_TOKEN`，港股/指数无免 Key 财报源。
  - 无 Key 经济日历的官方 iCal（BLS / FRED）不含「前值 / 预测 / 公布」数值对比（需 `FINNHUB_API_KEY`）。
  - 筛选器覆盖本地目录的 14 个核心品种，不包含全市场实时行情扫描。
- **模拟盘已知边界**：
  - 跨市场品种（USD / CNY / HKD）在单一虚拟账户内按面值 1:1 计价，未引入汇率换算、手续费、印花税或盘口滑点模型。
  - 数据仅保存在当前浏览器 `localStorage`，清理浏览器站点数据或更换浏览器不会云端同步。
  - 仅支持市价单与限价单，暂不支持止损/止盈条件单或订单在图表主图上的可视化价位线标注。
- **永久红线**：
  - 严禁真实交易、券商下单、真实资金字段、融资融券、杠杆、卖空以及任何 TradingView 商标、源码或网页爬虫。
