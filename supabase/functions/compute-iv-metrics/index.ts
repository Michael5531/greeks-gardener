import { corsHeaders, json } from "../_shared/cors.ts";
import { getOptionsChain, getStockBars } from "../_shared/polygon.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Computes IV / HV metrics for a ticker:
 *  - HV20 / HV30 / HV60 (annualised stdev of log-returns)
 *  - IV30 (ATM IV interpolated near 30 DTE)
 *  - Term structure (avg ATM IV per expiration)
 *  - 25Δ Risk Reversal & Butterfly skew (nearest monthly expiry)
 *  - IV Rank / IV Percentile (from iv_history table; null until enough days)
 *  - IV-HV spread (IV30 - HV30)
 *  - Persists today's snapshot to iv_history.
 *
 * Body: { ticker: string, persist?: boolean }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function annualisedHV(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const slice = closes.slice(-window - 1);
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  return Math.sqrt(v * 252);
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const ticker: string = (body.ticker ?? "").toUpperCase();
    const persist: boolean = body.persist !== false;
    if (!ticker) return json({ error: "ticker required" }, 400);

    // 1) Stock history → HV
    const today = new Date();
    const from = new Date(today.getTime() - 200 * 86_400_000);
    const bars = await getStockBars(ticker, ymd(from), ymd(today)).catch(() => []);
    const closes = bars.map((b: any) => b.c).filter((x: any) => typeof x === "number" && x > 0);
    const spotFromBars = closes.length ? closes[closes.length - 1] : null;
    const hv20 = annualisedHV(closes, 20);
    const hv30 = annualisedHV(closes, 30);
    const hv60 = annualisedHV(closes, 60);

    // 2) Options chain → IV term structure + skew
    const chain = await getOptionsChain(ticker).catch(() => []);
    const filtered = chain.filter((d: any) => d?.details?.ticker?.startsWith(`O:${ticker}`));
    const spot =
      filtered.find((c: any) => c?.underlying_asset?.price != null)?.underlying_asset?.price
      ?? spotFromBars;

    // Group by expiration
    const byExp = new Map<string, any[]>();
    for (const d of filtered) {
      const e = d.details?.expiration_date;
      if (!e) continue;
      const arr = byExp.get(e) ?? [];
      arr.push(d);
      byExp.set(e, arr);
    }

    // Term structure: avg ATM IV per expiration (calls + puts within ±5% of spot)
    const term: { exp: string; dte: number; iv: number; n: number }[] = [];
    if (spot) {
      for (const [exp, arr] of byExp) {
        const expDate = new Date(exp + "T00:00:00Z");
        const dte = daysBetween(today, expDate);
        if (dte < 1) continue;
        const atmBand = arr.filter((d: any) => {
          const k = d.details?.strike_price;
          const iv = d.implied_volatility;
          return typeof k === "number" && typeof iv === "number" && iv > 0 && iv < 5
            && Math.abs(k - spot) / spot < 0.05;
        });
        if (!atmBand.length) continue;
        const avg = atmBand.reduce((s, d) => s + d.implied_volatility, 0) / atmBand.length;
        term.push({ exp, dte, iv: +(avg).toFixed(4), n: atmBand.length });
      }
      term.sort((a, b) => a.dte - b.dte);
    }

    // IV30 = linear interpolation of term structure to 30 DTE
    let iv30: number | null = null;
    if (term.length) {
      const before = [...term].reverse().find(t => t.dte <= 30);
      const after = term.find(t => t.dte >= 30);
      if (before && after && before.dte !== after.dte) {
        const w = (30 - before.dte) / (after.dte - before.dte);
        iv30 = +(before.iv + (after.iv - before.iv) * w).toFixed(4);
      } else if (after) {
        iv30 = after.iv;
      } else if (before) {
        iv30 = before.iv;
      }
    }

    // 3) Skew at nearest monthly (>=20 DTE)
    let rr25: number | null = null;
    let fly25: number | null = null;
    let skewExp: string | null = null;
    if (spot) {
      const candidate = term.find(t => t.dte >= 20) ?? term[0];
      if (candidate) {
        skewExp = candidate.exp;
        const arr = byExp.get(candidate.exp) ?? [];
        const calls = arr.filter((d: any) =>
          d.details?.contract_type === "call"
          && typeof d.implied_volatility === "number"
          && typeof d.greeks?.delta === "number");
        const puts = arr.filter((d: any) =>
          d.details?.contract_type === "put"
          && typeof d.implied_volatility === "number"
          && typeof d.greeks?.delta === "number");
        const c25 = calls.sort((a, b) =>
          Math.abs((a.greeks.delta ?? 0) - 0.25) - Math.abs((b.greeks.delta ?? 0) - 0.25))[0];
        const p25 = puts.sort((a, b) =>
          Math.abs((a.greeks.delta ?? 0) + 0.25) - Math.abs((b.greeks.delta ?? 0) + 0.25))[0];
        const cAtm = calls.sort((a, b) =>
          Math.abs(a.details.strike_price - spot) - Math.abs(b.details.strike_price - spot))[0];
        const pAtm = puts.sort((a, b) =>
          Math.abs(a.details.strike_price - spot) - Math.abs(b.details.strike_price - spot))[0];
        if (c25 && p25) rr25 = +((c25.implied_volatility - p25.implied_volatility)).toFixed(4);
        if (c25 && p25 && cAtm && pAtm) {
          const wing = (c25.implied_volatility + p25.implied_volatility) / 2;
          const atm = (cAtm.implied_volatility + pAtm.implied_volatility) / 2;
          fly25 = +(wing - atm).toFixed(4);
        }
      }
    }

    // 4) IV Rank / Percentile from history
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const yearAgo = new Date(today.getTime() - 365 * 86_400_000);
    const { data: hist } = await sb.from("iv_history")
      .select("snapshot_date, iv30")
      .eq("ticker", ticker)
      .gte("snapshot_date", ymd(yearAgo))
      .order("snapshot_date", { ascending: true });
    const histIVs = (hist ?? [])
      .map((r: any) => Number(r.iv30))
      .filter((x: number) => Number.isFinite(x) && x > 0);
    let ivRank: number | null = null;
    let ivPercentile: number | null = null;
    if (iv30 != null && histIVs.length >= 20) {
      const min = Math.min(...histIVs);
      const max = Math.max(...histIVs);
      if (max > min) ivRank = +(((iv30 - min) / (max - min)) * 100).toFixed(1);
      const below = histIVs.filter(v => v < iv30!).length;
      ivPercentile = +((below / histIVs.length) * 100).toFixed(1);
    }

    // 5) Persist today
    if (persist && iv30 != null) {
      await sb.from("iv_history").upsert({
        ticker,
        snapshot_date: ymd(today),
        iv30,
        hv30,
        rr25,
        fly25,
        spot,
      }, { onConflict: "ticker,snapshot_date" });
    }

    const ivHvSpread = (iv30 != null && hv30 != null) ? +(iv30 - hv30).toFixed(4) : null;

    return json({
      ticker,
      spot,
      computed_at: new Date().toISOString(),
      hv: { hv20, hv30, hv60 },
      iv30,
      ivRank,
      ivPercentile,
      ivHvSpread,
      term,
      skew: { exp: skewExp, rr25, fly25 },
      historyDays: histIVs.length,
      source: "fresh",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});