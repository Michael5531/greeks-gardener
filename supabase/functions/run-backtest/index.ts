// Lightweight option-strategy backtester.
// MVP: Covered Call & Cash-Secured Put using underlying daily aggregates.
// Approximates option premium with a simple Black–Scholes pricer (constant IV from params).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

function bs(S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put") {
  if (T <= 0) return Math.max(0, type === "call" ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === "call") return S * N(d1) - K * Math.exp(-r * T) * N(d2);
  return K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
}

// Bisection IV solver. Returns null on failure.
function impliedVol(price: number, S: number, K: number, T: number, r: number, type: "call" | "put"): number | null {
  if (!(price > 0) || T <= 0) return null;
  let lo = 0.01, hi = 5.0;
  let pLo = bs(S, K, T, r, lo, type) - price;
  let pHi = bs(S, K, T, r, hi, type) - price;
  if (pLo * pHi > 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const pMid = bs(S, K, T, r, mid, type) - price;
    if (Math.abs(pMid) < 1e-4) return mid;
    if (pMid * pLo < 0) { hi = mid; pHi = pMid; } else { lo = mid; pLo = pMid; }
  }
  return (lo + hi) / 2;
}

async function fetchAtmIvForDate(
  apiKey: string, ticker: string, date: string, spot: number, dte: number,
): Promise<number | null> {
  try {
    // Pick a contract whose expiration is ~dte days out and strike near spot
    const targetExp = new Date(new Date(date).getTime() + dte * 86400000).toISOString().slice(0, 10);
    const lo = (spot * 0.85).toFixed(2), hi = (spot * 1.15).toFixed(2);
    const ref = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&as_of=${date}&expiration_date.gte=${date}&expiration_date.lte=${targetExp.slice(0,10)}&strike_price.gte=${lo}&strike_price.lte=${hi}&limit=100&apiKey=${apiKey}`;
    const refR = await fetch(ref);
    const refJ = await refR.json();
    const contracts: any[] = refJ?.results ?? [];
    if (!contracts.length) return null;
    // Pick closest-to-spot, prefer expiration nearest to targetExp; one call + one put
    const targetT = Date.parse(targetExp);
    const score = (c: any) =>
      Math.abs(c.strike_price - spot) + Math.abs(Date.parse(c.expiration_date) - targetT) / 1e9;
    const calls = contracts.filter(c => c.contract_type === "call").sort((a, b) => score(a) - score(b));
    const puts = contracts.filter(c => c.contract_type === "put").sort((a, b) => score(a) - score(b));
    const picks = [calls[0], puts[0]].filter(Boolean);
    const ivs: number[] = [];
    for (const c of picks) {
      const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(c.ticker)}/range/1/day/${date}/${date}?apiKey=${apiKey}`;
      const aR = await fetch(aggUrl);
      const aJ = await aR.json();
      const close = aJ?.results?.[0]?.c;
      if (!(close > 0)) continue;
      const T = Math.max(1 / 365, (Date.parse(c.expiration_date) - Date.parse(date)) / (365 * 86400000));
      const iv = impliedVol(close, spot, c.strike_price, T, 0.045, c.contract_type);
      if (iv != null && iv > 0.02 && iv < 4) ivs.push(iv);
    }
    if (!ivs.length) return null;
    return ivs.reduce((a, b) => a + b, 0) / ivs.length;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) return json({ error: "POLYGON_API_KEY not configured" }, 500);

  try {
    const body = await req.json();
    const {
      ticker, start_date, end_date,
      strategy_type = "covered_call",
      dte = 30, delta_target = 0.3, iv = 0.30,
      profit_take = 0.5, stop_loss = 2,
      iv_mode = "constant", // "constant" | "historical_atm"
      custom_legs,
    } = body;

    // Pull daily aggregates from Polygon
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${start_date}/${end_date}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.results?.length) return json({ error: "no price data", details: data }, 400);

    const bars: { t: number; c: number }[] = data.results.map((b: any) => ({ t: b.t, c: b.c }));

    const r0 = 0.045;
    const trades: any[] = [];
    const equity: { date: string; value: number }[] = [];
    let cash = 10000;
    let position: any = null;
    // Per-bar IV (filled lazily when iv_mode === "historical_atm")
    const ivPerBar: number[] = new Array(bars.length).fill(iv);
    if (iv_mode === "historical_atm") {
      let last = iv;
      // Sample every ~3 trading days to keep API usage sane
      for (let i = 0; i < bars.length; i++) {
        const d = new Date(bars[i].t).toISOString().slice(0, 10);
        if (i % 3 === 0) {
          const v = await fetchAtmIvForDate(apiKey, ticker, d, bars[i].c, dte);
          if (v != null) last = v;
        }
        ivPerBar[i] = last;
        if (i % 30 === 0) console.log(`[backtest] iv@${d}=${ivPerBar[i].toFixed(3)}`);
      }
    }

    // Helper: estimate strike from delta target via inverse Black-Scholes (rough)
    function strikeForDelta(S: number, T: number, target: number, type: "call" | "put", sigma: number) {
      // Inverse N(): use approximation
      const z = inverseNormal(type === "call" ? target : 1 - target);
      return S * Math.exp((r0 + 0.5 * sigma * sigma) * T - z * sigma * Math.sqrt(T));
    }

    type LegSpec = { type: "call" | "put"; side: "long" | "short"; strikeOffsetPct: number; absStrike?: number; dteOverride?: number; qty?: number };
    function specFor(strat: string): LegSpec[] {
      switch (strat) {
        case "long_call": return [{ type: "call", side: "long", strikeOffsetPct: 0 }];
        case "long_put": return [{ type: "put", side: "long", strikeOffsetPct: 0 }];
        case "leap_call": return [{ type: "call", side: "long", strikeOffsetPct: -0.10 }];
        case "long_straddle": return [
          { type: "call", side: "long", strikeOffsetPct: 0 },
          { type: "put", side: "long", strikeOffsetPct: 0 },
        ];
        case "covered_call": return [{ type: "call", side: "short", strikeOffsetPct: 0.05 }];
        case "cash_secured_put": return [{ type: "put", side: "short", strikeOffsetPct: -0.05 }];
        default: return [];
      }
    }
    let specs: LegSpec[] = specFor(strategy_type);
    if (strategy_type === "custom") {
      if (!Array.isArray(custom_legs) || !custom_legs.length) return json({ error: "custom_legs required for strategy=custom" }, 400);
      const refSpot = bars[0].c;
      specs = custom_legs.map((l: any) => ({
        type: l.type, side: l.side,
        strikeOffsetPct: 0,
        absStrike: Number(l.strike),
        dteOverride: Number(l.dte ?? dte),
        qty: Number(l.qty ?? 1),
      }));
      void refSpot;
    }
    if (!specs.length) return json({ error: `strategy '${strategy_type}' 暂不支持引擎回测` }, 400);

    function legPrice(S: number, K: number, T: number, type: "call" | "put", sigma: number) {
      return bs(S, K, T, r0, sigma, type);
    }

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const date = new Date(bar.t).toISOString().slice(0, 10);
      const S = bar.c;
      const sigma = ivPerBar[i];

      if (position) {
        const T = Math.max(0, (position.expiry - bar.t) / (1000 * 60 * 60 * 24 * 365));
        let nowVal = 0, entryVal = 0;
        for (const l of position.legs) {
          const cur = legPrice(S, l.strike, T, l.type, sigma);
          const sign = l.side === "long" ? 1 : -1;
          nowVal += sign * cur;
          entryVal += sign * l.entry_premium;
        }
        const pnl = (nowVal - entryVal) * 100;
        const debit = entryVal; // positive for long-debit strategies
        const exitByExpiry = T <= 0;
        const exitByProfit = debit > 0
          ? pnl >= debit * 100 * profit_take
          : pnl >= -debit * 100 * profit_take;
        const exitByStop = debit > 0
          ? pnl <= -debit * 100 * stop_loss
          : pnl <= debit * 100 * stop_loss * -1;
        if (exitByExpiry || exitByProfit || exitByStop) {
          cash += pnl;
          trades.push({ ...position, exit_date: date, exit_spot: S, pnl, reason: exitByExpiry ? "expiry" : exitByProfit ? "profit_take" : "stop_loss" });
          position = null;
        }
      }

      if (!position) {
        const T = dte / 365;
        const legs = specs.map(s => {
          const K = s.absStrike != null ? s.absStrike : Math.round(S * (1 + s.strikeOffsetPct) * 100) / 100;
          const legT = (s.dteOverride ?? dte) / 365;
          const premium = legPrice(S, K, legT, s.type, sigma);
          return { type: s.type, side: s.side, strike: K, entry_premium: premium, qty: s.qty ?? 1 };
        });
        position = {
          entry_date: date, entry_spot: S, legs,
          expiry: bar.t + dte * 24 * 60 * 60 * 1000,
        };
      }

      equity.push({ date, value: cash });
    }

    // Metrics
    const returns = equity.slice(1).map((e, i) => (e.value - equity[i].value) / Math.max(1, equity[i].value));
    const meanR = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
    const stdR = Math.sqrt(returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / Math.max(1, returns.length - 1));
    const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;
    let peak = equity[0]?.value ?? 10000, mdd = 0;
    for (const e of equity) { peak = Math.max(peak, e.value); mdd = Math.min(mdd, (e.value - peak) / peak); }
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = trades.length ? wins / trades.length : 0;
    const totalReturn = (equity.at(-1)?.value ?? 10000) / 10000 - 1;

    const metrics = {
      total_return: totalReturn,
      sharpe,
      max_drawdown: mdd,
      win_rate: winRate,
      trades_count: trades.length,
      final_equity: equity.at(-1)?.value ?? 10000,
    };

    const { data: inserted, error } = await supabase.from("backtests").insert({
      user_id: user.id,
      ticker,
      start_date, end_date,
      params: { strategy_type, dte, delta_target, iv, profit_take, stop_loss, iv_mode },
      metrics, equity_curve: equity, trades, status: "completed",
    }).select().single();
    if (error) throw error;

    return json({ backtest: inserted });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function inverseNormal(p: number) {
  // Beasley-Springer/Moro
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= ph) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}