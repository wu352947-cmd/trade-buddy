# Trade Buddy — 本地版实现说明（IMPLEMENTATION）

本文档记录 Trade Buddy **第一批 + 第二批 + 第三批（A/B/C）+ 第四批（A/B/C）** 纯本地可运行行情研究、虚拟模拟与教学回测终端的完整架构、撮合/统计/回测口径、数据持久化 Schema、测试策略与已知限制（不上服务器、无 Docker/Caddy、无数据库、无登录鉴权）。

---

## 1. 技术栈与目录结构

- **前端框架**：Next.js 15（App Router）+ React 19 + TypeScript 5 + Tailwind CSS v4
- **图表引擎**：`klinecharts` v10.1.1（Apache 2.0 开源许可，客户端动态导入，自定义 Overlay 隔离分组）
- **数据校验**：Zod v3（共享类型、API 响应、1 倍现货模拟盘与工作区模板 JSON 导入校验）
- **单元测试**：Node 内置 `node:test` + `node:assert/strict`（Node 24 原生 TypeScript 执行，零外部测试框架依赖，零网络调用）
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
│       │   ├── chart/KLineChartStage.tsx      # KLineChart v10 封装 + 自定义 Overlay 分组：
│       │   │                                  #   tb_user_drawings / tb_paper_overlays / tb_alert_overlays / tb_backtest_overlays
│       │   ├── workspace/
│       │   │   ├── TopBar.tsx                 # 顶栏（含工作区模板菜单、未读提醒入口、多图布局、回放、筛选器、设置）
│       │   │   ├── WorkspaceTemplateMenu.tsx  # 工作区模板保存/切换/重命名/覆盖/导入导出菜单（4B）
│       │   │   ├── LeftDrawingBar.tsx         # 左侧 8 种画线 + 涨跌幅测距尺 + 磁铁工具栏
│       │   │   ├── RightIconRail.tsx          # 右侧 7 标签图标导轨（含本地提醒红点角标）
│       │   │   ├── ReplayBar.tsx              # K 线回放控制条（3A）
│       │   │   ├── BottomDock.tsx             # 底部可折叠停靠栏（虚拟资金·模拟 / 策略回测 / 研究笔记 / 数据源声明）
│       │   │   └── TerminalWorkspace.tsx      # 多图宫格管理、联动、回放、模拟盘、提醒、模板与回测桥接
│       │   ├── panels/
│       │   │   ├── WatchlistAndDetails.tsx    # 自定义自选分组（增删改/拖拽排序/恢复默认）与品种详情（4B）
│       │   │   ├── AlertsPanel.tsx            # 本地提醒创建/管理/手动检查/通知历史面板（4B）
│       │   │   ├── DataWindowAndTree.tsx      # 随光标更新数据窗口 + 对象树
│       │   │   ├── FundamentalsPanel.tsx      # 财务数据面板（3B）
│       │   │   ├── NewsFlowPanel.tsx          # 财经资讯流面板
│       │   │   ├── EconomicCalendarPanel.tsx  # 宏观与财报日历面板
│       │   │   ├── ScreenerDrawer.tsx         # 宽幅选股筛选器抽屉（3B）
│       │   │   ├── PaperTradingPanel.tsx      # 虚拟资金·模拟盘面板（下单/持仓/挂单/复盘统计/费用滑点设置）（3C+4A）
│       │   │   ├── PaperEquityChart.tsx       # 模拟盘虚拟权益曲线 SVG 组件（4A）
│       │   │   ├── BacktestPanel.tsx          # 教学回测沙盒面板（策略参数/汇总/交易表/口径/样本警示）（4C）
│       │   │   └── BacktestEquityChart.tsx    # 回测策略权益 vs 买入持有双线对比 SVG 组件（4C）
│       │   ├── settings/SettingsView.tsx      # 设置页客户端视图（3B）
│       │   └── dialogs/                       # SymbolSearchModal（支持直接勾选加入自选分组）, IndicatorModal
│       └── lib/
│           ├── chart-sync.ts                  # 二分时间戳对齐、无未来函数前缀切片与回放报价派生（3A）
│           ├── replay-store.tsx               # K 线回放状态 Context 与播放定时器（3A）
│           ├── preferences.ts                 # 主题/涨跌配色/默认市场 localStorage 持久化（3B）
│           ├── paper-trading.ts               # 纯本地 1 倍现货虚拟模拟盘校验、费用滑点与撮合引擎（3C+4A）
│           ├── paper-trading-store.tsx        # 虚拟模拟盘 React Context 与 localStorage 持久化（3C+4A）
│           ├── paper-stats.ts                 # 模拟盘完整回合归集、复盘统计与 UTF-8 BOM CSV 导出（4A）
│           ├── watchlist-groups.ts            # 自定义自选分组 CRUD、拖拽重排与 localStorage 持久化（4B）
│           ├── workspace-templates.ts         # 工作区模板快照、JSON 导入导出与 Zod 校验（4B）
│           ├── local-alerts.ts                # 9 类本地提醒纯函数评估引擎（价格/涨跌幅/MA交叉/RSI）（4B）
│           ├── alerts-store.tsx               # 本地提醒 React Context、浏览器 Notification 封装与持久化（4B）
│           └── backtest/
│               ├── engine.ts                  # 纯函数教学回测引擎（MA/BOLL/RSI、严格无未来函数、1倍现货）（4C）
│               └── index.ts                   # 回测引擎导出入口（4C）
├── packages/
│   ├── shared-types/                          # 全量 Zod Schema 与共享类型（涵盖第一至四批）
│   ├── ui-tokens/                             # 原创 Logo、几何 SVG 图标库、深浅色与涨跌色 CSS Tokens
│   └── market-adapters/
│       ├── src/                               # 多源行情/资讯/日历/筛选器/财报/健康检查适配器
│       └── data/samples/                      # 15 份真实公开历史 OHLCV JSON 样本
├── tests/
│   └── backtest.test.ts                       # Node 内置单元测试（无未来函数、手续费/最低费、滑点、禁卖空、AAPL样本）（4C）
├── .env.example
├── README.md
└── IMPLEMENTATION.md
```

---

## 2. 第一至三批基础能力摘要

- **五区终端与图表引擎（第一、二批）**：基于 `klinecharts` v10 封装 `KLineChartStage`，支持 5 种图表类型、4 种周期、6 种内置技术指标、8 种画线 + `tbMeasure` 测距尺 Overlay 与对象树管理；服务端 Route Handler 内置按源限流、429 指数退避与两级内存缓存。
- **多图联动与无未来函数回放（3A）**：`TerminalWorkspace.tsx` 管理 4 宫格独立状态与全局/单图三维度（品种/周期/光标）联动；`replay-store.tsx` 与 `chart-sync.ts` 严格使用前缀切片 `bars.slice(0, currentIndex + 1)` 重算图表、报价与全部指标。
- **筛选器、财务数据与设置页（3B）**：服务端 `/api/screener` 聚合本地目录 MA20/MA60 快照；`/api/fundamentals` 直连 SEC EDGAR `companyfacts`（美股免 Key）及可选 Tushare A 股财报；`/settings` 持久化偏好并经 `/api/health/sources` 展示非敏感布尔配置与免 Key 公开源在线探测。
- **虚拟模拟盘基础版（3C）**：`PaperOrderInputSchema` 与引擎层写死 `leverage = 1`、`allowShort = false`，支持市价/限价单冻结资金与持仓，并在非回放当前价与回放逐根步进下无未来函数撮合。

---

## 3. 第四批（A / B / C 轮）实现详解

### 3.1 模拟盘图上叠加、手续费滑点与复盘统计（4A）

- **主图 Overlay 分组隔离（`KLineChartStage.tsx`）**：
  - 所有模拟盘叠加层放入独立 `groupId = "tb_paper_overlays"`，与用户画线（`tb_user_drawings`）完全隔离，互不误删。
  - 自定义 Overlay `tbPaperPriceLine` 绘制 **持仓成本线**（琥珀实线 + 右侧价格轴标签 + `成本 均价 · 数量` 徽章）和 **未成交限价挂单线**（买/卖区分不同虚线步长与涨跌配色）。
  - 自定义 Overlay `tbPaperFillMarker` 绘制 **买卖点三角形标记**，对同一根 K 线同方向多笔成交做加权均价聚合以防重叠；回放模式下严格过滤 `barTimestamp <= replayMaxTs`，防止未来成交点泄漏；支持面板内与图表左上角快捷按钮同步开关。
- **手续费与滑点模型（`paper-trading.ts`）**：
  - `PaperSettingsSchema` 持久化于 `PaperAccount.settings`（默认值：`feeRatePct: 0.1`、`minFee: 0`、`slippagePct: 0.05`、`showChartMarkers: true`），旧版 `localStorage` 账户自动迁移补齐默认字段而不清空历史持仓与成交。
  - 成交价公式：
    - 市价买：`refPrice × (1 + slippagePct / 100)`；市价卖：`refPrice × (1 - slippagePct / 100)`。
    - 限价买：`min(limitPrice, refPrice × (1 + slippagePct / 100))`；限价卖：`max(limitPrice, refPrice × (1 - slippagePct / 100))`（确保滑点不会让限价单成交劣于限价）。
  - 手续费公式：`fee = max(notional × feeRatePct / 100, minFee)`（当 `feeRatePct = 0` 且 `minFee = 0` 时为 `0`）。买入时校验可用现金必须覆盖 `notional + fee`；买入与卖出手续费均计入成交记录 `fee`、累计手续费 `totalFees` 与回合已实现盈亏。
- **复盘统计与 CSV 导出（`paper-stats.ts`、`PaperEquityChart.tsx`）**：
  - `PaperAccount.equityCurve` 在初始化、每次成交与价格估值变化时采样写入本地（上限保留 1000 点），前端由 `PaperEquityChart` 渲染交互式 SVG 曲线。
  - **统计口径**：
    - 最大回撤：基于权益采样序列计算峰值到谷底的最大绝对回撤与最大百分比回撤。
    - 胜率与盈亏比：由 `computeClosedRoundTrips` 按品种从 `0 -> >0` 开仓起累计至再次清仓归零 `0` 归集为一次完整**已平仓回合**；胜率 = `盈利回合数 / 已平仓回合总数`；盈亏比 = `平均盈利回合净盈亏 / 平均亏损回合净亏损绝对值`（有盈利且无亏损时显示 `∞`）。
  - 导出按钮调用 `downloadFillsCsv` 与 `downloadEquityCurveCsv`，在文件头写入 UTF-8 BOM (`\uFEFF`)，确保 Windows / macOS Excel 直接打开无中文乱码。

### 3.2 自定义自选分组、工作区模板与本地提醒（4B）

- **自定义自选分组（`watchlist-groups.ts`、`WatchlistAndDetails.tsx`、`SymbolSearchModal.tsx`）**：
  - 持久化键：`trade-buddy:watchlist-groups:v1`（`WatchlistGroupsStoreSchema`，含 `version: 1`）。
  - 首次加载基于默认市场排序生成 4 个市场分组；支持新建分组、内联重命名、二次确认删除、原生 HTML5 Drag & Drop 分组重排与品种组内/跨组排序、添加/移除品种及一键恢复默认分组。
- **工作区模板与 JSON 导入导出（`workspace-templates.ts`、`WorkspaceTemplateMenu.tsx`）**：
  - 持久化键：`trade-buddy:workspace-templates:v1`（`WorkspaceTemplatesStoreSchema`）。
  - 快照内容：`layout`、`activePaneId`、`syncConfig`、以及全部 4 个宫格的 `initialized`、`symbolId`、`interval`、`chartType`、`activeIndicators`、`links` 与经 `KLineChartHandle.exportUserDrawings` 导出的世界坐标 `drawings`（`{ timestamp, value }`、`annotationText`、`measurePricePrecision` 等），绝不写入任何环境变量或密钥。
  - 导出 JSON 结构：
    - 单模板：`WorkspaceTemplateExportSingleSchema`（`{ app: "trade-buddy", kind: "workspace_template", schemaVersion: 1, exportedAt, template }`）。
    - 全部模板：`WorkspaceTemplateExportBundleSchema`（`{ app: "trade-buddy", kind: "workspace_templates", schemaVersion: 1, exportedAt, templates }`）。
  - 导入解析（`parseImportedTemplatesJson`）：兼容单模板包裹、批量包裹及裸 `WorkspaceTemplate` 对象；先校验 JSON 语法，再检查 `schemaVersion` 兼容性与 Zod Schema，对未知 `symbolId` 给可读警告并安全回退，对非法 JSON/缺失字段返回可读中文报错而不崩溃。
- **本地提醒（`local-alerts.ts`、`alerts-store.tsx`、`AlertsPanel.tsx`）**：
  - 持久化键：`trade-buddy:local-alerts:v1`（`LocalAlertsStoreSchema`），最多保留最近 200 条触发记录。
  - 9 类条件全部由纯函数评估：`price_cross_above` / `price_cross_below`、`change_pct_up` / `change_pct_down` / `change_pct_abs`（相对 `prevClose`）、`ma_golden_cross` / `ma_death_cross`（基于最后两根 K 线 SMA 交叉）、`rsi_above` / `rsi_below`（Wilder RSI）。
  - 触发频控：`once` 触发后自动停用该规则；`once_per_bar` 通过记录 `lastTriggeredBarTimestamp` 确保同一根 K 线最多触发一次。
  - 通知与画线：触发后推送页内 Toast 并写入通知中心（未读角标同步在顶栏与右侧导轨）；用户主动点击后通过浏览器 `Notification.requestPermission()` 请求权限；价格类提醒在 `KLineChartStage` 独立分组 `tb_alert_overlays` 中绘制 `tbAlertPriceLine` 水平虚线。
  - 回放模式行为：`settings.triggerInReplayMode` 默认 `false`（回放时不误触发，可手动开启）；界面醒目标注 **「提醒只在本页面打开时生效，关闭页面不会推送」**。

### 3.3 教学回测沙盒与单元测试（4C）

- **纯函数回测引擎（`apps/web/src/lib/backtest/engine.ts`）**：
  - 零浏览器 API、零 React/Next 依赖，仅使用 `import type` 引用 `@trade-buddy/shared-types`，便于在浏览器前端与 Node 单元测试中直接复用。
  - **强约束校验**：输入 K 线须按时间戳升序；运行时显式校验并拒绝 `leverage !== 1` 与 `allowShort !== false`；仓位规则支持全仓（100%）或固定比例（`(0, 100]%`），建仓成本（成交额 + 手续费）永远不超过可用现金。
  - **严格无未来函数主循环**：
    1. **开盘撮合阶段（Bar `i` Open）**：若存在来自第 `i - 1` 根收盘后产生的 `pendingSignal`，则严格以 `bars[i].open` 套用滑点成交：买价 = `open × (1 + slippagePct / 100)`，卖价 = `open × (1 - slippagePct / 100)`；手续费 = `max(notional × feeRatePct / 100, minFee)`。1 倍现货约束：仅空仓允许买、仅持仓允许全仓卖，空仓卖信号与持仓买信号均忽略。
    2. **基准建仓阶段（Bar `1` Open）**：买入持有基准在第 2 根 K 线（索引 `1`）开盘时以相同初始资金、相同滑点与手续费全仓买入并持有至期末。
    3. **收盘估值阶段（Bar `i` Close）**：按 `cash + shares × bars[i].close` 计算当日策略权益与回撤，并同步记录基准权益与基准回撤。
    4. **信号计算阶段（Bar `i` Close）**：严格仅读取 `bars[0..i]` 计算当根指标并决定是否生成供给第 `i + 1` 根开盘执行的信号：
       - **双均线交叉（`ma_cross`）**：`computeCausalSmaAt(bars, i, fast)` 与 `slow` 对比前一有效值判断金叉买入 / 死叉卖出。
       - **布林带（`bollinger`）**：`computeCausalBollingerAt(bars, i, period, k)` 计算总体标准差轨道；`close < lower` 买，`close > middle`（或 `close > upper`，由 `sellTarget` 控制）卖。
       - **RSI 阈值（`rsi`）**：`CausalWilderRsi` 逐根增量推进 Wilder 平滑；`rsi < oversold` 买，`rsi > overbought` 卖。
       - **末根保护**：当 `i === bars.length - 1` 时，即使产生信号也因无下一根而不成交，记入 `unexecutedLastSignal` 供界面透明提示。
- **单元测试（`tests/backtest.test.ts` + `pnpm test`）**：
  - 根目录 `package.json` 新增 `"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.ts"`，执行 `pnpm test` 即可离线运行，不依赖外网。
  - 测试用例覆盖（共 11 项断言组）：
    1. **严格无未来函数（MA / BOLL / RSI）**：篡改成交根收盘/高低价及后续全部 K 线，验证此前信号、成交价与前缀权益曲线完全不变；验证每笔成交满足 `barIndex === signalBarIndex + 1` 且价格等于该根开盘含滑点价；验证末根信号不成交。
    2. **手续费与最低费用精确计算**：构造确定性交叉序列，分别验证「费率主导」与「最低费用主导」两种场景下的买卖手续费、已实现净盈亏与期末现金与手算结果精确一致。
    3. **滑点方向与 1 倍现货红线**：验证买价上滑/卖价下滑；验证空仓遇到死叉卖出信号被严格忽略（零卖空、持仓非负）；验证传入 `leverage !== 1` 或 `allowShort === true` 时抛出安全异常；验证固定比例仓位不超额。
    4. **离线真实样本验证**：直接读取本地 `packages/market-adapters/data/samples/US_AAPL_1D.json` 跑双均线 `MA(5/20)`，验证曲线完整、交易合法且无 `NaN/Infinity`。
- **回测 UI 与主图标记（`BacktestPanel.tsx`、`BacktestEquityChart.tsx`、`BottomDock.tsx`、`KLineChartStage.tsx`）**：
  - 入口位于底部停靠栏 **「策略回测」** 标签（支持标准高/加高切换），自动绑定活动图当前品种与周期，并在回放模式下提供「仅用回放前缀 / 全部已加载数据」开关。
  - 结果区包含：样本数据醒目警示条（`⚠ 基于历史样本数据，非实时，仅供学习` + 来源与区间）、常驻免责声明（`教学用途，不构成投资建议`）、6 张核心 KPI 汇总卡、双线权益对比图（策略实线 vs 买入持有虚线 + 悬停读数）、交易明细表（含 CSV 导出）与规则说明页。
  - 主图通过独立 Overlay 分组 `tb_backtest_overlays` 与自定义 `tbBacktestMarker` 渲染 **菱形买卖点**（天蓝 `测·买` / 紫红 `测·卖`），与模拟盘三角形标记明显区分，并支持在面板内及图表左上角快捷按钮开关；回放模式下同步按回放时间戳裁剪标记，杜绝未来点显示。

---

## 4. 内置样本与在线数据源对照表

| 市场 | 品种 | 无 Key 离线/回退行为 | 无 Key 联网公开源 | 有 Key 在线增强 |
|---|---|---|---|---|
| **美股** | `AAPL / MSFT / TSLA / AMZN` | 捆绑真实历史 1D（AAPL 另含 60m） | SEC EDGAR `companyfacts` 财报、监管公告与财报申报 | TwelveData / Polygon (60m & 1D)、Finnhub、EODHD |
| **A 股** | `600519.SH / 000001.SZ / 600036.SH` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `TUSHARE_TOKEN`（1D EOD + 财报）或可选 `ENABLE_BAOSTOCK=true` |
| **港股** | `00700.HK / 09988.HK / 03690.HK` | 捆绑真实历史 1D 样本 | 宏观资讯/日历可切换全市场查看 | `EODHD_API_KEY`（1D EOD） |
| **期货与指数** | `QQQ / VTI / SP500 / NASDAQCOM` | `QQQ/VTI/SP500` 捆绑样本（QQQ 含 60m）；`NASDAQCOM` 给联网提示 | `SP500`、`NASDAQCOM` 直连 FRED 官方 CSV；宏观 RSS & iCal | `QQQ / VTI` 支持 TwelveData / Polygon / Finnhub / EODHD |

---

## 5. 已知限制与演进边界

- **本地数据边界**：模拟盘账户、自选分组、工作区模板、本地提醒、研究笔记与用户偏好均存浏览器 `localStorage`，不提供云端同步或账号体系；可通过内置 CSV / JSON 导出进行本地备份。
- **提醒运行边界**：本地提醒完全在浏览器页面进程内轮询/响应数据更新评估，**仅本页面打开时生效，关闭页面不会推送**；浏览器原生通知依赖用户点击授权及操作系统/浏览器通知权限。
- **回测与模拟盘教学简化边界**：
  - 固定 1 倍现货、禁止卖空、禁止杠杆、禁止融资融券；跨市场品种在单一虚拟账户内按面值 1:1 记账，不含汇率换算。
  - 回测引擎默认按整数股/份向下取整成交（不透支现金），不模拟涨跌停无法成交、盘口深度冲击、分红除权复权调整、借券利息或组合多标的轮动。
  - 回测仅覆盖当前活动图已加载的 K 线区间（无 Key 时个股为内置历史样本区间），结果仅供策略原理学习与验证。
- **无 Key 数据边界**：个股无免 Key 实时行情；无 Key 财务数据仅支持美股 SEC EDGAR；筛选器覆盖本地目录 14 个核心品种。
- **永久红线**：严禁真实交易、券商下单、真实资金字段、融资融券、杠杆、卖空以及任何 TradingView 商标、源码或网页爬虫。
