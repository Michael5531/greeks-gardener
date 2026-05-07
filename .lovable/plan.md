## 计划：Flow 图表升级 + 期权价值计算器 + 回测策略库

### 1. 历史期权流：Call/Put 双向条形图

在 Flow 页（`src/pages/app/Flow.tsx`）的"时间×Strike 散点图"下方新增一张组合图：
- X 轴：时间（按合约或按时间分桶）
- Y 轴：premium 数值
- **Call 大单：正值（向上柱状）**，使用 `hsl(var(--bull))`
- **Put 大单：负值（向下柱状）**，使用 `hsl(var(--bear))`
- 鼠标 hover 显示 strike / size / premium / 合约
- 用 recharts `ComposedChart` + `ReferenceLine y=0`

### 2. 期权价值计算器（新增 `OptionPricer` 卡片，放在 Flow 页底部）

允许用户独立计算单个合约的潜在 PnL：
- 输入：标的（TickerSearch，自动拉当前 spot）
- 选择：DTE（数字输入）、Call/Put、Strike、IV%、利率%
- 输入：标的价格变动（百分比 slider，-20% ~ +20%）+ IV 变动（slider，-30% ~ +30%）+ 时间流逝天数
- 实时计算：
  - 当前理论价（BS）
  - 新理论价（spot/IV/T 调整后）
  - 期权价格变动 Δ$
  - PnL（按 1 contract = 100 股）
- 输出一条 **PnL 曲线**：X = 标的价格（spot ± 20%），Y = 单合约 PnL，零线参考

技术：在前端 `src/lib/blackScholes.ts` 新建一个纯函数 BS pricer（复用 `run-backtest` 里的 `bs/N/erf` 逻辑），无需后端调用。

### 3. 策略库 + Payoff 可视化（Backtest 页升级）

在 `src/pages/app/Backtest.tsx` 顶部"策略"下拉中新增完整策略列表：
- Long Call / Long Put
- Covered Call / Cash-Secured Put（已有）
- LEAP Call（DTE ≥ 365 的 long call）
- Vertical Call/Put Spread（debit & credit）
- Straddle / Strangle（long & short）
- Iron Condor / Iron Butterfly
- Calendar Spread
- Collar

下拉选中后立即在表单下方展示 **Strategy Card**（不依赖回测运行，纯前端计算）：
- **Max Loss / Max Profit / Breakeven(s)** — 公式硬编码到策略元数据
- **历史 Win Rate**：从 `backtests` 表查询同 strategy_type 历史结果均值（若无则显示"暂无历史"）
- **Win Fill / 盈利率分布**：相同来源的简单聚合
- **Payoff 曲线**：纯前端 `ComposedChart`
  - X 轴：到期时标的价格（spot ± 30%，101 个点）
  - Y 轴：到期 PnL（含权利金）
  - **额外画一条"今日 PnL"曲线**（用 BS 计算未到期价值）
  - 零线、breakeven 垂直参考线、当前 spot 垂直参考线

### 4. 后端扩展（最小改动）

`supabase/functions/run-backtest/index.ts` 新增 strategy_type 分支：
- 当前只实现 `covered_call` / `cash_secured_put`
- 本次先只把 **long_call / long_put / leap_call / straddle** 接入引擎（每根 K 线开/平单腿或双腿 BS 估值），其余多腿策略**仅前端 payoff 展示**，回测按钮提示"暂不支持引擎回测"

### 文件改动清单

新建：
- `src/lib/blackScholes.ts` — 前端 BS pricer + greeks
- `src/lib/strategies.ts` — 策略元数据（legs / max loss / payoff function）
- `src/components/OptionPricer.tsx` — 期权计算器卡片
- `src/components/StrategyCard.tsx` — 策略详情 + Payoff 曲线

编辑：
- `src/pages/app/Flow.tsx` — 加 Call↑/Put↓ ComposedChart + 嵌入 `<OptionPricer/>`
- `src/pages/app/Backtest.tsx` — 扩展策略下拉 + 嵌入 `<StrategyCard/>`
- `supabase/functions/run-backtest/index.ts` — 新增 long_call/long_put/leap_call/straddle 分支

### 待澄清

1. 期权计算器的 IV 默认值你想从哪里取？（a）用户手填默认 30%（b）从当前 chain ATM IV 自动拉取
2. 多腿策略（Iron Condor、Spread 等）是否需要回测引擎支持？还是本期只要 Payoff 可视化即可？