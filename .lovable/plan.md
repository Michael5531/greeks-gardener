## 目标

把 GEX 分析升级为多到期日叠加视图，全站加上实时行情条与交易时段标识，并新增"实时盘口"和"历史期权流"两个页面。

## 1. GEX 分析的两张图 → 改成 Greeks3D 同款样式

参考图 1：横轴 strike，Call 在上 / Put 在下，多个到期日按颜色叠加（堆叠柱状图），underlying price 用虚线表示。

- 顶部把目前的"快速到期 / 单选到期"改成与 3D Greeks 一致的多选到期日（Badge + Popover Checkbox + 重置默认）。
- 主图（GEX 按 strike）替换为：
  - 同样的 `DTEStackedChart` 形态：每个到期日一种颜色，Call 用正值（上）、Put 用负值（下），按 stackId 叠加。
  - 数值同时支持两种切换：**OI / Net GEX**，用 Tabs 控制。
  - underlying price 用 ReferenceLine 虚线 + "Spot $xxx" 标签；Zero Gamma 也保留。
- 第二张图（DTE 分布）替换为同样风格，但横轴是到期日，纵轴一组按 strike 颜色分桶 / 或 Call+/Put- 叠加。最简洁做法：保留按到期日 X 轴，把 callOI/putOI 用同样上下叠加 + |Net GEX| 副轴折线。

> 把 `DTEStackedChart` 抽到 `src/components/charts/DTEStackedChart.tsx`，让 GEX 与 Greeks3D 共用。

## 2. 顶部全站行情条（实时）

新增 `src/components/MarketStatusBar.tsx`，在 `AppLayout` 顶部渲染（sticky）：

- **市场时段**：由前端基于美东时间计算 `pre-market / regular / after-hours / closed`，再用 polygon `/v1/marketstatus/now` 校正（新增 proxy action `market-status`，10s 轮询）。
- **当前 underlying 实时报价**：从 URL `?ticker=` 读取。每 ~3s 调用 polygon `ticker-snapshot` 获取最新价、涨跌、涨跌幅，做成跳动样式（颜色按方向闪一下）。
  - 新增 hook `src/hooks/useLiveQuote.ts`：可见性感知（`document.visibilityState`），不在标签页时停轮询；用 SWR 风格的 setInterval。
- 同步把 GEX 与 Greeks3D 页面里的 `spot / underlyingPrice` 改成消费这个 hook，保持页面内"现价"标签实时更新；ReferenceLine 的虚线也跟着移动。

## 3. 新增"实时盘口" `/app/orderbook`

页面流程：搜索 underlying → 选 expiration（DTE）→ 选 strike → 选 Call/Put → 渲染该期权合约的 quotes & trades 深度热力图。

- 后端 proxy 新增 actions：
  - `option-quotes`：`/v3/quotes/{optionTicker}?timestamp.gte=...&order=desc&limit=5000`
  - `option-trades`：`/v3/trades/{optionTicker}?timestamp.gte=...&order=desc&limit=5000`
  - `option-snapshot-single`：`/v3/snapshot/options/{underlying}/{optionTicker}`（拿 last quote/trade）
- 页面：
  - 选完合约后，每 ~2s 拉最近 N 分钟 quotes & trades；
  - **Heatmap**：X 轴 = 时间 bin（如 5s），Y 轴 = 价格 bucket，颜色亮度 = 该 bucket 上 bid/ask 累计 size（quotes）或成交量（trades）。两张并排：Quotes Depth / Trades Volume。
  - 顶部显示 last bid/ask/size、spread、midprice。
  - 仅在交易时段（regular hours）开启轮询；其它时段显示提示 + 仍可看历史最近样本。
- 组件 `src/pages/app/Orderbook.tsx` + `src/components/charts/HeatmapCanvas.tsx`（用 canvas 自绘，避免 recharts 在大量数据下卡顿）。
- 路由 + 侧栏入口（icon: `Layers`，label: "实时盘口"）。

