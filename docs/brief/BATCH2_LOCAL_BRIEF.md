# Trade Buddy 第二批 —— 给反重力的实现任务

请阅读本仓库现有代码与文档后，在 `/workspace/trade-buddy` 内实现第二批功能。做完后**不要 git commit、不要 git push**（协调者会验证后再提交）。

参考：

- 规划：`docs/plan/PLAN.md`（v2）
- 第一批实现说明：`IMPLEMENTATION.md`、`README.md`
- 第一批任务：`docs/brief/BATCH1_LOCAL_BRIEF.md`
- 现有数据层：`packages/market-adapters/`（已有样本、FRED SP500 免 key 拉取、以及 Twelve Data / Polygon / EODHD / Tushare 的可选 key 雏形与 10 分钟内存缓存）
- 资讯/日历目前是右侧栏占位（`TerminalWorkspace.tsx` 中 `rightTab === "news" | "calendar"`）
- 测距尺目前是占位（`LeftDrawingBar` 的 `measure` 工具点击只弹 toast）

## 必须遵守

- 产品名 Trade Buddy；原创品牌；禁止 TradingView 名称、Logo、图标或复制其前端源码。
- **仅限本地运行**：不上云、不写 Docker/Caddy、不强制登录。
- **仅研究与模拟**：严禁真实交易、券商 SDK、下单按钮、杠杆。
- **禁止爬取 TradingView 或其私有 API。禁止使用可能违反条款的非官方 Yahoo 图表接口。**
- **禁止读取、打印或提交任何已有 token**（尤其不要碰 `/workspace/stonequant-data/.tushare_env`）。不要提交 `.env`、`.env.local`、密钥、`node_modules`、`.next`。
- 密钥只从 `apps/web/.env.local` 或根目录 `.env.local` 由 **Next.js 服务端 Route Handler** 读取；**绝对不要把 key 下发到前端 bundle 或写进客户端代码。**
- 默认配色仍是绿涨红跌（`intl`），可切红涨绿跌（`cn`）。中文界面。
- 无任何 API key 时，应用必须能完整打开、不报错、图表与新面板都有清晰可用状态（样本数据或公开源或空状态说明）。
- 不要破坏第一批已能用的五区工作区、K 线、指标、画线和自选。

## 本批要做的四件事

### 1. 把免费数据适配器做扎实（优先美股延迟/日内）

在 `packages/market-adapters` 完善并统一行情获取：

- **有 key 时**（环境变量已在 `.env.example`）：优先用对应免费档拉美股（及 ETF）延迟或 EOD / 可获得的日内（如 60m）K 线与最新报价：
  - `TWELVE_DATA_API_KEY`
  - `POLYGON_API_KEY`
  - `FINNHUB_API_KEY`（第一批 env 状态里有，但行情拉取可能还不完整，请补上）
  - `EODHD_API_KEY`
- **无 key 时**：尽量使用无需 key 的合法官方公开来源并自动回退。至少保留并稳健化 FRED 官方公开 CSV（如 SP500；若还能合法免 key 接入 NASDAQCOM 等指数则加上）。SEC EDGAR 主要用于公告，不要假装它是实时行情。失败则回退捆绑样本。
- **A 股 / 港股 / 期货与指数**：能合法接就接（Tushare 仅在配置了 `TUSHARE_TOKEN` 时；Baostock 若必须 Python 子进程，可做可选适配并在 README 说明依赖，默认不强制安装）。接不上或失败要优雅回退样本，UI 不得白屏或抛未捕获错误。
- **缓存与限流**：按各免费档配额做简单令牌桶/间隔限流 + 内存缓存（可沿用并加强现有 10 分钟缓存）。遇到 429 或失败：退避，优先返回未过期/略过期缓存，再回退样本。不要把免费档打爆。
- UI 必须清楚标注：**来源名称、是实时 / 延迟 N 分钟 / 日线 EOD / 历史样本、数据区间**。不要伪装成交易所实时。
- 可新增 `/api/quote` 或扩展现有 `/api/bars`、`/api/symbols`，但前端只打本应用自己的 API。
- 更新 `.env.example` 注释（仍不要提交真实 key）。可增加 `SEC_EDGAR_USER_AGENT` 这类非密钥配置说明（SEC 要求 User-Agent 含联系方式；给一个项目级默认即可，允许覆盖）。

### 2. 资讯流（替换右侧「财经资讯流」占位）

做可用的资讯面板，支持「当前品种」与「全市场/宏观」切换：

- **有 key**：Finnhub 和/或 Polygon 的公司新闻（免费档），服务端代理。
- **无 key 也要能用**：合法公开来源，例如：
  - SEC EDGAR 公告 / 8-K / 最新申报（官方 Atom/API，带合规 User-Agent）
  - 少量官方或明确允许的公开 RSS（只展示标题、时间、来源、外链到原文；不要全文转载）
- 每条显示标题、时间、来源徽章、外链。加载失败时显示可读错误和重试，而不是空白崩溃。
- 注明数据来源与可能的延迟。不要爬新闻网站 HTML。

请新增服务端路由（如 `/api/news`），把 RSS/API 解析放在服务端或 `packages/market-adapters`。

### 3. 经济日历（替换右侧「宏观与财报日历」占位）

- **有 key**：可用 Finnhub 等免费经济日历。
- **无 key**：用合法公开来源（例如 FRED 发布日历若有官方可抓取的公开接口/文档化 feed；美联储/BLS 等官方日历或 iCal；或 SEC 财报相关公开信息）。若某源无法稳定获取，必须给出**清晰空状态**（说明需要哪个可选 key，以及无 key 时仍能看到什么），不能继续写「占位 · 后续批次」。
- 按日期列出事件：时间、地区/国家、指标或会议名称、重要性（若有）、前值/预测/公布（若有）。
- 服务端路由如 `/api/calendar`。同样要缓存和失败回退。

### 4. 补上测距尺

把左侧画线栏「涨跌幅测距尺」从占位做成**真正能在图上用的工具**：

- 两点（或拖拽）测量：价格差、涨跌幅百分比、间隔多少根 K 线/多长时间。
- 画在图上可见，可取消/删除（对象树里能看到并删掉），Esc 退出。
- 去掉「占位」文案和黄点，图标与其他已实现工具一致。
- 优先用 KLineChart Overlay（内置或自定义）；不要因此搞坏现有 7 种画线。

## 文档

更新 `README.md` 与 `IMPLEMENTATION.md`：本批做了什么、无 key / 有 key 时各数据源行为、如何配置 `.env.local`、如何本地运行、哪些仍是限制。不要写任何真实密钥。

## 验收

1. `pnpm typecheck` 与 `pnpm build`（或 npm 等价命令）通过。
2. `pnpm dev` 打开 `/` 为完整工作区；无 key 时图表、资讯、日历都不崩溃。
3. 测距尺可在主图上测量并看到读数。
4. 仓库干净，无密钥，无 TradingView 商标资源。

完成后用中文简要汇报：改了哪些文件、每个数据源在无 key / 有 key 下的行为、资讯和日历无 key 时实际用了哪些公开源、测距尺如何使用、尚存问题。
