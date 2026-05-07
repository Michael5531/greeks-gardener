## 目标
把前端 6 个文件的重计算逻辑全部切到已部署的 edge functions，前端只负责展示。

## 改动文件

**新建 4 个 hook（统一调用 + react-query 缓存）**
- `src/hooks/useComputeGEX.ts` → 调 `compute-gex`
- `src/hooks/useComputeIVSurface.ts` → 调 `compute-iv-surface`
- `src/hooks/useComputePayoff.ts` → 调 `compute-payoff`
- `src/hooks/useComputePricer.ts` → 调 `compute-pricer`

**改写 6 个前端文件（删除本地重计算，改用 hook 返回值）**
- `src/pages/Signals.tsx` — 删除本地多策略扫描循环，改调 `scan-signals` edge function，渲染返回的 signals 数组
- `src/pages/GEX.tsx` — 删除本地 GEX 聚合 / Gamma flip 计算，改用 `useComputeGEX`
- `src/pages/Greeks3D.tsx` — 删除本地 IV smile 拟合 / OI pivot，改用 `useComputeIVSurface`
- `src/pages/Backtest.tsx` — MiniGEX 部分改用 `useComputeGEX`
- `src/pages/OptionPricer.tsx` — 删除本地 BS 定价 / payoff 投影，改用 `useComputePricer`
- `src/components/StrategyCard.tsx`（如使用 payoffCurve）— 改用 `useComputePayoff`

**精简 lib（保留类型，移除热路径）**
- `src/lib/strategies.ts` — 移除 `payoffCurve` 实现（或标 deprecated，仅留类型）
- `src/lib/blackScholes.ts` — 移除 `bsPrice` 实现（同上）

## 数据流统一为
```text
Component → useComputeXxx() → supabase.functions.invoke('compute-xxx')
         → edge function 查 compute_cache → 命中即返回
                                          → 未命中：polygon-proxy 拉数据 → 计算 → 写缓存 → 返回
```

## 验收
- 浏览器 Network 中 polygon.io 直连请求消失（除非保留行情直连的页面，按上轮决定全部走代理）
- Signals/GEX/Greeks3D/Pricer 页面正常渲染，结果与之前一致
- 二次访问同 ticker 在 TTL 内瞬时返回（命中缓存）

## 不改动
- UI 布局、配色、组件结构
- 认证、watchlist、strategies、backtests 表与流程
- 邮件模板、Index 页文案

确认后我一次性把这 6 个前端文件 + 4 个新 hook + 2 个 lib 精简全部改完。
