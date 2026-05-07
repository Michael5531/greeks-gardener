## 目标

把当前在浏览器里跑的"重计算"全部搬到后端（Supabase Edge Functions），结果落入 Postgres 缓存表，前端从缓存读取已经算好的 JSON 直接渲染。
**不改**：UI、布局、Polygon 直连行情逻辑（`callPolygon` / `useLiveQuote` 等保持原样）、轻量 filter/sort/format。

---

## 范围（什么算"重计算"）

| 当前位置 | 计算内容 | 搬到哪 |
|---|---|---|
| `src/pages/app/Signals.tsx`（scan 函数 ~200 行：拉链 + 7 种策略匹配 + 写库） | 多策略扫描 | 新 edge function `scan-signals` |
| `src/pages/app/GEX.tsx`（含按 strike / 按 expiration 的 GEX 聚合 + flip 计算） | GEX 聚合 / Gamma flip / Net GEX | 新 `compute-gex`（替代/增强现有 `analyze-gex`） |
| `src/pages/app/Greeks3D.tsx`（IV smile + IV surface heatmap 的 acc map） | IV surface 网格、smile 拟合 | 新 `compute-iv-surface` |
| `src/pages/app/Backtest.tsx` 内嵌的 `MiniGEX` | 同上 GEX 聚合 | 复用 `compute-gex` |
| `src/components/OptionPricer.tsx`（BS 价 + 投影曲线） | BS pricing / payoff projection | 新 `compute-pricer` |
| `src/lib/strategies.ts` 的 `payoffCurve`（StrategyCard 等使用） | payoff/breakeven/maxP/maxL | 新 `compute-payoff` |
| `src/pages/app/Flow.tsx` 现有过滤/聚合（unusual/sweeps、scatter 准备） | 异常流分桶、sweep 聚合 | 新 `compute-flow-aggregates`（在 `historical-flow` 之上加分析层） |
| `run-backtest`（已经在后端）| ✓ 已经在后端 | 不动 |

**保留在前端**：
- `callPolygon` 实时行情（snapshot/quote/ticker），ticker 切换、UI state
- 列表的 `.filter`/`.sort`/`.map` 这种 O(n) 的展示层转换
- `recharts` 渲染本身

---

## 数据流（统一模式）

```text
前端                Edge Function           Polygon       Postgres 缓存表
──────────────────────────────────────────────────────────────────────
useGEX(ticker,exps)
  └─ supabase.functions
     .invoke('compute-gex')  ──►  1) SELECT cache WHERE key,fresh
                                  2) 命中 → return                   
                                  3) miss  → fetch chain ──► Polygon
                                          → 计算
                                          → INSERT cache
                                          → return rows
  ◄────────── { rows, total, flip, spot, computed_at } ──────────────
渲染 BarChart
```

每个 endpoint 都遵循：
1. 校验入参 (zod)
2. 查缓存表 `compute_cache`，按 (kind, key, fresh_until) 命中直接返回
3. 未命中：调 `polygon-proxy` 内的逻辑（抽公共模块） → 计算 → upsert 缓存 → 返回
4. 返回 `{ data, computed_at, source: 'cache'|'fresh' }`

---

## 数据库

新增 1 张通用缓存表（够用，避免 7 张表）：

```sql
create table public.compute_cache (
  id uuid primary key default gen_random_uuid(),
  kind text not null,            -- 'gex' | 'iv-surface' | 'signals' | 'payoff' | 'pricer' | 'flow-agg'
  cache_key text not null,        -- 例如 'AAPL|2024-01-19,2024-02-16'
  payload jsonb not null,
  computed_at timestamptz not null default now(),
  fresh_until timestamptz not null,
  unique (kind, cache_key)
);
create index on public.compute_cache (kind, cache_key);
create index on public.compute_cache (fresh_until);
```

RLS：只允许 `service_role` 写；`authenticated` 可读（结果不含敏感数据）。

