import { bsPrice, OptType } from "./blackScholes";

export type Leg = {
  type: OptType;
  side: "long" | "short";
  strikeOffset: number; // ATM offset in % of spot, e.g. 0 = ATM, 0.05 = 5% OTM call / ITM put
  qty?: number; // default 1
  dteOverride?: number; // for calendars
};

export type StrategyDef = {
  id: string;
  name: string;
  category: "directional" | "neutral" | "income" | "spread" | "leap";
  description: string;
  legs: (spot: number) => Leg[];
  // formulas described in plain text for the card
  maxLossText: string;
  maxProfitText: string;
  breakevenText: string;
  engineSupported: boolean; // backtest engine support
};

export const STRATEGIES: StrategyDef[] = [
  {
    id: "long_call", name: "Long Call", category: "directional",
    description: "看多。买入看涨期权，最大亏损为权利金。",
    legs: () => [{ type: "call", side: "long", strikeOffset: 0 }],
    maxLossText: "= 已付权利金", maxProfitText: "无上限", breakevenText: "Strike + 权利金",
    engineSupported: true,
  },
  {
    id: "long_put", name: "Long Put", category: "directional",
    description: "看空。买入看跌期权，最大亏损为权利金。",
    legs: () => [{ type: "put", side: "long", strikeOffset: 0 }],
    maxLossText: "= 已付权利金", maxProfitText: "Strike - 权利金（标的归零）", breakevenText: "Strike - 权利金",
    engineSupported: true,
  },
  {
    id: "leap_call", name: "LEAP Call (DTE≥365)", category: "leap",
    description: "长期看涨。建议 DTE ≥ 365 天，资金占用低于持股。",
    legs: () => [{ type: "call", side: "long", strikeOffset: -0.1 }], // 10% ITM
    maxLossText: "= 已付权利金", maxProfitText: "无上限", breakevenText: "Strike + 权利金",
    engineSupported: true,
  },
  {
    id: "covered_call", name: "Covered Call", category: "income",
    description: "持股 + 卖出 OTM Call，赚取权利金。",
    legs: () => [{ type: "call", side: "short", strikeOffset: 0.05 }],
    maxLossText: "标的下跌（被持股覆盖）", maxProfitText: "(Strike - 入股价) + 权利金", breakevenText: "入股价 - 权利金",
    engineSupported: true,
  },
  {
    id: "cash_secured_put", name: "Cash-Secured Put", category: "income",
    description: "现金担保的卖 Put，意在低位接货或赚取权利金。",
    legs: () => [{ type: "put", side: "short", strikeOffset: -0.05 }],
    maxLossText: "(Strike - 权利金) × 100", maxProfitText: "= 权利金", breakevenText: "Strike - 权利金",
    engineSupported: true,
  },
  {
    id: "long_straddle", name: "Long Straddle", category: "neutral",
    description: "买 ATM Call + ATM Put，赌大幅波动。",
    legs: () => [
      { type: "call", side: "long", strikeOffset: 0 },
      { type: "put", side: "long", strikeOffset: 0 },
    ],
    maxLossText: "= 总权利金", maxProfitText: "无上限", breakevenText: "Strike ± 总权利金",
    engineSupported: true,
  },
  {
    id: "long_strangle", name: "Long Strangle", category: "neutral",
    description: "买 OTM Call + OTM Put，比 straddle 便宜但需更大波动。",
    legs: () => [
      { type: "call", side: "long", strikeOffset: 0.05 },
      { type: "put", side: "long", strikeOffset: -0.05 },
    ],
    maxLossText: "= 总权利金", maxProfitText: "无上限", breakevenText: "OTM 边界 ± 总权利金",
    engineSupported: false,
  },
  {
    id: "bull_call_spread", name: "Bull Call Spread", category: "spread",
    description: "买 ATM Call + 卖 OTM Call。限风险限收益的看多策略。",
    legs: () => [
      { type: "call", side: "long", strikeOffset: 0 },
      { type: "call", side: "short", strikeOffset: 0.05 },
    ],
    maxLossText: "= 净权利金（debit）", maxProfitText: "= 价差宽度 - 净权利金", breakevenText: "Long Strike + 净权利金",
    engineSupported: false,
  },
  {
    id: "bear_put_spread", name: "Bear Put Spread", category: "spread",
    description: "买 ATM Put + 卖 OTM Put。限风险的看空策略。",
    legs: () => [
      { type: "put", side: "long", strikeOffset: 0 },
      { type: "put", side: "short", strikeOffset: -0.05 },
    ],
    maxLossText: "= 净权利金", maxProfitText: "= 价差宽度 - 净权利金", breakevenText: "Long Strike - 净权利金",
    engineSupported: false,
  },
  {
    id: "iron_condor", name: "Iron Condor", category: "neutral",
    description: "卖近月 OTM put 价差 + 卖 OTM call 价差。盘整收权利金。",
    legs: () => [
      { type: "put", side: "long", strikeOffset: -0.10 },
      { type: "put", side: "short", strikeOffset: -0.05 },
      { type: "call", side: "short", strikeOffset: 0.05 },
      { type: "call", side: "long", strikeOffset: 0.10 },
    ],
    maxLossText: "= 翼宽 - 净权利金", maxProfitText: "= 净权利金（credit）", breakevenText: "短腿 ± 净权利金",
    engineSupported: false,
  },
  {
    id: "iron_butterfly", name: "Iron Butterfly", category: "neutral",
    description: "卖 ATM Straddle + 买远翼保护。最大盈利在 ATM。",
    legs: () => [
      { type: "put", side: "long", strikeOffset: -0.05 },
      { type: "put", side: "short", strikeOffset: 0 },
      { type: "call", side: "short", strikeOffset: 0 },
      { type: "call", side: "long", strikeOffset: 0.05 },
    ],
    maxLossText: "= 翼宽 - 净权利金", maxProfitText: "= 净权利金", breakevenText: "ATM ± 净权利金",
    engineSupported: false,
  },
  {
    id: "collar", name: "Collar", category: "income",
    description: "持股 + 买 OTM Put + 卖 OTM Call。低成本对冲。",
    legs: () => [
      { type: "put", side: "long", strikeOffset: -0.05 },
      { type: "call", side: "short", strikeOffset: 0.05 },
    ],
    maxLossText: "(入股价 - Put Strike) - 净权利金", maxProfitText: "(Call Strike - 入股价) + 净权利金", breakevenText: "入股价 ± 净权利金",
    engineSupported: false,
  },
  {
    id: "custom", name: "Custom · 自选 Legs", category: "spread",
    description: "从期权链选择任意 buy/sell legs，引擎按真实 strike + 到期日回测。",
    legs: () => [],
    maxLossText: "—", maxProfitText: "—", breakevenText: "—",
    engineSupported: true,
  },
];

