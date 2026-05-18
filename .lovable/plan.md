## 现状盘点

你现在已经覆盖的能力（基于 8 个 app 页面 + 14 个 edge function）：

- **行情/链**：Overview · Chain · Orderbook · Flow（历史期权流）
- **分析**：3D Greeks · GEX（含 flip 点）· IV Surface
- **策略**：多腿 Builder + Pricer + Payoff + Backtest（含 custom legs）+ Signals 扫描
- **AI**：ai-chat、analyze-gex
- **基础设施**：Polygon 代理、computed cache、react-query 共享缓存

定位类比：介于 **Unusual Whales 入门版** 和 **OptionStrat / Market Chameleon** 之间，但缺少"投资者真正会续费"的几个支柱模块。

---

## 与付费终端（UW $48/mo、Market Chameleon $69/mo、OptionStrat $19/mo、SpotGamma $99/mo）的差距

按"对续费影响最大 → 最小"排列：

### P0 · 决策闭环（最缺，直接影响付费意愿）

1. **Unusual Options Activity / Smart Flow 实时雷达**
   你现在只有"历史 flow"。差距：
   - 实时（或 15 分钟延迟）大单扫描：volume > X×OI、premium > $50k、sweep/block/split 分类
   - "Repeat hitter"：同一 contract 当日多次扫到
   - 推送：邮件 / Webhook / Discord
   - 这是 UW 最贵也最有黏性的功能

2. **Earnings & Catalyst 中心**
   - 财报日历 + 隐含波动 vs 历史已实现波动差（IV Crush 预测）
   - 财报前后 straddle 历史回报表
   - Ex-div、FOMC、CPI 事件叠加到 IV term structure
   - 现在 Backtest 没法回答"NVDA 财报前买 ATM straddle 历史胜率"

3. **Dealer Positioning Pack（SpotGamma 杀手锏）**
   你已有 GEX flip，差距：
   - **Vanna / Charm exposure**（VEX / CEX）按 strike
   - **Dealer 0DTE 持仓** 单独剖析
   - **Gamma walls / Call & Put walls** 标注到当日 chart
   - **HIRO 类** 资金流向时间序列

### P1 · 数据深度（让分析"可信"）

4. **历史 IV / HV 数据库**
   - IV Rank、IV Percentile（30/60/90/252 天）—— 选 strategy 的前提
   - HV20 / HV30 / HV60 与 IV30 的 spread 时间序列
   - Term structure 历史快照（今天 vs 30 天前）

5. **Skew & Smile 量化**
   - 25Δ Risk Reversal、Butterfly
   - Put/Call skew 时间序列
   - Skew percentile rank（"现在 skew 比过去一年 X% 时间更陡"）

6. **持仓变化（OI Δ）**
   - 每日 OI delta by strike/exp（区分 open vs close）
   - 大单 OI 异动榜
   - 现在 chain 只能看 snapshot

### P2 · 策略层（变现钩子）

7. **Strategy Screener / Idea Lab**
   - 全市场扫："找 IVR>70 + 财报 30 天外 + 流动性好的 short strangle 候选"
   - 输出 expected return、POP、breakeven、margin
   - 对标 Market Chameleon Trade Ideas

8. **Portfolio / Positions Tracker**
   - 用户录入持仓 → 实时净 Greeks、Beta-weighted Delta、margin、PnL attribution
   - "如果 SPY -3% + VIX +5"压力测试
   - 这是付费用户从"看"到"用"的关键

9. **Probability Lab**
   - 基于 IV 的 POP / P50 / Expected Value
   - Monte Carlo 路径模拟（你已有 BS，加 GBM 路径很便宜）
   - Touch probability vs Expiry probability

### P3 · 体验/留存

10. **Alerts 系统**：价格、IV、GEX flip 穿越、unusual flow 命中 → email/webhook
11. **Watchlist 升级**：每个标的展示 IVR/IV30/HV30/Earnings/Flow score 一行
12. **Compare 模式**：两只票的 IV term / skew / GEX 并排
13. **导出**：CSV / PNG / 分享只读链接（增长杠杆）

### P4 · 商业化基建

14. **Auth + 订阅**（Stripe Free / Pro $29 / Elite $79）
15. **Rate limit & 数据延迟分级**：Free 15min delayed、Pro 实时
16. **Onboarding**：首次进入 3 步引导（选 ticker → 看 GEX → 试 Backtest）
17. **着陆页 social proof**：使用案例、视频、博客（SEO 拉新）

---

## 建议的实施顺序（3 个 milestone）

```text
M1  数据深度铺底（2-3 周）
    └─ IV Rank/Percentile · HV 序列 · Skew · OI Δ · Earnings 日历
    └─ 新建表 historical_iv / earnings_calendar / oi_snapshot
    └─ 每日定时 job 入库

M2  决策闭环（3-4 周）
    └─ Unusual Flow 扫描器（实时）+ Alerts
    └─ Dealer Pack v2（Vanna/Charm/Walls）
    └─ Strategy Screener
    └─ Portfolio Tracker

M3  商业化（1-2 周）
    └─ Stripe 订阅 + 套餐门控
    └─ Onboarding / 着陆页改造 / SEO
    └─ Alerts 推送（email + webhook）
```

---

## 技术债 / 上线前必修

- **数据源成本**：Polygon Options Advanced ~$199/mo。要么把成本算进定价，要么加 15min 延迟层降本
- **缓存层**：现在 compute_cache 是 KV，OI/IV 历史要进真正的时序表（Supabase 直接用 Postgres 即可）
- **任务调度**：scan-signals 现在是被动触发，需要 cron 每日跑入库
- **法务**：免责声明、TOS、数据归属（Polygon 要求展示 "Data by Polygon.io"）
- **可观测**：付费用户的 error 必须有 Sentry 类监控

---

## 我建议下一步

挑 **一个 milestone** 我来落地。我的推荐：

1. **先做 M1 数据深度**——它是 M2 所有功能的前提，且能立刻让 Dashboard / Chain / Backtest 显得"专业"。
2. 或者先做 **Unusual Flow 实时雷达 + Alerts**——这是单点最容易出 demo、最能拉付费的功能。

确认你想优先哪条线，我把它拆成可执行的 plan 再开工。
