
# 期权策略与回测平台 — MVP 规划

基于您的需求（Polygon.io 数据 + 邮箱/Google 登录 + 仅信号不下单 + Web MVP），我会分阶段构建。先搭好框架和可视化，之后逐步增强策略与智能化。

## 产品蓝图

```text
┌─────────────────────────────────────────────────┐
│  登录 (Lovable Cloud: Email + Google)           │
└─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│  Dashboard                                      │
│  ├─ Watchlist (美股正股)                        │
│  ├─ 策略列表 / 信号面板                         │
│  └─ 最近回测结果                                │
└─────────────────────────────────────────────────┘
            │
   ┌────────┼────────┬────────────┬──────────────┐
   ▼        ▼        ▼            ▼              ▼
[标的选择] [期权链] [3D Greeks] [GEX 分析]  [回测引擎]
                    可视化                   + 策略编辑器
```

## MVP 范围（本轮交付）

### 1. 认证与数据层
- Lovable Cloud：邮箱+Google 登录
- 表：`profiles`、`watchlist`、`strategies`、`backtests`、`signals`
- RLS：用户只读写自己数据
- Polygon.io API Key 通过 Edge Function 代理（不暴露到前端）

### 2. 标的选择
- 搜索美股 ticker（Polygon reference API）
- 加入 Watchlist，显示价格、IV Rank、财报日

### 3. 期权链浏览
- 选择到期日，展示 calls/puts 表格
- Greeks（Δ Γ Θ V）、IV、OI、Volume

### 4. 3D Greeks 可视化（核心亮点）
- React + `react-three-fiber` + `drei`
- 散点图：每个期权合约一个点
  - X = Delta，Y = Gamma，Z = Theta
  - 颜色 = IV，大小 = OI
- 可旋转/缩放，点击查看合约详情

### 5. GEX 分析
- 计算 Gamma Exposure：`GEX = OI × Γ × 100 × S² × 0.01`，calls 正、puts 负
- 按行权价聚合，柱状图
- 标注 Zero Gamma Level、最大正/负 GEX 行权价

### 6. 策略与回测引擎
- 内置策略模板：
  - Covered Call、Cash-Secured Put
  - Vertical Spread（Bull Call / Bear Put）
  - Iron Condor、Straddle
- 回测器（Edge Function）：
  - 输入：标的、日期区间、策略参数（Delta 目标、DTE、止盈止损）
  - 用 Polygon 历史期权数据逐日模拟开/平仓
  - 输出：权益曲线、胜率、Sharpe、最大回撤、每笔交易明细

### 7. 信号面板
- 当前 Watchlist 上根据策略规则扫描，生成"建议开仓"信号
- 仅展示信号 + 一键复制订单参数（不实际下单）

## 技术细节

- **前端**：React + Tailwind + shadcn + Recharts（2D 图表）+ react-three-fiber（3D）
- **后端**：Lovable Cloud (Supabase) Edge Functions
  - `polygon-proxy`：统一代理 Polygon REST 调用，注入 API Key
  - `run-backtest`：执行回测，结果写入 `backtests` 表
  - `scan-signals`：定时扫描 Watchlist，写入 `signals`
- **密钥**：`POLYGON_API_KEY` 通过 secrets 工具添加
- **设计**：金融终端风格，深色主题、等宽数字字体（JetBrains Mono）、青绿/品红强调色

## 后续阶段（不在本轮）

- 策略 DSL / 可视化策略编辑器
- 参数网格搜索 + 优化器（贝叶斯/遗传算法）
- 实时 WebSocket 行情
- 接入 Tradier / IBKR 真实下单（您确认后再做）
- AI 策略助手（用 Lovable AI 解读市场结构、推荐参数）

## 本轮我会实现

1. 启用 Lovable Cloud + 登录页 + 受保护路由
2. 数据库表 + RLS
3. `polygon-proxy` Edge Function（先要您提供 Polygon API Key）
4. Dashboard + Watchlist + 期权链页面
5. **3D Greeks 可视化页面**（核心亮点，先用 mock+真实数据兼容）
6. **GEX 分析页面**
7. 回测页面 UI + `run-backtest` Edge Function（基础版：Covered Call / Vertical Spread）
8. 信号面板（基础版）

完成后您可以逐步告诉我要深化哪块（更多策略、更智能信号、参数优化、真实下单等）。

---

**确认这个范围后我就开始动手。** 如果想调整（比如本轮只先做可视化+登录，回测下一轮），告诉我即可。
