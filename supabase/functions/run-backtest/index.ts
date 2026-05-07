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

    // Helper: estimate strike from delta target via inverse Black-Scholes (rough)
    function strikeForDelta(S: number, T: number, target: number, type: "call" | "put") {
      // Inverse N(): use approximation
      const z = inverseNormal(type === "call" ? target : 1 - target);
      // d1 = (ln(S/K) + (r + 0.5σ²)T)/(σ√T)  =>  K = S * exp((r + 0.5σ²)T - z*σ*√T)
      return S * Math.exp((r0 + 0.5 * iv * iv) * T - z * iv * Math.sqrt(T));
    }

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const date = new Date(bar.t).toISOString().slice(0, 10);
      const S = bar.c;

      // Manage open position
      if (position) {
        const T = Math.max(0, (position.expiry - bar.t) / (1000 * 60 * 60 * 24 * 365));
        const optType: "call" | "put" = strategy_type === "covered_call" ? "call" : "put";
        const currentPremium = bs(S, position.strike, T, r0, iv, optType);
        const pnl = (position.entry_premium - currentPremium) * 100; // short option PnL
        const exitByExpiry = T <= 0;
        const exitByProfit = pnl >= position.entry_premium * 100 * profit_take;
        const exitByStop = currentPremium >= position.entry_premium * (1 + stop_loss);
        if (exitByExpiry || exitByProfit || exitByStop) {
          cash += pnl;
          trades.push({
            ...position,
            exit_date: date, exit_price: currentPremium,
            pnl, reason: exitByExpiry ? "expiry" : exitByProfit ? "profit_take" : "stop_loss",
          });
          position = null;
        }
      }

      // Open new position if flat
      if (!position) {
        const T = dte / 365;
        const optType: "call" | "put" = strategy_type === "covered_call" ? "call" : "put";
        const K = strikeForDelta(S, T, delta_target, optType);
        const premium = bs(S, K, T, r0, iv, optType);
        position = {
          entry_date: date, entry_spot: S, strike: Math.round(K * 100) / 100,
          entry_premium: premium,
          expiry: bar.t + dte * 24 * 60 * 60 * 1000,
          type: optType,
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
      params: { strategy_type, dte, delta_target, iv, profit_take, stop_loss },
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