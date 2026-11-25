# Trade Buddy 第四批 —— 总任务说明（本地版）

先读：`docs/plan/PLAN.md`、`README.md`、`IMPLEMENTATION.md`、`docs/brief/BATCH3*.md`，以及现有代码（尤其 `apps/web/src/lib/paper-trading*.ts(x)`、`replay-store.tsx`、`TerminalWorkspace.tsx`、`KLineChartStage.tsx`、`WatchlistAndDetails.tsx`、`BottomDock.tsx`）。

本批分 A/B/C 三轮，每轮有单独 brief，只做当前轮。

## 必须遵守
- 原创品牌 Trade Buddy；无 TradingView 名称/Logo/图标/源码。
- 只做本地运行：不上云、不写 Docker、不登录。
- 仅研究与**虚拟**模拟：无真实交易、无券商、无杠杆、无融资、**无卖空**。回测与模拟盘都是 1 倍现货。
- 不爬 TradingView 或私有接口；不读、不打印、不提交任何 token（尤其不要碰 `/workspace/stonequant-data/.tushare_env`）；不提交 `.env*`、`node_modules`、`.next`。
- 中文界面；默认绿涨红跌可切。无 API key 时一切新功能可用或给清晰空状态。
- 不要破坏前三批已能用的功能（多图、回放、筛选、财务、设置、资讯、日历、测距尺、模拟盘）。
- 本地数据存 localStorage 或 IndexedDB；导出用浏览器下载（CSV/JSON）。
- 完成后不要 git commit / push。

## 四件事（总览）
1. 模拟盘增强：主图叠加持仓成本线、挂单价线、买卖点；复盘统计（权益曲线、最大回撤、胜率、盈亏比）及 CSV 导出；可设置手续费与滑点。
2. 自定义自选分组（新建/改名/删除/拖动排序）；布局、品种、指标、画线的本地模板保存/切换/导入导出 JSON。
3. 本地提醒：价格上/下穿、涨跌幅、均线金叉死叉、RSI 阈值；页内通知 + 可选浏览器通知；图上提醒线；明确写「仅页面打开时生效」。
4. 教学回测沙盒：双均线、布林、RSI 等预设，参数可调；1 倍现货、无杠杆、无卖空；含手续费与滑点；**不得用未来数据，信号在下一根 K 线开盘价成交**；输出权益曲线、与买入持有对比、交易列表；主图标买卖点；样本数据要标明。需要单元测试（无未来函数、手续费计算）。

README 与 IMPLEMENTATION 在 C 轮统一更新。