各 kind 的 TTL：
- `gex` / `iv-surface` / `flow-agg`：盘中 60s，盘后 10min
- `signals`：5min
- `payoff` / `pricer`：纯函数 → 1h（key 含全部输入）

---

## 新增/修改文件

### 后端（新建）
- `supabase/functions/_shared/polygon.ts` — 把现 `polygon-proxy` 里取链/取过期日的代码抽成函数，供别的 function 复用
- `supabase/functions/_shared/cache.ts` — `getCached(kind,key)` / `setCached(kind,key,payload,ttlSec)`
- `supabase/functions/_shared/blackScholes.ts` — port `src/lib/blackScholes.ts`
- `supabase/functions/scan-signals/index.ts`
- `supabase/functions/compute-gex/index.ts`
- `supabase/functions/compute-iv-surface/index.ts`
- `supabase/functions/compute-payoff/index.ts`
- `supabase/functions/compute-pricer/index.ts`
- `supabase/functions/compute-flow-aggregates/index.ts`
- 更新 `supabase/config.toml`：每个新 function 加 `verify_jwt = true`（含 user 上下文的 scan-signals）或 `false`（纯计算的 payoff/pricer）

### 前端（瘦身）
- `src/pages/app/Signals.tsx` — `scan()` 改为单次 `supabase.functions.invoke('scan-signals')`，删除内联策略匹配代码
- `src/pages/app/GEX.tsx` — 删除 `useMemo` 内的 strike/expiration 聚合，改 `useGEXCompute(ticker, selectedExps)` 直接拿 `{ strikeRows, expRows, total, flip }`
- `src/pages/app/Greeks3D.tsx` — IV surface 的 `acc` map 重计算改 `useIVSurface(ticker, selectedExps)`
- `src/pages/app/Backtest.tsx` — `MiniGEX` 改为调 `compute-gex`，删本地 cache map
- `src/components/OptionPricer.tsx` — `bsPrice` 调用换成 `compute-pricer` 返回的 `{current, projected, gridPoints}`，保留滑块 UI
- `src/components/StrategyCard.tsx` — `payoffCurve` 调用换成 `compute-payoff`
- `src/pages/app/Flow.tsx` — unusual/sweep 的 reduce 和 scatter 转换搬到 `compute-flow-aggregates`，前端只解构 `{ unusual, sweeps, scatterCalls, scatterPuts }`
- `src/lib/strategies.ts` — 保留 `STRATEGIES` 元数据（UI 文案）；删除/标记 `payoffCurve` 不再前端使用
- `src/lib/blackScholes.ts` — 保留以便偶发预览，但运行时不再被 hot path 调用
- `src/hooks/` — 新增 `useComputeGEX`, `useComputeIVSurface`, `useComputePayoff`, `useComputePricer`，封装 invoke + SWR-style 缓存

---

## 实施顺序

1. 迁移：建 `compute_cache` 表 + RLS
2. 共享模块：`_shared/polygon.ts`, `_shared/cache.ts`, `_shared/blackScholes.ts`
3. 后端 functions（一次性 6 个），用 `supabase--curl_edge_functions` 抽样验证
4. 前端 hook + 页面替换（每页改完立刻在 preview 验一下图表正常）
5. 删除前端 dead code（`payoffCurve`、Signals 的策略匹配等）

---

## 已确认的取舍

- 数据获取：**全走后端代理**（不再在前端 `getOptionsChain`，由 functions 内部调 polygon-proxy）
- 新鲜度：**结果落 DB 缓存**，前端读 cached payload；按 TTL 自动过期，不做 cron 预热（按需触发即可）
- 不改 UI / 路由 / 文案 / 主题

---

## 风险

- Edge function 单次执行最多 ~150s，IV surface 多 expiration 时调链次数多 → 用并发 fetch + 在 function 内做内存缓存
- Polygon API 限速 → `_shared/polygon.ts` 做 inflight dedup（迁移现有逻辑）
- 缓存表会增长 → fresh_until 过期数据每天一个 cron job 清理（可选，第二步加）