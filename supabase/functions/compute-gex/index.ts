import { corsHeaders, json } from "../_shared/cors.ts";
import { getOptionsChain } from "../_shared/polygon.ts";
import { getCached, setCached, defaultTtl } from "../_shared/cache.ts";

/**
 * Computes Net GEX per strike, per expiration, plus zero-gamma flip.
 * Body: { ticker: string, expirations?: string[] }
 * Returns: { rows, expRows, total, flip, spot, contractCount, totalOI }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const ticker: string = (body.ticker ?? "").toUpperCase();
    const expirations: string[] = Array.isArray(body.expirations) ? body.expirations.slice().sort() : [];
    if (!ticker) return json({ error: "ticker required" }, 400);

    const key = `${ticker}|${expirations.join(",")}`;
    const cached = await getCached("gex", key);
    if (cached) return json({ ...cached.payload, computed_at: cached.computed_at, source: "cache" });

    // Fetch base chain. If specific expirations provided, fetch each separately so we get full per-exp data.
    let chain: any[] = [];
    if (expirations.length === 0) {
      chain = await getOptionsChain(ticker);
    } else {
      const results = await Promise.all(expirations.map(e => getOptionsChain(ticker, e).catch(() => [])));
      const seen = new Set<string>();
      for (const arr of results) {
        for (const c of arr) {
          const k = `${c.details?.ticker}|${c.details?.strike_price}|${c.details?.expiration_date}|${c.details?.contract_type}`;
          if (!seen.has(k)) { seen.add(k); chain.push(c); }
        }
      }
    }
    // Defensive: only this ticker's contracts
    chain = chain.filter(d => d.details?.ticker?.startsWith(`O:${ticker}`));

    const spot: number | null =
      chain.find((c: any) => c?.underlying_asset?.price != null)?.underlying_asset?.price ?? null;

    const expFilter = expirations.length ? new Set(expirations) : null;

    // Per-strike pivot: row = { strike, "<exp>__c": +val, "<exp>__p": -val, ... }
    const sMap = new Map<number, any>();
    const eMap = new Map<string, any>();
    const netByStrike = new Map<number, number>();
    let total = 0;
    let totalOI = 0;
    let cnt = 0;
    for (const d of chain) {
      const k = d.details?.strike_price;
      const e = d.details?.expiration_date;
      const oi = d.open_interest ?? 0;
      const g = d.greeks?.gamma;
      if (k == null || !e) continue;
      if (expFilter && !expFilter.has(e)) continue;
      cnt++;
      totalOI += oi;
      if (!oi || g == null || spot == null) continue;
      const isCall = d.details?.contract_type === "call";
      const val = oi * g * 100 * spot * spot * 0.01;
      const sRow = sMap.get(k) ?? { strike: k };
      if (isCall) sRow[`${e}__c`] = (sRow[`${e}__c`] ?? 0) + val;
      else sRow[`${e}__p`] = (sRow[`${e}__p`] ?? 0) - val;
      sMap.set(k, sRow);

      const eRow = eMap.get(e) ?? { exp: e };
      if (isCall) eRow[`${e}__c`] = (eRow[`${e}__c`] ?? 0) + val;
      else eRow[`${e}__p`] = (eRow[`${e}__p`] ?? 0) - val;
      eMap.set(e, eRow);

      const signed = isCall ? val : -val;
      netByStrike.set(k, (netByStrike.get(k) ?? 0) + signed);
      total += signed;
    }
    let strikes = Array.from(sMap.values()).sort((a, b) => a.strike - b.strike);
    if (spot != null) strikes = strikes.filter(r => r.strike > spot * 0.7 && r.strike < spot * 1.3);
    const expRows = Array.from(eMap.values()).sort((a, b) => a.exp.localeCompare(b.exp));

    let flip: number | null = null;
    {
      const sorted = Array.from(netByStrike.entries()).sort((a, b) => a[0] - b[0]);
      let cum = 0;
      const cums = sorted.map(([s, v]) => (cum += v, { strike: s, cum }));
      for (let i = 1; i < cums.length; i++) {
        if (cums[i - 1].cum < 0 && cums[i].cum >= 0) {
          const t = -cums[i - 1].cum / (cums[i].cum - cums[i - 1].cum);
          flip = cums[i - 1].strike + t * (cums[i].strike - cums[i - 1].strike);
          break;
        }
      }
    }

    // Mini-GEX: aggregated single-line series limited to ±15% spot
    let mini: { strike: number; gex: number }[] = [];
    {
      const map = new Map<number, number>();
      for (const [k, v] of netByStrike) map.set(k, (map.get(k) ?? 0) + v);
      let arr = Array.from(map.entries()).map(([strike, gex]) => ({ strike, gex })).sort((a, b) => a.strike - b.strike);
      if (spot != null) arr = arr.filter(r => r.strike > spot * 0.85 && r.strike < spot * 1.15);
      mini = arr;
    }

    const payload = { rows: strikes, expRows, total, flip, spot, contractCount: cnt, totalOI, mini };
    await setCached("gex", key, payload, defaultTtl("gex"));
    return json({ ...payload, computed_at: new Date().toISOString(), source: "fresh" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});