# Trade Buddy

**Trade Buddy** 是一款面向个人学习与复盘的全球行情研究终端（Web 本地首版，覆盖 **美股、A 股、港股、期货与指数** 四大核心市场）。

> **合规与定位声明**：
> - **仅限行情研究与图表学习**：本项目严禁任何真实交易、券商 SDK、下单按钮、资金划转、融资融券及任何形式杠杆功能（特别遵循未成年人保护红线）。
> - **原创品牌**：Trade Buddy 为独立原创品牌与设计系统，与任何商业看盘平台无隶属关系；图表渲染内核采用 Apache 2.0 开源协议的 `KLineChart`。
> - **非投资建议**：界面展示的全部历史与延迟数据仅供学习研究，不构成任何投资建议。

---

## 快速本地运行

本版本为**纯本地可运行首版**（无需云服务器、无需 Docker、无需数据库、无需登录鉴权）。

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

启动后在浏览器打开：

- `http://localhost:3000`（或 `http://localhost:3000/chart`）

即可直接进入 Trade Buddy 深色五区看盘工作区。

### 生产构建与类型检查

```bash
pnpm typecheck
pnpm build
pnpm start
```

---

## 数据源说明（开箱即用，无需 Key）

1. **零配置开箱即用（默认）**：
   - 未配置任何 API Key 时，应用使用仓库内捆绑的 **真实公开历史日线/小时 OHLCV 样本数据**（位于 `packages/market-adapters/data/samples/`），覆盖四大市场 13 个代表性品种（美股 `AAPL / MSFT / TSLA / AMZN`、A 股 `600519.SH / 000001.SZ / 600036.SH`、港股 `00700.HK / 09988.HK / 03690.HK`、期货与指数 `QQQ / VTI / SP500`）。
   - 对于 `SP500`（标普 500 指数），在联网且未关闭 `ENABLE_PUBLIC_FRED` 时，后端路由会尝试拉取美联储 **FRED 官方公开免 Key CSV**（滞后 1 交易日收盘指数），失败或离线时自动回退至本地样本。
   - 所有品种在主图状态行、自选列表和品种详情卡均**诚实标注数据属性**（`历史样本 · 日线 EOD` / `ETF代理 · 历史样本` / `FRED 官方日线`），绝不伪装交易所实时行情。

2. **可选配置个人免费 API Key**：
   - 如需尝试在线拉取更新，可复制根目录 `.env.example` 为 `apps/web/.env.local`（或根目录 `.env.local`），按需填写以下任一合法免费/个人研究 Key：
     - `TWELVE_DATA_API_KEY`（Twelve Data Free：美股及美股 ETF 日线 / 60m）
     - `POLYGON_API_KEY`（Polygon.io Stocks Free：美股及美股 ETF 日线）
     - `EODHD_API_KEY`（EODHD Free：美股/港股 EOD 日线）
     - `TUSHARE_TOKEN`（Tushare Pro 个人研究账号：A 股收盘日线）
   - **未配置对应 Key 时不会发起任何请求**，请求失败自动回退本地样本。
   - **严禁提交 `.env` / `.env.local` 或任何真实密钥到仓库。**

---

## 核心功能一览

- **五区深色看盘终端**：顶部工具栏、左侧画线工具栏、中央 `KLineChart` 主图与副图、右侧自选/详情/数据窗口/对象树面板、底部可折叠研究笔记面板。
- **真实图表渲染与交互**：支持实心 K 线、空心 K 线、美国线 (OHLC)、折线图、面积图；支持 `60m`（AAPL/QQQ）/ `1D` / `1W` / `1M` 周期切换、滚轮缩放、拖拽平移、十字光标、百分比坐标切换与快捷区间缩放。
- **内置技术指标**：支持从顶栏与指标弹窗自由开关主图指标（`MA` / `EMA` / `BOLL`）与副图指标（`VOL` 默认开启 / `RSI` / `MACD`）。
- **原创画线工具**：支持趋势线、水平线、射线、平行通道、矩形区域、斐波那契回撤、文字标注 + 磁铁吸附 + 对象树管理与一键清空。
- **涨跌配色与主题**：默认**深色主题 + 绿涨红跌（国际习惯 `intl`）**，顶栏可一键切换**红涨绿跌（`cn`）**及**深色/浅色主题**，K 线与全局界面瞬时联动。

---

## 相关文档

- 实现说明（栈、可用功能、占位清单、数据源明细）：[`IMPLEMENTATION.md`](IMPLEMENTATION.md)
- 产品与技术规划（v2）：[`docs/plan/PLAN.md`](docs/plan/PLAN.md)
- 本批本地首版任务说明：[`docs/brief/BATCH1_LOCAL_BRIEF.md`](docs/brief/BATCH1_LOCAL_BRIEF.md)
