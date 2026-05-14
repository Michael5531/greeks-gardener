## 问题诊断

当前 `Backtest.tsx` + `run-backtest` edge function 存在的真实问题：

1. **Underlying 价格不准/对不上**
   - Polygon aggregates 用 `adjusted=true`，会被股息/拆股回填，跟用户在期权链/Dashboard 看到的实时价格存在偏差。
   - 回测结果只画 `equity_curve`（cash），从没把 underlying 同期 K 线/收盘价画出来，用户没法对照。
   - 时间戳用 `new Date(bar.t).toISOString().slice(0,10)`，UTC 截断，美东收盘日有时会偏一天。

2. **PnL 计算可疑**
   - 持仓期间 `cash` 不动，`equity.push({date, value: cash})` 是平的，只在平仓那天跳一次 → 曲线"阶梯化"不像真实 MTM。
   - profit_take / stop_loss 对 credit 策略的判定写得绕，容易误触发。

3. **缺少用户期望的输入**
   - 没有"假设买入时间点 / 买入价格"
   - 没有 BS 未来定价的完整模型参数（r、σ、q 股息、未来 IV 路径）
   - 没法看单笔合约从买入到到期的 option price / Greeks 演化

---

## 方案

### A. 后端 `run-backtest` 重写（保持向后兼容，新增 `mode`）

新增 `mode: "single_trade"`（默认仍是旧的 `"strategy_loop"`，保留历史回测列表能继续显示）：

入参（single_trade）：
```ts
{
  mode: "single_trade",
  ticker, entry_date,                // 必填
  entry_spot_override?: number,      // 可选，留空则用 entry_date 当日 close
  legs: [{ type, side, strike, expiration, qty, entry_premium? }],
  bs: { r: number, q: number, iv: number, iv_path?: "constant"|"realized" },
  end_date?: string,                 // 默认 = 最远到期日
}
```

执行：
1. 拉 Polygon `aggs/.../range/1/day/{entry_date}/{end_date}` **`adjusted=false`**（原始价，与盘面一致），按 `America/New_York` 把 `t` → 交易日字符串，避免时区漂移。
2. 入场：`S0 = entry_spot_override ?? bars[0].c`；每条 leg 若没传 `entry_premium`，用 BS(`S0, K, T0, r, iv, type`) 自动算。
3. 每日循环：
   - `T = max((expiry - bar_date)/365, 1/365)`
   - 每条 leg 计算 BS price + Greeks（Δ Γ Θ Vega）
   - 组合 MTM = Σ side_sign × (now_premium − entry_premium) × qty × 100
   - 输出每日 `{date, spot, leg_prices[], net_premium, pnl, delta, gamma, theta, vega}`
4. 到期日：内在价值收敛；之后不再产生数据点。
5. 不写 `backtests` 表（这是 what-if，不污染历史回测列表），直接把结果回给前端。

**Underlying 准确性的修复同时下沉到旧的 strategy_loop 路径**：`adjusted=false` + 纽约时区日历。

### B. 前端 `Backtest.tsx`

在策略选择栏旁加一个 Tab：
- `策略循环回测`（现有功能，修过 underlying 准确性）
- `单笔合约推演`（新增，对应 single_trade）

单笔推演面板字段：
- 标的（沿用全局选中）
- 假设买入日期（DatePicker，默认 30 天前最近交易日）
- 买入价（可选，留空=当日收盘；显示当日 close 作为 placeholder）
- Legs builder：复用 `OptionLegsBuilder`（已有 type/side/strike/expiration/qty/iv）
- BS 参数：r（默认 0.045）、q（默认 0）、IV（默认取 leg 自身 IV）、未来 IV 路径（恒定/已实现波动率，先实现"恒定"，realized 留 TODO）
- 推演结束日期（默认 = 最远到期）

结果区：
- 顶部 KPI：当前 PnL、最大盈亏、距到期天数、净 Δ/Γ/Θ/Vega
- 主图：双 Y 轴线图 — 左轴 Option 组合 MTM（$），右轴 Underlying 收盘价（同区间，原始价）
- 副图：Greeks 演化（4 条线）
- 表格：每日明细可下载（前端 CSV 导出）

### C. 字符串/i18n 与一致性

- `pricerExt` 里加几个新 key（entryDate / entryPrice / bsParams / divYield / forwardIv / singleTrade）
- 同步 `zh.ts` + `en.ts`

---

## 技术要点

- **时区**：用 `Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', ...})` 把 epoch ms 转日期字符串，确保跟期权链、Polygon 显示日历一致。
- **adjusted=false**：保持与用户在 Chain/Dashboard 看到的 last trade 一致。BS 估值不需要复权价。
- **缓存**：single_trade 不进 cache（输入空间太大、等价于即时计算），strategy_loop 维持现状。
- **不动数据库**：不需要新表/迁移；`backtests` 表保留给策略循环回测。
- **多腿 Greeks**：long sign=+1，short sign=-1，组合 Greek = Σ sign × greek × qty。

---

## 文件改动清单

- `supabase/functions/run-backtest/index.ts` — 新增 `mode` 分支 + single_trade 实现 + adjusted=false + NY 时区日历
- `src/pages/app/Backtest.tsx` — 顶部 Tabs，新增 `<SingleTradeSim />` 子组件
- `src/components/SingleTradeSim.tsx` — 新组件（输入面板 + 双轴主图 + Greeks 副图 + 明细表）
- `src/i18n/zh.ts`、`src/i18n/en.ts` — 文案
- 不新建表，不改 RLS

完成后用 `curl_edge_functions` 跑一次 single_trade 验证返回结构，再在前端核对图表对齐。