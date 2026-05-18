import { corsHeaders, json } from "../_shared/cors.ts";
import { getOptionsChain, getStockBars } from "../_shared/polygon.ts";
import { bsPrice, bsGreeks, N } from "../_shared/blackScholes.ts";

/**
 * Given a directional intent, return a ranked list of candidate option structures
 * with cost / max P / max L / breakevens / POP / EV / theta / profit-at-target.
 *
 * Body: {
 *   ticker: string,
 *   direction: "long" | "short" | "neutral",
 *   target: number,              // expected underlying price at exit
 *   days: number,                // expected holding/expiry horizon
 *   budget?: number,             // optional cost cap (USD)
 * }
 */

type Leg = {
  type: "call" | "put";
  side: "long" | "short";
  strike: number;
  expiration: string;
  iv: number;        // decimal
  mid: number;       // per-share
  delta: number;
  theta: number;     // per-day per-share
};

type Structure = {
  name: string;
  legs: Leg[];
  cost: number;          // net debit (>0) or credit (<0) for 1 contract per leg, in $
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  pop: number | null;            // probability of profit at expiry (0..1)
  ev: number | null;             // expected value at expiry ($)
  profitAtTarget: number;        // PnL at target_price at expiry ($)
  theta: number;                 // net theta per day ($)
  iv30: number | null;
  expiration: string;
  rationale: string;
};

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function sanitizeProviderError(message: unknown) {
  const text = typeof message === "string" ? message : "";
  const lower = text.toLowerCase();
  if (lower.includes("plan doesn't include") || lower.includes("upgrade your plan") || lower.includes("data timeframe")) {
    return "当前数据源不支持该时间范围的明细数据，已使用理论定价模式生成策略。";
  }
  return text || "策略生成失败，请稍后重试。";
}

