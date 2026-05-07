## 三个修改

### 1. Greeks3D 缓存 bug（必须修）

`Greeks3D.tsx` 里 `extraData` 用 `{ [expiration]: contracts[] }` 缓存，但 key 不包含 ticker。切换标的后旧 ticker 的合约会被当成新 ticker 的数据合并进去，导致看到错误的报价。

修复：
- `extraData` 改为按 ticker 分桶，或在 ticker 变化时清空。
- ticker 变化时也清空 `selectedExps`，避免拿旧标的的到期日去查新标的。
- 同时给 `useOptionsChain` 的 `data` 加一道 ticker 防御过滤（防止 race：旧 ticker 的请求晚于新 ticker 返回）。

### 2. 回测：沿历史日期逐日重取 ATM IV

当前 `run-backtest` 用一个常量 `iv` 跑全程 Black-Scholes，明显失真。改造方案：

- 新增 `iv_mode: "constant" | "historical_atm"` 入参。
- `historical_atm` 模式下，对每根日 K：
  1. 取 spot = 当日 close；
  2. 在 Polygon `v3/snapshot/options` 不可用于历史的情况下，改用 `v3/reference/options/contracts?underlying_ticker&as_of=YYYY-MM-DD` 找当日存在的合约；
  3. 选 DTE 最接近目标、strike 最接近 spot 的 ATM call+put；
  4. 用 `v2/aggs/ticker/{option_ticker}/range/1/day/{date}/{date}` 取当日收盘价；
  5. 反解 IV（牛顿法 in BS），call/put 取均值。
- 命中失败回退到上一根 IV，全部失败则用入参 `iv` 兜底。
- 加一个进度日志（每 10 根输出一次），避免长任务无反馈。
- 前端 `Backtest.tsx` 加单选「假定 IV 模式」：固定 / 历史 ATM 反解，提示后者会显著变慢。

注意：会对每个交易日多发 2-3 个 Polygon 请求，半年回测 ~125 天即 ~400 次调用。需确认你 Polygon plan 的速率。

### 3. 回测页内嵌 mini GEX 面板

在 `Backtest.tsx` 结果区上方加一个折叠区块「当前 GEX 快照」：

- 复用现有 `analyze-gex` edge function（只传 ticker），渲染：
  - Net GEX by strike 横向 bar（紧凑版，高度 240px）；
  - Total GEX、Gamma Flip、Call/Put Wall 三个 stat。
- 仅在 ticker 改变时拉取一次（带 5 分钟前端缓存）。
- 这是「参考用」面板，不参与回测计算。

### 4. Greeks3D 加 IV Surface 第二图层

在现有 IV smile 折线图下方，新增一个 Section「IV Surface（DTE × Strike）」：

- 用 SVG / Canvas 画 heatmap：
  - X = strike，Y = expiration（按 DTE 升序），cell color = IV（蓝→白→红，归一化到当前可见 IV 范围）。
  - 标注当前 spot 的竖线。
  - hover 显示 strike / exp / IV / call+put count。
- 数据源就是已经聚合的 `acc` map，不需要新请求。
- 顺手把 Section 标题加 `(2D heatmap, not WebGL)` 说明，避免和「3D」名字误导。

### 技术细节（开发参考）

- **bug fix**：把 `extraData` 改成 `useState<Record<string, Record<string, any[]>>>` 即 `{ [ticker]: { [exp]: [] } }`，并在合并 / 缺失检查里都带 ticker。
- **iv 反解**：BS 价格对 σ 单调，用 bisection 在 [0.01, 5] 区间 30 次足够；初始猜测 0.3。
- **GEX 缓存**：用 `lib/polygon.ts` 已有的 `callPolygon` 模式，新增 in-memory `Map<ticker, {data, ts}>`，TTL 5min。
- **Heatmap**：直接复用 `components/charts/HeatmapCanvas.tsx` 思路（已存在），但用聚合 IV 数据而不是 quote stream。

### 不做的事

- 不重构 `useOptionsChain`（会牵连太多页面）。
- 不把 Greeks3D 改成真三维 WebGL 渲染（你说要 IV surface 第二图层，2D heatmap 已经够直观且无新依赖）。
