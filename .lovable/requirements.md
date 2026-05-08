# Opti-X 需求文档（v2 · 多腿计算 + 性能）

## 1. 多腿期权构建器 `OptionLegsBuilder`

### 字段
| 字段 | 来源 | 说明 |
|---|---|---|
| `side` | 用户 | Buy(long) / Sell(short) |
| `type` | 用户 | Call / Put |
| `expiration` | `useOptionsChain.expirations` | 全部到期日下拉 |
| `strike` | chain 按 expiration 过滤 | 仅显示该到期日实际存在的 strike |
| `qty` | 用户 | ≥1，整数 |
| `iv` | 自动 | 选中合约 `implied_volatility`，可被 BS 反解覆盖 |
| `mid` | 自动 | (bid+ask)/2，仅展示 |

### 操作
- **Add Leg**：追加一条与最后一条相反 side 的 leg（便于做 spread）
- **Copy / Delete**：每行操作
- **首条默认**：ATM、最近 ≥20 DTE 的 long call

## 2. 期权价值计算器（`OptionPricer`）

- 嵌入位置：历史期权流页面底部
- 用 `OptionLegsBuilder` 替代旧的单腿表单
- 模拟控件：标的 ±20%、IV ±30pp、时间流逝 0..min(DTE)−1 天
- 输出：组合现值、预测值、ΔPnL、净 Δ/Γ/Θ
- 图表：
  - 主图（PnL 曲线）：到期 PnL（实线）+ 今日 PnL（虚线）+ Spot 红色虚线（`hsl(var(--primary)) strokeDasharray="3 3"`，label `Spot $X.XX`）+ 各 breakeven
  - 副图（标的走势）：过去 30 个交易日收盘价 + 同样的 Spot 红色虚线

## 3. 策略回测（`Backtest`）

- 策略下拉新增 `Custom · 自选 Legs`
- 选中后展示同一 `OptionLegsBuilder`
- `run()` 时 body 增加 `custom_legs:[{type,side,strike,dte,iv,qty,expiration}]`
- `MiniGEX` / `StrategyCard` 必须显示 Spot 红色虚线

## 4. 后端契约

### `compute-pricer-multileg`
```
POST { ticker, spot, legs:[{type,side,strike,dte,iv,qty,expiration?}],
       pctMove?, ivMove?, daysPassed?, withUnderlying? }
→ { legs, currentValue, projectedValue, dPrice, greeks{delta,gamma,theta,vega},
    curve:[{price,expiry,today}], breakevens:[number],
    underlying:[{t,c}], maxProfit, maxLoss, source }
```
- TTL: 60s（命中 `compute_cache` table，唯一索引 `(kind,cache_key)`）
- 响应头：`Cache-Control: public, max-age=30, stale-while-revalidate=60`

### `run-backtest`（扩展）
- 当 `strategy_type==="custom"` 时读取 `custom_legs`，每条 leg 的 strike 与 dte 直接使用绝对值

## 5. 性能 SLO 与设计决策

| 指标 | 目标 |
|---|---|
| 缓存命中响应 | P50 < 80ms |
| 冷计算（pricer / payoff） | P50 < 400ms |
| GEX / IV-Surface 冷计算 | P50 < 1500ms |
| 同 ticker 跨页面切换 | 100% 命中（react-query staleTime ≥60s） |

### 已采取的优化
1. 所有 `compute-*` hook 改为 `@tanstack/react-query`，跨组件共享缓存
2. `useComputePricer` / `useComputePricerMultileg` 加 300ms debounce，滑块拖动不再洪水请求
3. Edge function 响应附带 `Cache-Control` 让浏览器/CDN 复用
4. `compute_cache` 已存在 `(kind,cache_key)` 唯一索引（确认）
5. 客户端 `polygon-proxy` 调用层使用 in-memory cache + in-flight dedup

### 后端慢的根因
- Lovable Cloud edge function 冷启动 + Supabase 请求转发开销 ~200–400ms/次
- 升级实例规格可显著降低冷启动：Lovable Cloud → Backend → Advanced settings → Upgrade instance