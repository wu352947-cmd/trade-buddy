# Trade Buddy — 首版实现说明（IMPLEMENTATION）

本文档记录 Trade Buddy 第一版可本地运行的看盘应用实现情况（对应规划 Batch 1–2 + 可用 K 线图表与本地数据适配层，纯本地运行、无服务器/Docker/登录鉴权）。

---

## 1. 技术栈与目录结构

- **前端框架**：Next.js 15（App Router）+ React 19 + TypeScript 5 + Tailwind CSS v4
- **图表引擎**：`klinecharts` v10.1.1（Apache 2.0 开源许可，前端动态导入以规避 SSR 窗口对象访问）
- **数据校验**：Zod v3
- **工程组织**：pnpm / npm 兼容 Workspace Monorepo

```text
trade-buddy/
├── apps/web/                         # Next.js 看盘前端 + 本地 API Route (/api/bars, /api/symbols)
│   └── src/
│       ├── app/                      # 根路由 / 与 /chart（直接进入工作区，无登录拦截）
│       └── components/
│           ├── chart/                # KLineChartStage（KLineChart v10 封装、自定义矩形 Overlay、图例与底轴）
│           ├── workspace/            # TopBar, LeftDrawingBar, RightIconRail, BottomDock, TerminalWorkspace
│           ├── panels/               # WatchlistAndDetails, DataWindowAndTree
│           └── dialogs/              # SymbolSearchModal, IndicatorModal
├── packages/
│   ├── shared-types/                 # 共享 Zod Schema 与 TS 类型（SymbolMeta, NormalizedBar, Provenance 等）
│   ├── ui-tokens/                    # 原创「双柱伴行」Logo SVG、28 枚原创金融图标、dark/light + intl/cn Tokens
│   └── market-adapters/              # 本地样本数据 + 周期聚合 + 可选合法免费 API 适配器
│       └── data/samples/             # 15 份真实公开历史 OHLCV JSON 样本
├── .env.example                      # 可选免费 API Key 配置模板
├── .gitignore                        # 忽略 node_modules/.next/.env 等
└── README.md                         # 中文安装、启动、数据源与合规说明
```

---

## 2. 已实现可用功能

### 2.1 原创品牌与设计系统
- 落地 Trade Buddy 原创 **「双柱伴行 + 护盾弧」Logo SVG** 与一套 `1.5px` 几何等宽原创工具栏 SVG 图标。
- 完整落地规划 v2 Design Tokens（深石板冷灰画布 `#0E1117`、面板 `#131722`、`1px` 细分割线、全数值 `tabular-nums`）。
- 默认 **深色模式 + 绿涨红跌（`intl`：绿 `#16B981` / 红 `#F2485B`）**；顶栏支持一键切换 **红涨绿跌（`cn`）** 与 **浅色主题（`light`）**，K 线实体、影线、成交量柱、MACD 柱、自选表与热力块同步变色。

### 2.2 五区专业看盘工作区
1. **顶部栏（40px）**：Logo + 品种搜索入口 + 周期切换（`60m`（AAPL/QQQ 可用）/ `1D` / `1W` / `1M`，无分钟数据品种禁用并附提示）+ 图表类型（实心 K 线 / 空心 K 线 / 美国线 OHLC / 折线图 / 面积图）+ 指标弹窗入口 + 涨跌配色切换 + 深/浅色切换 + 合规标识（`仅研究 · 无实盘`）。
2. **左侧画线工具栏（48px）**：
   - 可真实绘制到主图的 7 类工具：**趋势线（`segment`）、水平线（`horizontalStraightLine`）、射线（`rayLine`）、平行通道（`parallelStraightLine`）、自定义矩形支撑/阻力区（`tbRect`）、斐波那契回撤（`fibonacciLine`）、文字注释（`simpleAnnotation`，支持输入自定义文字）**。
   - 支持 **磁铁吸附（`weak_magnet`）** 开关与 **一键清空全部画线**，并支持快捷键（`Alt+T/H/R/F`、`Esc` 返回光标）。
3. **中央主图与副图**：
   - `KLineChart` v10 真实 Canvas 渲染，支持缩放、平移、十字光标、价格与时间轴、主副图拖拽调高。
   - 左上角紧凑状态行：品种代码/名称/周期/交易所 + **不可隐藏的数据来源与区间胶囊** + 随光标实时刷新的 OHLCV 数值 + 当前已开启指标快捷关闭标签。
   - 底部快捷区间栏（`1M / 3M / 6M / 1Y / 全部`）、实时 `UTC+8` 时钟、百分比坐标（`%`）与 `AUTO` 视图重置。
4. **右侧功能栏（默认 312px）+ 极窄图标导轨（42px）**：
   - **自选列表与品种详情**：默认 4 大市场分组（美股 / A 股 / 港股 / 期货与指数），点击任意品种即时切换主图；下半区展示现价、涨跌幅、数据来源与截止日期、今开/昨收/高低/成交量、52 周区间条与 `1W/1M/3M/6M/1Y` 涨跌热力块。
   - **数据窗口 / 对象树**：顶部 Segmented 切换；数据窗口随十字光标实时刷新日期、OHLC、涨跌与量能；对象树分层展示当前指标与全部画线对象，支持逐项删除。
5. **底部可折叠停靠栏（默认折叠 32px）**：
   - **研究笔记**：按品种独立保存在浏览器 `localStorage`，自动记录保存时间。
   - **数据源与合规声明**：实时展示 `.env.local` 各可选数据源配置状态与未成年人保护合规声明。

