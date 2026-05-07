## 改动计划

### 1. 概览自选可点击 + 全局选中标的

- `Dashboard.tsx`：整张卡片包一层 `Link` 跳转到 `/app/chain?ticker=XXX`，点 `期权链 / 3D Greeks` 等保留为快捷按钮。
- 新增 `src/hooks/useSelectedTicker.ts`：从 URL `?ticker=` 读取，写入 `localStorage('optix.ticker')`。
- 改造各分析页（`Chain / Greeks3D / GEX / Orderbook / Flow / Backtest`）默认值：URL 没有 ticker 时回退到 localStorage，从而所有页面"记住"上次选中的标的。
- `MarketStatusBar` 同样使用此 hook，保证顶栏价格跟随。

### 2. 概览顶部的实时价 + 当日小曲线 + YTD

新增 `src/components/HeroTicker.tsx` 放在概览顶部（仅当存在选中标的时显示）：

- 实时大字号价格、涨跌、涨跌幅，复用 `useLiveQuote`（盘中 3s，盘前/后 8s，休市 30s）。
- 中间一条 sparkline：
  - 盘中/盘后 → 调用 `getStockBars(ticker, today, today, '5/minute')`；
  - 盘前/休市 → 取上一个交易日 5min K 线。
  - 用 `recharts` `<AreaChart>` 渲染，高度 60px，配色按涨跌取 `--bull/--bear`。
- 右侧 YTD 模块：拉 `getStockBars(ticker, '2026-01-01', today, 'day')`，显示 `YTD %` 和迷你曲线。
- 自选卡片同样用此 hook 接 `useLiveQuote` 替换一次性 snapshot，使每个卡片价格随时间跳动。

### 3. 统一日期选择器

- 新增 `src/components/ui/date-picker.tsx`：基于 shadcn `Popover + Calendar`，输出 ISO `YYYY-MM-DD`。
- 替换所有 `<Input type="date">`：`Flow.tsx` 起止日、`Backtest.tsx`（如有）。
- `Chain / GEX / Greeks3D` 的到期日下拉沿用现有 `Select`，但增加"按月份分组"和`📅` 图标。

### 4. 中英文语言切换

- 新增 `src/i18n/index.ts`：极简 i18n（无外部依赖），提供 `useT()` 钩子 + `LanguageProvider`，存储到 `localStorage('optix.lang')`，默认 `zh`。
- 新增 `src/i18n/zh.ts` + `src/i18n/en.ts`，按命名空间组织 key（`nav.*`, `dashboard.*`, `gex.*`, `flow.*`, `pricer.*`, `strategy.*`, `market.*`, `common.*` 等）。
- 把所有页面/组件的中文硬编码字符串迁移到 key（统一替换，保证两语言完全对齐）。
- `MarketStatusBar` 右侧加 `LanguageSwitcher`（`中文 / EN` toggle）。

### 5. 期权术语帮助按钮

- 新增 `src/components/HelpPopover.tsx`：`?` 图标 + Radix `Popover`，接收 `term` prop 渲染解释。
- 新增 `src/i18n/glossary.ts`：内建 ~20 个术语（Delta / Gamma / Theta / Vega / IV / OI / Volume / GEX / DTE / ATM / ITM / OTM / Spread / Straddle / Iron Condor / LEAP / Sweep / Premium…），同样支持中英。
- 在所有出现这些术语的列头/标签后渲染 `<HelpPopover term="gex" />`。

### 6. 全局 AI 询问 + Markdown

- 新增 `supabase/functions/ai-chat/index.ts`：使用 Lovable AI Gateway（`google/gemini-2.5-flash` 默认），接收 `{ messages, context? }`，流式或一次性返回。
- 新增 `src/components/GlobalAIChat.tsx`：右下角悬浮 FAB → 抽屉 (`Sheet`)，含会话历史（`useState` 内存即可，不持久化）。
- 安装并引入 `react-markdown` + `remark-gfm`，渲染所有 AI 回复（同时把 GEX 页已有的 AI 解读输出也接上 Markdown 渲染）。
- 输入框支持回车发送，发送时把当前页面 `ticker / route` 作为系统上下文塞入第一条 system message，便于上下文相关回答。

### 技术细节

- 新文件：
  - `src/hooks/useSelectedTicker.ts`
  - `src/components/HeroTicker.tsx`
  - `src/components/ui/date-picker.tsx`
  - `src/components/HelpPopover.tsx`
  - `src/components/LanguageSwitcher.tsx`
  - `src/components/GlobalAIChat.tsx`
  - `src/i18n/{index.ts, zh.ts, en.ts, glossary.ts}`
  - `supabase/functions/ai-chat/index.ts`
- 依赖新增：`react-markdown`, `remark-gfm`。
- `AppLayout` 挂载 `LanguageProvider` + `<GlobalAIChat />` FAB；`MarketStatusBar` 加 `<LanguageSwitcher />`。
- AI 函数无需 secret（Lovable AI Gateway 自带 `LOVABLE_API_KEY`）。

### 范围外

- 不改后端业务逻辑（GEX 计算、回测引擎等保持不变）。
- 不持久化 AI 对话历史（如需后续可加 `ai_conversations` 表）。
