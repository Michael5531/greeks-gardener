import { corsHeaders, json } from "../_shared/cors.ts";
import { bsPrice, bsGreeks, type OptType } from "../_shared/blackScholes.ts";
import { getCached, setCached, defaultTtl } from "../_shared/cache.ts";

interface InLeg {
  type: OptType;
  side: "long" | "short";
  strike: number;
  dte: number;          // days to expiry from "today"
  iv: number;           // decimal
  qty?: number;
  expiration?: string;  // optional pass-through for UI labelling
}

const POLY = "https://api.polygon.io";
const KEY = Deno.env.get("POLYGON_API_KEY") ?? "";

async function fetchUnderlying(ticker: string): Promise<{ t: string; c: number }[]> {
  if (!ticker || !KEY) return [];
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(`${POLY}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${KEY}`);
    const d = await r.json();
    return (d.results ?? []).map((b: any) => ({ t: new Date(b.t).toISOString().slice(0, 10), c: b.c }));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const b = await req.json();
    const ticker = String(b.ticker ?? "").toUpperCase();
    const spot = Number(b.spot);
    const r = Number(b.r ?? 0.045);
    const pctMove = Number(b.pctMove ?? 0);
    const ivMovePp = Number(b.ivMove ?? 0);
    const daysPassed = Math.max(0, Number(b.daysPassed ?? 0));
    const withUnderlying = !!b.withUnderlying;
    const legs: InLeg[] = Array.isArray(b.legs) ? b.legs : [];
    if (!Number.isFinite(spot) || spot <= 0) return json({ error: "spot must be > 0" }, 400);
    if (!legs.length) return json({ error: "legs required" }, 400);

    const round = (n: number) => Math.round(n * 10000) / 10000;
    const legKey = legs.map(l => `${l.side[0]}${l.type[0]}${round(l.strike)}@${l.dte}/${round(l.iv)}x${l.qty ?? 1}`).join(",");
    const cacheKey = `${ticker}|${round(spot)}|${legKey}|${round(pctMove)}|${round(ivMovePp)}|${daysPassed}|${withUnderlying ? 1 : 0}`;
    const cached = await getCached("pricer-ml", cacheKey);
    if (cached) {
      return new Response(JSON.stringify({ ...cached.payload, computed_at: cached.computed_at, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
      });
    }

    let currentValue = 0, projectedValue = 0;
    const greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
    const newSpot = spot * (1 + pctMove / 100);

    const enriched = legs.map(l => {
      const qty = l.qty ?? 1;
      const sign = l.side === "long" ? 1 : -1;
      const T = Math.max(l.dte / 365, 1 / 365);
      const newSigma = Math.max(0.01, l.iv + ivMovePp / 100);
      const newT = Math.max((l.dte - daysPassed) / 365, 1 / 365);
      const cur = bsPrice(spot, l.strike, T, r, l.iv, l.type);
      const proj = bsPrice(newSpot, l.strike, newT, r, newSigma, l.type);
      const g = bsGreeks(spot, l.strike, T, r, l.iv, l.type);
      currentValue += sign * cur * qty * 100;
      projectedValue += sign * proj * qty * 100;
      greeks.delta += sign * g.delta * qty;
      greeks.gamma += sign * g.gamma * qty;
      greeks.theta += sign * g.theta * qty;
      greeks.vega  += sign * g.vega  * qty;
      return { ...l, qty, entryPrice: cur };
    });

    const dPrice = projectedValue - currentValue;

    // Curve: PnL across spot range (today + at expiry of nearest leg)
    const lo = spot * 0.7, hi = spot * 1.3;
    const curve: { price: number; expiry: number; today: number }[] = [];
    for (let i = 0; i < 81; i++) {
      const p = lo + (hi - lo) * (i / 80);
      let exp = 0, today = 0;
      for (const l of enriched) {
        const sign = l.side === "long" ? 1 : -1;
        const intrinsic = l.type === "call" ? Math.max(0, p - l.strike) : Math.max(0, l.strike - p);
        const todayT = Math.max((l.dte - daysPassed) / 365, 1 / 365);
        const todayVal = bsPrice(p, l.strike, todayT, r, Math.max(0.01, l.iv + ivMovePp / 100), l.type);
        exp += sign * (intrinsic - l.entryPrice) * l.qty * 100;
        today += sign * (todayVal - l.entryPrice) * l.qty * 100;
      }
      curve.push({ price: +p.toFixed(2), expiry: +exp.toFixed(2), today: +today.toFixed(2) });
    }

    const breakevens: number[] = [];
    // Only detect true sign changes; ignore flat-zero curves (e.g., legs without strike yet).
    const maxAbs = Math.max(...curve.map(c => Math.abs(c.expiry)));
    if (maxAbs > 1e-6) {
      for (let i = 1; i < curve.length; i++) {
        const a = curve[i - 1], c = curve[i];
        const crosses = (a.expiry < 0 && c.expiry > 0) || (a.expiry > 0 && c.expiry < 0);
        if (!crosses) continue;
        const denom = c.expiry - a.expiry || 1;
        breakevens.push(+(a.price + (c.price - a.price) * (-a.expiry / denom)).toFixed(2));
        if (breakevens.length >= 4) break;
      }
    }

    const underlying = withUnderlying ? await fetchUnderlying(ticker) : [];

    const payload = {
      legs: enriched, currentValue, projectedValue, dPrice, greeks, curve,
      breakevens, spot, underlying,
      maxProfit: Math.max(...curve.map(c => c.expiry)),
      maxLoss: Math.min(...curve.map(c => c.expiry)),
    };
    await setCached("pricer-ml", cacheKey, payload, defaultTtl("pricer"));
    return new Response(JSON.stringify({ ...payload, computed_at: new Date().toISOString(), source: "fresh" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});