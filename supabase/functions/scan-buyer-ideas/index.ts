import { corsHeaders, json } from "../_shared/cors.ts";
import { getStockBars } from "../_shared/polygon.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Lightweight long-premium setup scanner.
 *
 * For each ticker (default: popular optionable names + caller-supplied):
 *  - fetches 90d daily bars (1 polygon call)
 *  - computes HV20 / RSI14 / 20d return / 5d return / spot
 *  - reads the latest iv_history snapshot for IV30 + IV Rank (if enough days)
 *  - scores long-premium attractiveness:
 *      cheapVol  = max(0, 50 - IVR) * 1.0      // lower IVR = better
 *      momentum  = |return_20d| * 200          // strong moves either way
 *      align     = sign(return_20d) == sign(return_5d) ? 15 : 0
 *      flowProxy = clamp(|return_5d| * 150, 0, 25)
 *      score = cheapVol + momentum + align + flowProxy
 *  - returns ranked list, with implied bias (long call / long put) per row
 *
 * Body: { tickers?: string[] }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const POPULAR = [
  "SPY", "QQQ", "IWM", "NVDA", "AAPL", "MSFT", "TSLA", "AMD",
  "META", "GOOGL", "AMZN", "NFLX", "AVGO", "COIN", "PLTR", "SMCI",
];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff; else loss -= diff;
  }
  const avgG = gain / period;
  const avgL = loss / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function hv(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const s = closes.slice(-window - 1);
  const rets: number[] = [];
  for (let i = 1; i < s.length; i++) rets.push(Math.log(s[i] / s[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  return Math.sqrt(v * 252);
}

async function scanOne(ticker: string, sb: any) {
  try {
    const today = new Date();
    const from = new Date(today.getTime() - 120 * 86_400_000);
    const bars = await getStockBars(ticker, ymd(from), ymd(today));
    const closes = bars.map((b: any) => b.c).filter((x: any) => typeof x === "number");
    if (closes.length < 25) return null;
    const spot = closes[closes.length - 1];
    const ret20 = (spot / closes[closes.length - 21] - 1);
    const ret5 = (spot / closes[Math.max(0, closes.length - 6)] - 1);
    const hv20 = hv(closes, 20);
    const rsi14 = rsi(closes, 14);

    // IV history → latest iv30 + 52w min/max for IVR
    const yearAgo = new Date(today.getTime() - 365 * 86_400_000);
    const { data: hist } = await sb.from("iv_history")
      .select("snapshot_date, iv30")
      .eq("ticker", ticker)
      .gte("snapshot_date", ymd(yearAgo))
      .order("snapshot_date", { ascending: false })
      .limit(260);
    const ivs = (hist ?? []).map((r: any) => Number(r.iv30)).filter((x: number) => Number.isFinite(x) && x > 0);
    const iv30 = ivs.length ? ivs[0] : null;
    let ivr: number | null = null;
    if (iv30 != null && ivs.length >= 20) {
      const min = Math.min(...ivs), max = Math.max(...ivs);
      if (max > min) ivr = +(((iv30 - min) / (max - min)) * 100).toFixed(0);
    }

    const cheapVol = ivr == null ? 25 : Math.max(0, 50 - ivr); // unknown gets neutral
    const momentum = Math.min(60, Math.abs(ret20) * 200);
    const align = Math.sign(ret20) === Math.sign(ret5) && ret20 !== 0 ? 15 : 0;
    const flowProxy = Math.min(25, Math.abs(ret5) * 150);
    const score = +(cheapVol + momentum + align + flowProxy).toFixed(1);

    const bias: "long-call" | "long-put" | "neutral" =
      ret20 > 0.03 && (rsi14 ?? 50) < 70 ? "long-call" :
      ret20 < -0.03 && (rsi14 ?? 50) > 30 ? "long-put" :
      "neutral";

    const ivHvSpread = (iv30 != null && hv20 != null) ? +(iv30 - hv20).toFixed(3) : null;

    return {
      ticker, spot, iv30, ivr, hv20, rsi14, ret5, ret20,
      ivHvSpread, bias, score, historyDays: ivs.length,
    };
  } catch (e) {
    return { ticker, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const extra: string[] = Array.isArray(body.tickers)
      ? body.tickers.map((t: any) => String(t).toUpperCase()).filter(Boolean)
      : [];
    const set = new Set<string>([...POPULAR, ...extra]);
    const tickers = Array.from(set).slice(0, 40);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const rows = (await Promise.all(tickers.map(t => scanOne(t, sb))))
      .filter((r): r is any => r && !r.error)
      .sort((a, b) => b.score - a.score);

    return json({
      rows,
      universe: tickers,
      computed_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});