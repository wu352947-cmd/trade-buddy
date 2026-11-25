# Trade Buddy

**Trade Buddy** 是一款面向个人学习与复盘的全球行情研究终端（纯本地运行版本，覆盖 **美股、A 股、港股、期货与指数** 四大核心市场）。

> **合规与定位声明**：
> - **仅限行情研究与图表学习**：本项目严禁任何真实交易、券商 SDK、下单按钮、资金划转、融资融券及任何形式杠杆功能（特别遵循未成年人保护红线）。
> - **原创品牌**：Trade Buddy 为独立原创品牌与设计系统，与任何商业看盘平台无隶属关系；图表渲染内核采用 Apache 2.0 开源协议的 `KLineChart`。
> - **合法数据源**：不爬取 TradingView 或任何新闻/行情 HTML，不使用非官方 Yahoo 图表接口；界面诚实标注数据来源、延迟属性与区间，不伪装交易所实时流。
> - **非投资建议**：界面展示的全部历史与延迟数据仅供学习研究，不构成任何投资建议。

---

## 快速本地运行

本版本为**纯本地可运行版**（无需云服务器、无需 Docker、无需数据库、无需登录鉴权）。

### 环境要求

- **Node.js** `>= 20.0.0`（推荐 Node 20 / 22 / 24）
- **pnpm** `>= 9`（或直接使用 `npm`）

### 安装与启动

```bash
# 方式一：使用 pnpm（推荐）
pnpm install
pnpm dev

# 方式二：使用 npm
npm install
npm run dev
```

启动后在浏览器打开 `http://localhost:3000`（或 `http://localhost:3000/chart`），即可直接进入 Trade Buddy 深色五区看盘工作区。

### 类型检查与生产构建

```bash
pnpm typecheck
pnpm build
pnpm start
```

---

## 数据源行为说明（无 Key 开箱即用 / 有 Key 自动增强）

全部密钥与外部请求均由 **Next.js 服务端 Route Handler**（`/api/bars`、`/api/quote`、`/api/symbols`、`/api/news`、`/api/calendar`）执行，**绝对不向前端下发任何 API Key**。所有上游请求内置按数据源配额限流、429 指数退避、新鲜缓存 + 过期缓存（Stale-If-Error）回退，避免打爆免费档。

### 1. 无任何 API Key 时（零配置开箱可用）

- **K 线行情**：
  - 自动使用仓库内捆绑的 **15 份真实公开历史日线 / 60m OHLCV 样本**（位于 `packages/market-adapters/data/samples/`），覆盖四大市场核心代表品种。
  - **FRED 官方公开免 Key CSV**（`ENABLE_PUBLIC_FRED=true` 默认开启）：对 `IDX:SP500`（标普 500）与 `IDX:NASDAQCOM`（纳斯达克综合指数）在线拉取美联储官方滞后 1 交易日收盘指数；`SP500` 失败/离线自动回退捆绑样本，`NASDAQCOM` 离线时优雅展示空状态提示而不崩溃。
- **财经资讯流（`/api/news`）**：
  - 美股当前品种：使用 **SEC EDGAR 官方 Submissions JSON**（合规 `User-Agent`）展示公司最新 `8-K`、`10-Q`、`10-K`、`DEF 14A` 等监管公告与官方原文外链。
  - 全市场/宏观：聚合 **美联储官方新闻稿 RSS**、**美国劳工统计局 BLS 官方最新发布 RSS**、**SEC 官方新闻 RSS** 与 **SEC EDGAR 最新 8-K Atom**（仅展示标题、时间、来源徽章与原文外链，不抓取正文）。
- **宏观与财报日历（`/api/calendar`）**：
  - 解析 **BLS 美国劳工统计局官方发布日程 iCal (`bls.ics`)** 与 **FRED 官方发布日历 iCal (`calendar.ics`)**，按日期列出 CPI、非农就业、PPI、GDP、PCE 等核心美国宏观发布时间，并补充当前美股的 **SEC EDGAR 近期财报申报记录 (`10-Q / 10-K`)**。
  - 离线或上游不可达时展示清晰可读的空状态说明与重试按钮。

### 2. 可选配置个人免费 API Key（`.env.local`）

