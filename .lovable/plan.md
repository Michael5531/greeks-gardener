## 诊断

你点中了产品的根本问题：现在的 Opti-X 是"分析模块拼盘"（GEX/Greeks/IV/Flow 各一页），不是**交易工作流**。

你的画像（买方 · 方向性 + 波动率 + 0DTE · 用 IBKR · 三大痛点全占）意味着：
- 你是**净付权利金**的人 → 最怕 IV 高位买、θ 烧、看对方向选错 strike
- 你做 0DTE/Gamma → 需要秒级 walls + flow，不是 D+1 分析
- 你需要**闭环**：今天交易什么 → 怎么交易 → 现在怎么管 → 错在哪

下面这套不是再加一个模块，是把现有数据重排成一个**「日内交易者一日循环」**。

---

## 核心重构：一日循环（Daily Loop）

```text
            ┌──────────────────────────────────────────────┐
            │  ① MORNING BRIEF   你今天该看什么            │
            │  ② IDEA LAB       买方 setup 扫描器          │
  开盘 ───▶ │  ③ TRADE BUILDER  「我看多 NVDA 到 230」     │
            │       → 推荐最优 strike/expiry/结构           │
            │       → EV · POP · θ/天 · 突破点 · 退出计划   │
            │  ④ LIVE BOOK      持仓 · 实时 Greeks · alerts │
            │  ⑤ JOURNAL        自动复盘 · 盲点诊断         │
            └──────────────────────────────────────────────┘
```

每一格都是一个新页面 / 重做的页面，但它们**互相串联**——从 Idea 点开就到 Trade Builder，开仓后自动进 Live Book，平仓后自动写 Journal。

---

## 分四个阶段做（按"对你交易最直接有用"排序）

### 阶段 A · 决策支持（4-6 天）—— 解决"买什么 + 选哪个 strike"

**新页面 `/app/idea-lab`** —— 买方专用 setup 扫描器：

按你三种风格各一个 tab：

| Tab | 扫描逻辑 | 输出列 |
|---|---|---|
| **Directional · Long Premium** | IV Rank < 30 + 价格动量 + 流动性 OK | 标的 / IV30 / IVR / RSI / 建议 strike & expiry |
| **Volatility · Pre-Earnings** | 5-30 DTE 有财报 + 当前 IV vs 历史 earnings IV | 标的 / earnings date / IV crush 预期 / straddle 价格 vs 历史 move |
| **0DTE / Gamma** | 当日 GEX flip 距 spot < 1% + 大 walls + flow 净流向 | 标的 / spot / flip / 最近 wall / flow tape |

**新页面 `/app/trade-builder`**（替代现在的 OptionPricer）—— 输入意图，输出执行：

输入区：
- "我看 **多/空/中性** [NVDA] 到 [$240] 在 [10] 天内"
- 风险预算: "$500" / 风险偏好滑块

输出区（自动比较 6-8 种候选结构）：
- Long Call · Long Call Spread · Diagonal · Calendar · Long Straddle …
- 每个结构一行：strike/expiry · cost · max profit · max loss · breakeven · **POP** · **Expected Value** · θ/天 · 推荐度 ★
- **"加入持仓"按钮** → 一键进 Live Book

**升级 GEX 页**：加 0DTE-only 切换 · Gamma Walls 标到 candlestick · Vanna/Charm 副图

### 阶段 B · 持仓管理（5-7 天）—— 解决"何时平仓 / 调仓"

**新页面 `/app/positions`** —— 这是付费用户最看重的：

- **录入方式**（3 种并存）：
  1. 手动新增（每条 leg）
  2. **IBKR Flex Query CSV 上传**（IBKR 后台一键导出，零客户端依赖，第一版就够用）
  3. 从 Trade Builder "加入持仓"自动写入
- **持仓表**：每行 leg 显示 entry / now / PnL$ / PnL% / Δ / Γ / Θ/天 / Vega / IV 变化 / DTE
- **组合总览**：净 Δ / 净 Γ / 净 Θ / Beta-weighted Δ（vs SPY） / margin 估算
- **场景压力**：「SPY -3% + VIX +5」「现价 -5%」「IV +10pp」一键看组合
- **智能 Alerts**（写入 `alerts` 表，cron 每分钟跑）：
  - 利润目标命中（默认 50% 最大利润）
  - 止损线击穿
  - **θ 加速预警**（DTE < 14 时 θ/天 > 入场时 2 倍）
  - GEX wall 击穿
  - IV crash（持仓 IV 单日跌 > 15%）
  - 推送：站内 + Email（已有 email infra）