export function getStrategy(id: string) {
  return STRATEGIES.find(s => s.id === id) ?? STRATEGIES[0];
}

// Returns expiry-PnL and today-PnL across price grid for given strategy
export function payoffCurve(
  def: StrategyDef,
  spot: number,
  iv: number,
  dte: number,
  r = 0.045,
  rangePct = 0.3,
  points = 81,
) {
  const T = Math.max(dte, 1) / 365;
  const legs = def.legs(spot).map(l => {
    const strike = round2(spot * (1 + l.strikeOffset));
    const entryPrice = bsPrice(spot, strike, T, r, iv, l.type);
    return { ...l, strike, entryPrice, qty: l.qty ?? 1 };
  });

  const netDebit = legs.reduce((s, l) => s + (l.side === "long" ? l.entryPrice : -l.entryPrice) * l.qty, 0);

  const grid: { price: number; expiry: number; today: number }[] = [];
  const lo = spot * (1 - rangePct), hi = spot * (1 + rangePct);
  for (let i = 0; i < points; i++) {
    const p = lo + (hi - lo) * (i / (points - 1));
    let expiry = 0, today = 0;
    for (const l of legs) {
      const intrinsic = l.type === "call" ? Math.max(0, p - l.strike) : Math.max(0, l.strike - p);
      const todayVal = bsPrice(p, l.strike, Math.max(T - 1 / 365, 1 / 365), r, iv, l.type);
      const sign = l.side === "long" ? 1 : -1;
      expiry += sign * (intrinsic - l.entryPrice) * l.qty * 100;
      today += sign * (todayVal - l.entryPrice) * l.qty * 100;
    }
    grid.push({ price: round2(p), expiry: round2(expiry), today: round2(today) });
  }

  // Breakevens: where expiry crosses 0
  const breakevens: number[] = [];
  for (let i = 1; i < grid.length; i++) {
    if ((grid[i - 1].expiry <= 0 && grid[i].expiry >= 0) || (grid[i - 1].expiry >= 0 && grid[i].expiry <= 0)) {
      const a = grid[i - 1], b = grid[i];
      const denom = b.expiry - a.expiry || 1;
      const x = a.price + (b.price - a.price) * (-a.expiry / denom);
      breakevens.push(round2(x));
    }
  }

  const maxProfit = Math.max(...grid.map(g => g.expiry));
  const maxLoss = Math.min(...grid.map(g => g.expiry));

  return { legs, grid, breakevens, maxProfit, maxLoss, netDebit };
}

const round2 = (n: number) => Math.round(n * 100) / 100;