import { corsHeaders, json } from "../_shared/cors.ts";
import { bsPrice, type OptType } from "../_shared/blackScholes.ts";
import { getCached, setCached, defaultTtl } from "../_shared/cache.ts";

// Strategy definitions (mirror src/lib/strategies.ts).
type Leg = { type: OptType; side: "long" | "short"; strikeOffset: number; qty?: number };
const STRATS: Record<string, Leg[]> = {
  long_call: [{ type: "call", side: "long", strikeOffset: 0 }],
  long_put: [{ type: "put", side: "long", strikeOffset: 0 }],
  leap_call: [{ type: "call", side: "long", strikeOffset: -0.1 }],
  covered_call: [{ type: "call", side: "short", strikeOffset: 0.05 }],
  cash_secured_put: [{ type: "put", side: "short", strikeOffset: -0.05 }],
  long_straddle: [
    { type: "call", side: "long", strikeOffset: 0 },
    { type: "put", side: "long", strikeOffset: 0 },
  ],
  long_strangle: [
    { type: "call", side: "long", strikeOffset: 0.05 },
    { type: "put", side: "long", strikeOffset: -0.05 },
  ],
  bull_call_spread: [
    { type: "call", side: "long", strikeOffset: 0 },
    { type: "call", side: "short", strikeOffset: 0.05 },
  ],
  bear_put_spread: [
    { type: "put", side: "long", strikeOffset: 0 },
    { type: "put", side: "short", strikeOffset: -0.05 },
  ],
  iron_condor: [
    { type: "put", side: "long", strikeOffset: -0.10 },
    { type: "put", side: "short", strikeOffset: -0.05 },
    { type: "call", side: "short", strikeOffset: 0.05 },
    { type: "call", side: "long", strikeOffset: 0.10 },
  ],
  iron_butterfly: [
    { type: "put", side: "long", strikeOffset: -0.05 },
    { type: "put", side: "short", strikeOffset: 0 },
    { type: "call", side: "short", strikeOffset: 0 },
    { type: "call", side: "long", strikeOffset: 0.05 },
  ],
  collar: [
    { type: "put", side: "long", strikeOffset: -0.05 },
    { type: "call", side: "short", strikeOffset: 0.05 },
  ],
};
const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const strategy_id = String(body.strategy_id ?? "");
    const spot = Number(body.spot);
    const iv = Number(body.iv);
    const dte = Number(body.dte);
    const r = Number(body.r ?? 0.045);
    const rangePct = Number(body.range_pct ?? 0.3);
    const points = Number(body.points ?? 81);
    const def = STRATS[strategy_id];
    if (!def) return json({ error: "unknown strategy_id" }, 400);
    if (!Number.isFinite(spot) || spot <= 0) return json({ error: "spot must be > 0" }, 400);
    if (!Number.isFinite(iv) || iv <= 0) return json({ error: "iv must be > 0" }, 400);
    if (!Number.isFinite(dte) || dte <= 0) return json({ error: "dte must be > 0" }, 400);

    const cacheKey = `${strategy_id}|${spot.toFixed(2)}|${iv.toFixed(4)}|${dte}|${r}|${rangePct}|${points}`;
    const cached = await getCached("payoff", cacheKey);
    if (cached) return json({ ...cached.payload, computed_at: cached.computed_at, source: "cache" });

    const T = Math.max(dte, 1) / 365;
    const legs = def.map(l => {
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
    const breakevens: number[] = [];
    for (let i = 1; i < grid.length; i++) {
      const a = grid[i - 1], b = grid[i];
      if ((a.expiry <= 0 && b.expiry >= 0) || (a.expiry >= 0 && b.expiry <= 0)) {
        const denom = b.expiry - a.expiry || 1;
        breakevens.push(round2(a.price + (b.price - a.price) * (-a.expiry / denom)));
      }
    }
    const maxProfit = Math.max(...grid.map(g => g.expiry));
    const maxLoss = Math.min(...grid.map(g => g.expiry));

    const payload = { legs, grid, breakevens, maxProfit, maxLoss, netDebit };
    await setCached("payoff", cacheKey, payload, defaultTtl("payoff"));
    return json({ ...payload, computed_at: new Date().toISOString(), source: "fresh" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});