### 2.3 内置技术指标（全部支持动态开关）
- 主图叠加：`MA`（5/10/20/60，默认开启）、`EMA`（6/12/20）、`BOLL`（20, 2）
- 副图面板：`VOL`（默认开启）、`RSI`（6/12/24）、`MACD`（12, 26, 9）
- 可通过顶栏「指标」按钮（或按 `/` 快捷键）自由开关，也可直接在主图状态行或对象树中关闭。

### 2.4 全局品种搜索
- 点击顶栏品种按钮或在图表空白处直接敲击字母/数字即可唤起搜索弹窗，支持按四大市场过滤、方向键选择与回车切图。

---

## 3. 占位与本批未做范围

以下模块按本批本地首版边界作为占位或留待后续批次：

- **UI 占位项**：
  - 左侧画线栏最下方「测距尺」图标（带黄点标识，点击提示留待后续批次完善）。
  - 右侧图标导轨「财经资讯流」与「宏观与财报日历」面板（点击展示清晰的占位说明）。
- **本批刻意不做（严格遵循任务说明）**：
  - 不搭建云服务器部署脚手架（无 Docker / Caddy）、无 PostgreSQL / Redis、无 Fastify 独立网关、无登录鉴权页。
  - 暂不做 2/4 宫格多图联动、全市场筛选器、财务报表覆盖层、K 线回放与模拟盘。
  - **永久禁止**：任何真实交易、券商下单按钮、杠杆与爬虫代码。

---

## 4. 实际数据源与样本清单

所有内置样本均为 **真实公开历史数据**（非随机生成），通过 `packages/market-adapters` 统一输出 `NormalizedBar` 与 `DataProvenance`：

| 市场分组 | 品种代码 | 名称 | 支持周期 | 捆绑样本真实来源 | 样本日期区间（条数） |
|---|---|---|---|---|---|
| **美股** | `US:AAPL` | 苹果 | `60m / 1D / 1W / 1M` | EODHD 官方 Demo (1D) & Twelve Data 官方 Demo (60m) | 1D: `2024-10-29 ~ 2026-11-24` (520)<br>60m: `2026-09-22 ~ 2026-11-25` (320) |
| **美股** | `US:MSFT` | 微软 | `1D / 1W / 1M` | EODHD 官方 Demo EOD | `2024-10-29 ~ 2026-11-24` (520) |
| **美股** | `US:TSLA` | 特斯拉 | `1D / 1W / 1M` | EODHD 官方 Demo EOD | `2024-10-29 ~ 2026-11-24` (520) |
| **美股** | `US:AMZN` | 亚马逊 | `1D / 1W / 1M` | EODHD 官方 Demo EOD | `2024-10-29 ~ 2026-11-24` (520) |
| **A 股** | `CN:600519.SH` | 贵州茅台 | `1D / 1W / 1M` | GitHub 开源数据集（Tushare 历史日线归档） | `2019-01-02 ~ 2021-01-29` (507) |
| **A 股** | `CN:000001.SZ` | 平安银行 | `1D / 1W / 1M` | GitHub 开源数据集（Tushare 历史日线归档） | `2019-01-02 ~ 2021-01-29` (507) |
| **A 股** | `CN:600036.SH` | 招商银行 | `1D / 1W / 1M` | GitHub 开源数据集（Tushare 历史日线归档） | `2019-01-02 ~ 2021-01-29` (507) |
| **港股** | `HK:00700.HK` | 腾讯控股 | `1D / 1W / 1M` | GitHub 开源数据集（HKEX 历史日线归档） | `2020-07-02 ~ 2022-06-30` (493) |
| **港股** | `HK:09988.HK` | 阿里巴巴-W | `1D / 1W / 1M` | GitHub 开源数据集（HKEX 历史日线归档） | `2020-07-02 ~ 2022-06-30` (493) |
| **港股** | `HK:03690.HK` | 美团-W | `1D / 1W / 1M` | GitHub 开源数据集（HKEX 历史日线归档） | `2020-07-02 ~ 2022-06-30` (493) |
| **期货与指数** | `IDX:QQQ` | 纳指100 ETF 代理 | `60m / 1D / 1W / 1M` | Twelve Data 官方 Demo (1D & 60m) | 1D: `2024-10-30 ~ 2026-11-25` (520)<br>60m: `2026-09-22 ~ 2026-11-25` (320) |
| **期货与指数** | `IDX:VTI` | 美股全市场 ETF 代理 | `1D / 1W / 1M` | EODHD 官方 Demo EOD | `2024-10-29 ~ 2026-11-24` (520) |
| **期货与指数** | `IDX:SP500` | 标普 500 指数 | `1D / 1W / 1M` | FRED 美联储官方公开收盘指数 CSV（在线免 Key 可刷新，失败回退本地样本） | `2024-10-29 ~ 2026-11-24` (520) |

- **可选在线适配**：在 `.env.local` 中配置 `TWELVE_DATA_API_KEY` / `POLYGON_API_KEY` / `EODHD_API_KEY` / `TUSHARE_TOKEN` 后，服务端 `/api/bars` 路由会自动优先尝试对应合法免费源并做 10 分钟内存缓存，未配置时零外部请求、失败自动回退本地样本。

---

## 5. 本地运行方式

```bash
pnpm install
pnpm dev
# 浏览器访问 http://localhost:3000
```

验证构建：

```bash
pnpm typecheck && pnpm build
```