## 4. 新增"历史期权流" `/app/flow`

复刻图 2 那个 historical_flow 工具，并提供可视化。

输入参数（全部可调，UI 用 Form）：
- ticker
- from-date / to-date（日期选择）
- max-contracts（默认 12）
- limit-per-contract（默认 1500）
- top（默认 10）
- 阈值：min size、min premium（用于"large prints"过滤）
- sweep 检测窗口（毫秒）、sweep 最小腿数

实现：
- 新增 edge function `supabase/functions/historical-flow/index.ts`：
  1. 调 `/v3/reference/options/contracts?underlying_ticker=&as_of=` 选出期间最活跃的 N 个合约（按 OI/volume 排序的快照取近似，或多日 aggregates 求和）。
  2. 对每个合约分页拉 `/v3/trades/{ticker}` 与 `/v3/quotes/{ticker}`（限 limit-per-contract 行）。
  3. 计算：`large single prints`（size ≥ minSize 或 premium ≥ minPremium）。每条标注 "no quote / at bid / at ask / mid"（用最近 quote 比较）。
  4. 计算：`sweep candidates`（同方向、同价位、跨多个交易所的快速连发；窗口内 ≥ k 笔）。
  5. 返回结构化 JSON：contracts、largePrints[]、sweeps[]、统计。
- 前端 `src/pages/app/Flow.tsx`：
  - 左边 Form（所有参数），右边结果。
  - **表格**：复现图 2 那种 large prints 列表（时间、合约、价格、size、premium、context）。
  - **可视化**：
    - 时间轴散点图：X = time，Y = strike，点大小 = premium，颜色 = call(绿) / put(红)，形状 = bid/ask/mid。
    - Top contracts 横向条形图：按合约总 premium 排名。
    - Premium 直方图。
- 路由 + 侧栏入口（icon: `History`，label: "历史期权流"）。

## 技术细节

- Polygon endpoints
  - market status: `/v1/marketstatus/now`
  - option quotes/trades: `/v3/quotes/{O:...}`, `/v3/trades/{O:...}`
- 实时轮询统一封装 `useInterval(fn, ms, {enabled})`。
- Heatmap：纯 canvas，避免 recharts 高频重渲染；桶大小按价格区间 / 时间 bin 自适应。
- 颜色全部走 design tokens（`--bull`, `--bear`, `--primary`, `--accent`），不要硬编码。
- DTEStackedChart 与 ExpiryLineChart 提到 `src/components/charts/`，GEX 与 Greeks3D 共用。

## 文件改动清单

新增
- `src/components/MarketStatusBar.tsx`
- `src/hooks/useLiveQuote.ts`
- `src/hooks/useInterval.ts`
- `src/components/charts/DTEStackedChart.tsx`（提取共用）
- `src/components/charts/HeatmapCanvas.tsx`
- `src/pages/app/Orderbook.tsx`
- `src/pages/app/Flow.tsx`
- `supabase/functions/historical-flow/index.ts`

修改
- `src/components/AppLayout.tsx`：嵌入 MarketStatusBar + 新增两个侧栏入口
- `src/App.tsx`：注册 `/app/orderbook`, `/app/flow`
- `src/pages/app/GEX.tsx`：换成多到期日选择 + DTEStackedChart + Spot 实时虚线
- `src/pages/app/Greeks3D.tsx`：spot 接 useLiveQuote
- `supabase/functions/polygon-proxy/index.ts`：新增 actions `market-status`, `option-quotes`, `option-trades`, `option-snapshot-single`
- `src/lib/polygon.ts`：补对应 client 函数

## 待确认
- 历史流页面的"sweep 候选"判定阈值是否要可调（计划已经包含），有没有特别的口径？
- Orderbook heatmap 的时间窗口默认想要多长（比如 5min / 15min / 30min）？
- 实时轮询频率：报价 3s / 盘口 2s 是否 OK？（Polygon REST 有限速，太高会触发 429）
