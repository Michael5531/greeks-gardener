import { corsHeaders, json } from "../_shared/cors.ts";
import { bsPrice, bsGreeks, type OptType } from "../_shared/blackScholes.ts";
import { getCached, setCached, defaultTtl } from "../_shared/cache.ts";

/**
 * Body: { spot, strike, dte, iv (decimal), r (decimal), type, pctMove?, ivMove? (pp), daysPassed? }
 * Returns: { current, projected, dPrice, pnl, greeks, curve }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const b = await req.json();
    const spot = Number(b.spot);
    const K = Number(b.strike);
    const dte = Math.max(1, Number(b.dte));
    const iv = Number(b.iv);
    const r = Number(b.r ?? 0.045);
    const type: OptType = b.type === "put" ? "put" : "call";
    const pctMove = Number(b.pctMove ?? 0);
    const ivMovePp = Number(b.ivMove ?? 0); // percentage points
    const daysPassed = Math.min(dte - 1, Math.max(0, Number(b.daysPassed ?? 0)));
    if (![spot, K, iv].every(v => Number.isFinite(v) && v > 0))
      return json({ error: "spot/strike/iv must be > 0" }, 400);

    const round = (n: number) => Math.round(n * 10000) / 10000;
    const cacheKey = [type, round(spot), round(K), dte, round(iv), round(r), round(pctMove), round(ivMovePp), daysPassed].join("|");
    const cached = await getCached("pricer", cacheKey);
    if (cached) return json({ ...cached.payload, computed_at: cached.computed_at, source: "cache" });

    const T = Math.max(dte / 365, 1 / 365);
    const current = bsPrice(spot, K, T, r, iv, type);
    const greeks = bsGreeks(spot, K, T, r, iv, type);
    const newSpot = spot * (1 + pctMove / 100);
    const newSigma = Math.max(0.01, iv + ivMovePp / 100);
    const newT = Math.max((dte - daysPassed) / 365, 1 / 365);
    const projected = bsPrice(newSpot, K, newT, r, newSigma, type);
    const dPrice = projected - current;
    const pnl = dPrice * 100;

    const lo = spot * 0.8, hi = spot * 1.2;
    const curve: { price: number; pnl: number }[] = [];
    for (let i = 0; i < 81; i++) {
      const p = lo + (hi - lo) * (i / 80);
      const proj = bsPrice(p, K, newT, r, newSigma, type);
      curve.push({ price: +p.toFixed(2), pnl: +((proj - current) * 100).toFixed(2) });
    }
    const payload = { current, projected, dPrice, pnl, greeks, curve };
    await setCached("pricer", cacheKey, payload, defaultTtl("pricer"));
    return json({ ...payload, computed_at: new Date().toISOString(), source: "fresh" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});