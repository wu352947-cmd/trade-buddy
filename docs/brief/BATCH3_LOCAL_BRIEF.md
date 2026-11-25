# Trade Buddy 第三批 —— 总任务说明（本地版）

请先阅读：

- 规划 `docs/plan/PLAN.md`（v2）
- `README.md`、`IMPLEMENTATION.md`
- 第一、二批任务：`docs/brief/BATCH1_LOCAL_BRIEF.md`、`BATCH2_LOCAL_BRIEF.md`
- 现有工作区：`apps/web/src/components/workspace/TerminalWorkspace.tsx`、`TopBar.tsx`、`KLineChartStage.tsx`
- 数据层：`packages/market-adapters/`、`/api/bars` `/api/quote` `/api/symbols` `/api/news` `/api/calendar`

本批仍是**本地可运行版本**，分 A/B/C 三轮实现，每一轮有单独 brief。不要把三轮一次做完，除非当前 brief 明确允许。

## 必须遵守

- 产品名 Trade Buddy；原创品牌；禁止 TradingView 名称、Logo、图标或复制其前端源码。
- 只做本地运行：不上云、不写 Docker/Caddy、不强制登录。
- 仅研究与**虚拟**模拟：严禁真实交易、券商 SDK、下单到真实账户、杠杆、融资融券。模拟盘必须在界面醒目标注「虚拟资金·模拟」。
- 禁止爬取 TradingView 或其私有 API，禁止非官方 Yahoo 图表接口。
- 禁止读取、打印或提交任何已有 token（尤其不要碰 `/workspace/stonequant-data/.tushare_env`）。不要提交 `.env`、`.env.local`、密钥、`node_modules`、`.next`。
- 密钥只存在服务端 Route Handler 的环境变量中，绝不下发到前端，设置页只显示「已配置 / 未配置」「在线 / 未检测或离线」等布尔状态。
- 默认绿涨红跌（`intl`），可切红涨绿跌（`cn`）。中文界面。
- 无任何 API key 时，应用必须完整打开且新功能可用（或有清晰空状态），不能白屏或未捕获崩溃。
- 不要破坏已有五区工作区、K 线、指标、画线、测距尺、自选、资讯、日历。
- 完成后不要 git commit、不要 git push。

## 本批六件事（总览）

1. **多图布局**：1 / 2 / 4 宫格；各图可联动品种、周期、十字光标，也可单独解除联动。
2. **选股筛选器**：用现有目录 + 能拿到的数据（样本、FRED、有 key 时的行情）按市场、涨跌幅、成交量、价格、均线位置等筛选排序，点击跳到图表（作用于当前活动图）。
3. **财务数据面板**：美股无 key 用 SEC EDGAR companyfacts（营收、净利、EPS、资产负债等及历史）；其他市场仅在有对应 key 时接入，否则清晰空状态。
4. **K 线回放**：选起点，逐根播放/暂停/调速，指标和画线随回放进度更新。
5. **虚拟资金模拟盘**：纯本地、纯虚拟资金，IndexedDB 或 localStorage。市价/限价、持仓、盈亏、成交记录；按当前价或回放价撮合。**仅 1 倍现货**：只能用虚拟现金买入、卖出已有持仓；禁止卖空、禁止杠杆、禁止融资。界面标明「虚拟资金·模拟」。
6. **设置页**：各数据源是否已配置、是否在线（只显示布尔，永不显示 key）；可切换涨跌颜色、主题、默认市场；偏好本地持久化。

验收要求见各轮 brief；全部完成后更新 `README.md` 与 `IMPLEMENTATION.md`（在 C 轮完成）。