如需获取美股延迟日内 K 线、最新参考报价、更多聚合资讯及带「前值/预测/公布」的全球经济日历，可复制根目录 `.env.example` 为 `apps/web/.env.local`（或根目录 `.env.local`）并按需填写：

| 环境变量 | 数据源与免费档配额 | 启用后增强的能力 |
|---|---|---|
| `TWELVE_DATA_API_KEY` | Twelve Data Free（8次/分，800次/天） | 美股与美股 ETF（`AAPL/MSFT/TSLA/AMZN/QQQ/VTI`）延迟 15 分钟 `60m` 与日线 K 线、最新延迟报价 |
| `POLYGON_API_KEY` | Polygon.io Stocks Free（5次/分） | 美股与美股 ETF 近 2 年 `60m` / `1D` K 线、上一交易日收盘参考、参考新闻流 |
| `FINNHUB_API_KEY` | Finnhub Free（60次/分） | 美股/ETF 最新参考报价（`/api/quote` 及右侧详情增强）、公司与全市场新闻、含前值/预测/公布的全球宏观日历与美股财报日历 |
| `EODHD_API_KEY` | EODHD Free（20次/天） | 美股/ETF 及 **港股（`00700/09988/03690`）** 收盘日线 EOD |
| `TUSHARE_TOKEN` | Tushare Pro 个人研究账号 | **A 股（`600519/000001/600036`）** 收盘日线 EOD（留空不请求） |
| `SEC_EDGAR_USER_AGENT` | 非密钥配置（可选覆盖） | SEC 官方要求的联系信息 User-Agent，已有项目级默认值 |
| `ENABLE_PUBLIC_FRED` / `ENABLE_PUBLIC_FEEDS` | 非密钥开关（默认 `true`） | 离线环境下设为 `false` 可彻底零外网请求 |
| `ENABLE_BAOSTOCK` | 非密钥开关（默认 `false`） | 可选本地 Python `baostock` 适配器拉取 A 股前复权日线（需本机预先安装 `python3` 与 `pip install baostock`，不强制安装，失败自动回退样本） |

> **安全提醒**：严禁将包含真实密钥的 `.env` / `.env.local` 提交到 Git 仓库。

---

## 核心功能一览

- **五区深色看盘终端**：顶栏、左侧画线工具栏、中央 `KLineChart` 主/副图、右侧自选/详情/数据窗口/对象树/资讯流/经济日历面板、底部可折叠研究笔记与数据源状态栏。
- **真实图表与内置指标**：支持实心 K 线、空心 K 线、美国线 (OHLC)、折线图、面积图；`60m / 1D / 1W / 1M` 周期切换、滚轮缩放、拖拽平移、百分比坐标、快捷区间缩放；内置 `MA / EMA / BOLL / VOL / RSI / MACD`。
- **完整画线与涨跌幅测距尺**：趋势线、水平线、射线、平行通道、矩形区域、斐波那契回撤、文字标注、**涨跌幅测距尺（`Alt+M`，两点测量价差、涨跌幅百分比、间隔 K 线数与时间跨度，支持端点拖拽微调、对象树删除与 `Esc` 退出）** + 磁铁吸附。
- **资讯流与经济日历**：右侧面板即点即用，支持当前品种/全市场资讯切换、宏观/财报与高重要性筛选、外链原文与错误重试。
- **涨跌配色与主题**：默认**深色主题 + 绿涨红跌（`intl`）**，顶栏可一键切换**红涨绿跌（`cn`）**及**浅色主题**，图表、测距尺与界面联动变色。

---

## 相关文档

- 实现说明（第二批架构、适配器明细、公开源清单与已知限制）：[`IMPLEMENTATION.md`](IMPLEMENTATION.md)
- 产品与技术规划（v2）：[`docs/plan/PLAN.md`](docs/plan/PLAN.md)
- 第一批任务说明：[`docs/brief/BATCH1_LOCAL_BRIEF.md`](docs/brief/BATCH1_LOCAL_BRIEF.md)
- 第二批任务说明：[`docs/brief/BATCH2_LOCAL_BRIEF.md`](docs/brief/BATCH2_LOCAL_BRIEF.md)
