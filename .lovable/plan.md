# 计划：多腿期权构建器 + 性能优化 + 需求文档

## 1. 多腿构建器（共用组件）

新建 `src/components/OptionLegsBuilder.tsx`：
- 输入：`ticker`、`spot`、来自 `useOptionsChain(ticker)` 的 `chainData` + `expirations`
- 每条 leg 字段：`side(buy/sell)`、`type(call/put)`、`expiration`（下拉，全部到期日）、`strike`（按所选到期过滤）、`qty`、（自动带出）`mid/last/iv`
- 操作：➕ 添加 leg、🗑 删除、复制
- 输出 `onChange(legs[])`

底层逻辑：从 `chainData` 按 `expiration` 分组生成 strike 列表，并把每条 leg 自动取它在 chain 中的 `mid = (bid+ask)/2`、`iv`、`delta` 显示在行内。

## 2. 期权价值计算器（在历史期权流页面 `Flow.tsx` 中嵌入的 `OptionPricer.tsx`）

把当前单腿 UI 改为「多腿模式」：
- 顶部保留 ticker / spot
- 用 `OptionLegsBuilder` 替换 `Strike/类型/DTE/IV` 四个字段
- 调用新的后端 `compute-pricer-multileg`（见 §4）→ 返回：
  - `currentValue`（组合现值）
  - `projectedValue`（在 ±%spot, ±%IV, days passed 模拟下）
  - 整组 `greeks` 聚合
  - `curve`：Spot 在 `[0.7·spot, 1.3·spot]` 81 点上的「到期 PnL」+「今日 PnL」
  - `underlying`：过去 30 个交易日 spot 走势（用于在同一图叠加价格线）
- 图表：左轴 PnL，右轴 underlying 价格；保留 `<ReferenceLine x={spot}>` 红色虚线（**确保 spot 线被画出**）

## 3. 策略回测 `Backtest.tsx`

- 在策略下拉中新增 `custom` 选项；选中时显示同一个 `OptionLegsBuilder`
- `run()` 时如果是 `custom`，把 legs 数组发到 `run-backtest`（扩展 body：`legs?: Leg[]`）
- `run-backtest` 中接收 `legs` → 用每条 leg 的真实 `expiration / strike` 在每个 bar 上估值（沿用 BS）；其余指标流程不变
- `MiniGEX` 与 `StrategyCard` 中 **强制保留 spot 红色虚线**（已在 StrategyCard 中存在 `x={spot}`，确保不被覆盖）

## 4. 后端新增/修改

新建 `supabase/functions/compute-pricer-multileg/index.ts`：
- 入参：`{ ticker, spot, legs:[{type, side, strike, expiration|dte, iv, qty}], pctMove, ivMove, daysPassed, withUnderlying?:boolean }`
- 用 `_shared/blackScholes.ts` 计算每条 leg 现值、聚合 PnL、聚合 greeks、生成 curve
- 当 `withUnderlying=true` 时，调用 polygon `aggs/1/day` 拉过去 30 天 close 一并返回
- 缓存键 = `ticker|spot|sha(legs)|pctMove|ivMove|daysPassed`，TTL 60s

修改 `supabase/functions/run-backtest/index.ts`：
- 在 `specFor` 之外，增加 `customLegs` 分支：直接把前端传来的 legs 转换成内部 `LegSpec`（支持绝对 strike 与到期日）

## 5. 性能问题分析与修复

**用户感知慢的真实原因（按影响排序）**：

1. **Edge function cold-start**：日志显示 polygon-proxy / compute-* 频繁 `boot` + `shutdown`（~20–30ms 启动 + Supabase 转发开销 ~200–400ms）。每次参数改动都触发新的调用。
2. **客户端无防抖**：滑动 IV / pctMove 滑块时，每次 onChange 都立即 `invoke`，很容易并发 5–10 个请求把后端打慢。
3. **`useComputePricer` 只用 `useRef` 比较 key，没用 react-query**：浏览器跨组件无共享缓存。
4. **`compute-cache` 表 RLS / 索引**：确认 `(kind, cache_key)` 唯一索引存在，避免 upsert 全表扫描。

**修复**：
- 在 `useComputePricer` / `useComputePayoff` / `useComputeGEX` / `useComputeIVSurface` 上加 **300ms debounce**
- 把这 4 个 hook 改为 `@tanstack/react-query`（项目已装），`staleTime: 60_000`，自动跨组件共享
- Edge function 响应增加 HTTP `Cache-Control: public, max-age=30, stale-while-revalidate=60`，让浏览器/CDN 复用
- 检查并补 `compute_cache` 上 `(kind, cache_key)` 唯一约束（如缺则 migration 加上）
- 告知用户：如仍慢，可在 Lovable Cloud → Backend → Advanced settings 升级实例规格以减少 cold-start

## 6. 需求文档

新建 `.lovable/requirements.md`，包含：
- 多腿构建器交互规范（字段、来源、校验）
- 期权价值计算器与回测的统一数据流图
- 后端 `compute-pricer-multileg` 接口契约（请求/响应 JSON schema）
- spot 参考线规范（颜色 `hsl(var(--primary))`，`strokeDasharray="3 3"`，label `Spot $X.XX`）
- 性能 SLO：单次计算 P50 < 400ms，缓存命中 < 80ms

## 改动文件清单

新增
- `src/components/OptionLegsBuilder.tsx`
- `supabase/functions/compute-pricer-multileg/index.ts`
- `.lovable/requirements.md`
- `supabase/migrations/<ts>_compute_cache_unique.sql`（如缺约束）

修改
- `src/components/OptionPricer.tsx` — 单腿 → 多腿
- `src/pages/app/Backtest.tsx` — 加 custom 策略 + 传 legs
- `src/components/StrategyCard.tsx` — 确认 spot 线
- `src/hooks/useComputePricer.ts` / `useComputePayoff.ts` / `useComputeGEX.ts` / `useComputeIVSurface.ts` — debounce + react-query
- `supabase/functions/run-backtest/index.ts` — 接收 custom legs

## 不改动
- 全局布局 / 路由 / 认证 / 其它页面
- 已修复的移动端 ChartSizer 逻辑