### 阶段 C · 复盘 + AI 诊断（3-4 天）—— 让你越用越准

**新页面 `/app/journal`**：

- 平仓自动入库（来源：手动平 / CSV 同步 / Trade Builder）
- 每笔记录：策略类型 / 入场 IVR / 持有时长 / R 倍数 / 盲点 tag
- 统计面板：按策略胜率、按 IV 区间胜率、按 DTE 区间胜率、按方向胜率
- **AI 盲点诊断**（用 Lovable AI）：扫近 50 笔交易，输出："你在 IVR>70 时买入的交易平均亏损 -1.2R，建议避开"

### 阶段 D · IBKR 闭环（2-3 天，可在 B 之后）

IBKR 集成路线分两步走：

| 方案 | 上线难度 | 用户操作 |
|---|---|---|
| **v1 · Flex Query CSV** | 1 天 | 在 IBKR 设置 Flex Query → 每天/每周下载 CSV → 上传到 Opti-X |
| **v2 · IBKR Client Portal Web API** | 1 周 | 用户本地跑 IBKR Gateway → OAuth 授权 → 自动同步（复杂） |
| 替代 · Tradier API | 半周 | 云端 OAuth，但需要用户也在 Tradier 开户 |

**先做 v1**，等付费用户上来再加 v2。

---

## 同时要做的"基础升级"

这些不是新页面，是给现有模块换骨：

1. **Watchlist 升级为决策面板**：每只票一行展示 `Price · IVR · IV30 · HV30 · Term shape · Flow $ · Earnings in N days`，扫一眼挑标的
2. **全局 AI 助手升级**：现在的 `GlobalAIChat` 加上"读取当前持仓 + 当前页面数据"的 context，能回答"我现在该不该平 NVDA 240C"
3. **0DTE 实时模式**：左下角加一个"0DTE Live"开关，开启后所有数据切到 1 分钟刷新 + GEX walls 浮在 candlestick 上
4. **快捷操作面板**（⌘K）：跳标的、跳页面、复制最后一笔 trade idea

---

## 数据库 / 后端新增

```text
positions          (id, user_id, status, opened_at, closed_at, legs jsonb, notes)
position_alerts    (id, user_id, position_id, type, condition, triggered_at, sent)
trade_journal      (id, user_id, position_id, pnl_r, holding_days, ivr_at_entry, tags[], ai_notes)
ibkr_imports       (id, user_id, source, filename, parsed jsonb, imported_at)
catalysts          (ticker, event_type, event_date, source)   — 财报先用免费 yfinance scrape
ideas_log          (id, ticker, setup_type, score, payload jsonb, created_at)

新边缘函数:
  scan-buyer-ideas      —— Idea Lab 的扫描器（每 5 分钟 cron）
  build-trade           —— 给定意图扫 6-8 个结构出推荐
  evaluate-positions    —— 每分钟跑，检测 alerts
  import-ibkr-flex      —— 解析 IBKR Flex Query CSV
  scan-catalysts        —— 每天拉 earnings 日历
  ai-diagnose-journal   —— 跑 AI 分析复盘记录
```

---

## 实施顺序（我的建议）

```text
本轮（阶段 A 一半）：
  1. /app/idea-lab           买方 setup 扫描器（3 个 tab，先只做 Directional）
  2. /app/trade-builder      意图→结构推荐（核心：EV/POP/退出计划）
  3. Watchlist 决策面板升级
  → 这一波完成后，你每天打开就能 "扫 idea → 选结构 → 知道怎么开" 的闭环已经通了

下一轮（阶段 B）：
  4. /app/positions          手动录入 + 实时 Greeks + 场景压力
  5. Alerts 系统 + Email 推送
  6. IBKR Flex Query CSV 导入

第三轮（阶段 A 剩余 + C）：
  7. Idea Lab · Volatility tab + 0DTE tab
  8. 0DTE Live 模式 + GEX walls 标注
  9. /app/journal + AI 盲点诊断

第四轮（收费上线）：
  10. Stripe 订阅门控 + onboarding
  11. IBKR Web API v2（可选）
```

---

## 我现在要你确认

**本轮**就先做"决策闭环"的前 3 件（Idea Lab Directional tab + Trade Builder + Watchlist 升级）——这是最快让你"打开就有用"的一波，大约 1 个 session 的工作量。

确认后我立即开工。或者你想换一波先做（比如直接上 Positions Tracker），告诉我。