async function yahooSpot(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d&includePrePost=true`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const d = await r.json().catch(() => ({}));
    const meta = d?.chart?.result?.[0]?.meta ?? {};
    return meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose ?? null;
  } catch (_) {
    return null;
  }
}

function hvFromBars(bars: any[]) {
  const closes = bars.map((b) => Number(b.c)).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < 12) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function nextFridayAfter(days: number) {
  const d = new Date(Date.now() + Math.max(1, days) * 86_400_000);
  const add = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return ymd(d);
}

function roundStrike(spot: number, strike: number) {
  const step = spot < 50 ? 1 : spot < 200 ? 2.5 : spot < 500 ? 5 : 10;
  return Math.max(step, Math.round(strike / step) * step);
}

function midOf(c: any): number | null {
  const b = c?.last_quote?.bid ?? c?.day?.low;
  const a = c?.last_quote?.ask ?? c?.day?.high;
  if (typeof b === "number" && typeof a === "number" && b > 0 && a > 0) return (a + b) / 2;
  const last = c?.day?.close ?? c?.day?.last;
  if (typeof last === "number" && last > 0) return last;
  return null;
}

function pickContract(chain: any[], exp: string, type: "call" | "put", strikeTarget: number) {
  const cands = chain.filter((c: any) =>
    c.details?.expiration_date === exp
    && c.details?.contract_type === type
    && typeof c.details?.strike_price === "number"
    && typeof c.implied_volatility === "number"
    && c.implied_volatility > 0
  );
  if (!cands.length) return null;
  cands.sort((a: any, b: any) =>
    Math.abs(a.details.strike_price - strikeTarget)
    - Math.abs(b.details.strike_price - strikeTarget));
  return cands[0];
}

function toLeg(c: any, side: "long" | "short"): Leg | null {
  const mid = midOf(c);
  if (mid == null) return null;
  return {
    type: c.details.contract_type,
    side,
    strike: c.details.strike_price,
    expiration: c.details.expiration_date,
    iv: c.implied_volatility,
    mid,
    delta: c.greeks?.delta ?? 0,
    theta: c.greeks?.theta ?? 0,
  };
}

function syntheticLeg(type: "call" | "put", side: "long" | "short", spot: number, strike: number, exp: string, dte: number, iv: number): Leg {
  const T = Math.max(dte, 1) / 365;
  const mid = Math.max(0.01, bsPrice(spot, strike, T, 0.045, iv, type));
  const g = bsGreeks(spot, strike, T, 0.045, iv, type);
  return { type, side, strike, expiration: exp, iv, mid, delta: g.delta, theta: g.theta };
}

function payoffAt(S: number, legs: Leg[]): number {
  // per-leg payoff at expiry per share, times 100 (one contract per leg)
  let sum = 0;
  for (const L of legs) {
    const intrinsic = L.type === "call" ? Math.max(0, S - L.strike) : Math.max(0, L.strike - S);
    const dir = L.side === "long" ? 1 : -1;
    sum += dir * (intrinsic - L.mid) * 100;
  }
  return sum;
}

/** Monte-Carlo POP and EV at expiry under lognormal with given sigma. */
function simulate(spot: number, sigma: number, days: number, legs: Leg[]): { pop: number; ev: number } {
  const T = Math.max(1, days) / 365;
  const drift = -0.5 * sigma * sigma * T;
  const sd = sigma * Math.sqrt(T);
  const N_PATHS = 2000;
  let wins = 0, pnlSum = 0;
  for (let i = 0; i < N_PATHS; i++) {
    // Box-Muller
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const S = spot * Math.exp(drift + sd * z);
    const p = payoffAt(S, legs);
    if (p > 0) wins++;
    pnlSum += p;
  }
  return { pop: wins / N_PATHS, ev: pnlSum / N_PATHS };
}

function breakevensOf(legs: Leg[], spot: number): number[] {
  // Scan strike-aware grid for sign changes.
  const strikes = legs.map(L => L.strike);
  const lo = Math.min(spot * 0.4, ...strikes) * 0.7;
  const hi = Math.max(spot * 1.6, ...strikes) * 1.3;
  const STEPS = 600;
  const step = (hi - lo) / STEPS;
  const out: number[] = [];
  let prev = payoffAt(lo, legs);
  for (let i = 1; i <= STEPS; i++) {
    const S = lo + step * i;
    const cur = payoffAt(S, legs);
    if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) {
      // linear interp
      const t = -prev / (cur - prev);
      out.push(+(S - step + t * step).toFixed(2));
    }
    prev = cur;
  }
  return out;
}

function maxPL(legs: Leg[], spot: number): { maxProfit: number | null; maxLoss: number | null } {
  // Sample across a wide range, also include S = 0 and S = 3x spot to catch unbounded.
  const strikes = legs.map(L => L.strike);
  const samples: number[] = [0, spot * 3, ...strikes];
  for (let s = spot * 0.3; s <= spot * 2.5; s += spot * 0.01) samples.push(s);
  let lo = Infinity, hi = -Infinity;
  for (const S of samples) {
    const p = payoffAt(S, legs);
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  // Detect unbounded: if extreme S still increasing
  const veryHi = payoffAt(spot * 10, legs);
  const veryLo = payoffAt(spot * 0.05, legs);
  const upUnbounded = veryHi > hi - 1;
  const downUnbounded = veryLo > hi - 1;
  return {
    maxProfit: upUnbounded || downUnbounded ? null : +hi.toFixed(2),
    maxLoss: +lo.toFixed(2),
  };
}

function netCost(legs: Leg[]): number {
  let c = 0;
  for (const L of legs) c += (L.side === "long" ? 1 : -1) * L.mid * 100;
  return +c.toFixed(2);
}
function netTheta(legs: Leg[]): number {
  let t = 0;
  for (const L of legs) t += (L.side === "long" ? 1 : -1) * L.theta * 100;
  return +t.toFixed(2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const ticker = String(body.ticker ?? "").toUpperCase();
    const direction = (body.direction ?? "long") as "long" | "short" | "neutral";
    const target = Number(body.target);
    const days = Math.max(1, Math.min(180, Number(body.days) || 14));
    const budget = body.budget ? Number(body.budget) : null;
    if (!ticker || !Number.isFinite(target)) return json({ error: "ticker & target required" }, 400);

    // 1) get spot
    const today = new Date();
    const from = new Date(today.getTime() - 30 * 86_400_000);
    const bars = await getStockBars(ticker, ymd(from), ymd(today)).catch(() => []);
    const spot = bars.length ? bars[bars.length - 1].c : await yahooSpot(ticker);
    if (!spot) return json({ error: "无法获取标的价格，请稍后重试。", fallback: true, structures: [] });

    // 2) chain
    let providerWarning: string | null = null;
    const rawChain = await getOptionsChain(ticker).catch((e) => {
      providerWarning = sanitizeProviderError(e instanceof Error ? e.message : String(e));
      return [];
    });
    const chain = rawChain.filter((c: any) => c?.details?.ticker?.startsWith(`O:${ticker}`));

    // 3) pick expiration: nearest exp with DTE >= days, fallback to closest
    const expSet = new Map<string, number>();
    for (const c of chain) {
      const e = c.details?.expiration_date;
      if (!e) continue;
      if (!expSet.has(e)) expSet.set(e, daysBetween(today, new Date(e + "T00:00:00Z")));
    }
    const expArr = Array.from(expSet.entries()).filter(([, d]) => d >= 1).sort((a, b) => a[1] - b[1]);
    const hasLiveChain = expArr.length > 0;
    const pickExp = hasLiveChain
      ? (expArr.find(([, d]) => d >= days)?.[0]
        ?? expArr.sort((a, b) => Math.abs(a[1] - days) - Math.abs(b[1] - days))[0][0])
      : nextFridayAfter(days);
    const pickDTE = hasLiveChain ? expSet.get(pickExp)! : daysBetween(today, new Date(pickExp + "T00:00:00Z"));

    // IV30 estimate from chain (ATM avg)
    const atmBand = chain.filter((c: any) =>
      typeof c.details?.strike_price === "number"
      && typeof c.implied_volatility === "number"
      && c.implied_volatility > 0 && c.implied_volatility < 5
      && Math.abs(c.details.strike_price - spot) / spot < 0.05);
    const iv30 = atmBand.length
      ? +(atmBand.reduce((s, c) => s + c.implied_volatility, 0) / atmBand.length).toFixed(4)
      : null;
    const fallbackIv = Math.min(1.2, Math.max(0.18, hvFromBars(bars) ?? 0.4));
    const sigma = iv30 ?? fallbackIv;

    const structures: Structure[] = [];

    function pushIf(name: string, legsRaw: (Leg | null)[], rationale: string) {
      if (legsRaw.some(l => l == null)) return;
      const legs = legsRaw as Leg[];
      const cost = netCost(legs);
      const { maxProfit, maxLoss } = maxPL(legs, spot);
      const breakevens = breakevensOf(legs, spot);
      const { pop, ev } = simulate(spot, sigma, pickDTE, legs);
      const profitAtTarget = +payoffAt(target, legs).toFixed(2);
      const theta = netTheta(legs);
      structures.push({
        name,
        legs,
        cost,
        maxProfit,
        maxLoss,
        breakevens,
        pop: +pop.toFixed(3),
        ev: +ev.toFixed(2),
        profitAtTarget,
        theta,
        iv30,
        expiration: pickExp,
        rationale,
      });
    }

    if (direction === "long") {
      // Long Call ATM
      const c1 = pickContract(chain, pickExp, "call", spot);
      pushIf("Long Call (ATM)",
        [toLeg(c1, "long")],
        "Unlimited upside, decays fast. Cheapest theta if IV is low.");

      // Long Call (Target-strike) — slightly OTM toward target
      const cTarget = pickContract(chain, pickExp, "call", (spot + target) / 2);
      if (cTarget?.details?.strike_price !== c1?.details?.strike_price) {
        pushIf("Long Call (Near Target)",
          [toLeg(cTarget, "long")],
          "Lower premium, needs price to move closer to target by expiry.");
      }

      // Bull Call Spread: long ATM, short at target
      const cShort = pickContract(chain, pickExp, "call", target);
      if (cShort?.details?.strike_price > (c1?.details?.strike_price ?? 0)) {
        pushIf("Bull Call Spread",
          [toLeg(c1, "long"), toLeg(cShort, "short")],
          "Caps profit at target, halves cost and θ-burn vs long call.");
      }
    } else if (direction === "short") {
      const p1 = pickContract(chain, pickExp, "put", spot);
      pushIf("Long Put (ATM)",
        [toLeg(p1, "long")],
        "Profits as underlying falls. Watch for vol crush after the move.");

      const pTarget = pickContract(chain, pickExp, "put", (spot + target) / 2);
      if (pTarget?.details?.strike_price !== p1?.details?.strike_price) {
        pushIf("Long Put (Near Target)",
          [toLeg(pTarget, "long")],
          "Cheaper, needs the decline to materialize sooner.");
      }

      const pShort = pickContract(chain, pickExp, "put", target);
      if (pShort && p1 && pShort.details.strike_price < p1.details.strike_price) {
        pushIf("Bear Put Spread",
          [toLeg(p1, "long"), toLeg(pShort, "short")],
          "Caps profit at target strike, lower cost & θ than naked long put.");
      }
    } else {
      // neutral / volatility
      const cAtm = pickContract(chain, pickExp, "call", spot);
      const pAtm = pickContract(chain, pickExp, "put", spot);
      pushIf("Long Straddle",
        [toLeg(cAtm, "long"), toLeg(pAtm, "long")],
        "Bet on large move either way. Needs IV expansion or big realised vol.");

      const cOTM = pickContract(chain, pickExp, "call", spot * 1.05);
      const pOTM = pickContract(chain, pickExp, "put", spot * 0.95);
      pushIf("Long Strangle",
        [toLeg(cOTM, "long"), toLeg(pOTM, "long")],
        "Cheaper than straddle, needs bigger move to pay off.");
    }

    // Filter to budget if given
    const filtered = budget ? structures.filter(s => s.cost <= budget * 1.1) : structures;

    // Rank by EV desc, then by profit@target desc
    filtered.sort((a, b) => {
      const evA = a.ev ?? -Infinity, evB = b.ev ?? -Infinity;
      if (evB !== evA) return evB - evA;
      return b.profitAtTarget - a.profitAtTarget;
    });

    return json({
      ticker, spot, direction, target, days, expiration: pickExp, dte: pickDTE,
      iv30, sigmaUsed: sigma,
      structures: filtered,
      considered: structures.length,
      computed_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});