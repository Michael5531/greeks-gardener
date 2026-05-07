import { corsHeaders, json } from "../_shared/cors.ts";
import { getOptionsChain } from "../_shared/polygon.ts";
import { getCached, setCached, defaultTtl } from "../_shared/cache.ts";

/**
 * Computes IV smile + Call/Put OI/Vol pivots used by Greeks3D page.
 * Body: { ticker: string, expirations?: string[] }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const ticker: string = (body.ticker ?? "").toUpperCase();
    const expirations: string[] = Array.isArray(body.expirations) ? body.expirations.slice().sort() : [];
    if (!ticker) return json({ error: "ticker required" }, 400);

    const key = `${ticker}|${expirations.join(",")}`;
    const cached = await getCached("iv-surface", key);
    if (cached) return json({ ...cached.payload, computed_at: cached.computed_at, source: "cache" });

    let chain: any[] = [];
    if (!expirations.length) chain = await getOptionsChain(ticker);
    else {
      const arrs = await Promise.all(expirations.map(e => getOptionsChain(ticker, e).catch(() => [])));
      const seen = new Set<string>();
      for (const arr of arrs) for (const c of arr) {
        const k = `${c.details?.ticker}|${c.details?.strike_price}|${c.details?.expiration_date}|${c.details?.contract_type}`;
        if (!seen.has(k)) { seen.add(k); chain.push(c); }
      }
    }
    chain = chain.filter(d => d.details?.ticker?.startsWith(`O:${ticker}`));
    const expFilter = expirations.length ? new Set(expirations) : null;
    const data = expFilter ? chain.filter(d => expFilter.has(d.details?.expiration_date)) : chain;

    // IV smile
    const strikeSet = new Set<number>();
    const expSet = new Set<string>();
    const acc = new Map<string, { sum: number; n: number }>();
    for (const d of data) {
      const k = d.details?.strike_price; const e = d.details?.expiration_date;
      if (k == null || !e) continue;
      strikeSet.add(k); expSet.add(e);
      const iv = d.implied_volatility;
      if (typeof iv === "number" && iv > 0 && iv < 5) {
        const key2 = `${k}|${e}`;
        const r = acc.get(key2) ?? { sum: 0, n: 0 };
        r.sum += iv; r.n += 1; acc.set(key2, r);
      }
    }
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const exps = Array.from(expSet).sort();
    const ivCurve = strikes.map(s => {
      const row: any = { strike: s };
      for (const e of exps) {
        const r = acc.get(`${s}|${e}`);
        row[e] = r && r.n ? +(r.sum / r.n * 100).toFixed(2) : null;
      }
      return row;
    });

    // OI/Vol breakdowns
    const sMap = new Map<number, any>();
    const eMap = new Map<string, any>();
    let cOI = 0, pOI = 0, cV = 0, pV = 0;
    for (const d of data) {
      const k = d.details?.strike_price;
      const e = d.details?.expiration_date;
      const isCall = d.details?.contract_type === "call";
      const oi = d.open_interest ?? 0;
      const vol = d.day?.volume ?? 0;
      if (k != null) {
        const r = sMap.get(k) ?? { strike: k, callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        if (isCall) { r.callOI += oi; r.callVol += vol; } else { r.putOI += oi; r.putVol += vol; }
        sMap.set(k, r);
      }
      if (e) {
        const r = eMap.get(e) ?? { exp: e, callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        if (isCall) { r.callOI += oi; r.callVol += vol; } else { r.putOI += oi; r.putVol += vol; }
        eMap.set(e, r);
      }
      if (isCall) { cOI += oi; cV += vol; } else { pOI += oi; pV += vol; }
    }
    const byStrike = Array.from(sMap.values()).sort((a, b) => a.strike - b.strike);
    const byExp = Array.from(eMap.values()).sort((a, b) => a.exp.localeCompare(b.exp));

    // Per-DTE pivot for stacked Calls↑/Puts↓ charts (only selected exps)
    const useSet = expFilter ?? new Set(exps);
    const oiPiv = new Map<number, any>();
    const volPiv = new Map<number, any>();
    for (const d of data) {
      const k = d.details?.strike_price;
      const e = d.details?.expiration_date;
      if (k == null || !e || !useSet.has(e)) continue;
      const isCall = d.details?.contract_type === "call";
      const oiVal = d.open_interest ?? 0;
      const volVal = d.day?.volume ?? 0;
      const oR = oiPiv.get(k) ?? { strike: k };
      const vR = volPiv.get(k) ?? { strike: k };
      if (isCall) { oR[`${e}__c`] = (oR[`${e}__c`] ?? 0) + oiVal; vR[`${e}__c`] = (vR[`${e}__c`] ?? 0) + volVal; }
      else { oR[`${e}__p`] = (oR[`${e}__p`] ?? 0) - oiVal; vR[`${e}__p`] = (vR[`${e}__p`] ?? 0) - volVal; }
      oiPiv.set(k, oR); volPiv.set(k, vR);
    }
    const strikePivotOI = Array.from(oiPiv.values()).sort((a, b) => a.strike - b.strike);
    const strikePivotVol = Array.from(volPiv.values()).sort((a, b) => a.strike - b.strike);

    const spot = data.find((c: any) => c?.underlying_asset?.price != null)?.underlying_asset?.price ?? null;

    const payload = {
      strikes, exps, ivCurve, total: data.length,
      byStrike, byExp,
      totals: { callOI: cOI, putOI: pOI, callVol: cV, putVol: pV },
      strikePivotOI, strikePivotVol,
      spot,
    };
    await setCached("iv-surface", key, payload, defaultTtl("iv-surface"));
    return json({ ...payload, computed_at: new Date().toISOString(), source: "fresh" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});