// Shared Polygon REST client used by all compute-* edge functions.
// Uses POLYGON_API_KEY against the official Polygon API host.
const BASE = "https://api.polygon.io";
const KEY = Deno.env.get("POLYGON_API_KEY") ?? "";

export function hasKey() {
  return !!KEY;
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url);
  return await r.json();
}

async function yahooStockBars(ticker: string, from: string, to: string, timespan: "day" | "hour" = "day"): Promise<any[]> {
  try {
    const fromSec = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
    const toSec = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);
    const interval = timespan === "hour" ? "1h" : "1d";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${fromSec}&period2=${toSec}&interval=${interval}&events=history&includeAdjustedClose=true`;
    const d = await fetchJson(url);
    const res0 = d?.chart?.result?.[0];
    const ts: number[] = res0?.timestamp ?? [];
    const q = res0?.indicators?.quote?.[0] ?? {};
    return ts.map((t: number, i: number) => ({
      t: t * 1000,
      o: q.open?.[i] ?? q.close?.[i] ?? null,
      h: q.high?.[i] ?? q.close?.[i] ?? null,
      l: q.low?.[i] ?? q.close?.[i] ?? null,
      c: q.close?.[i] ?? null,
      v: q.volume?.[i] ?? 0,
      source: "yahoo-chart",
    })).filter((b: any) => Number.isFinite(b.c) && b.c > 0);
  } catch (_) {
    return [];
  }
}

export async function getOptionsChain(ticker: string, expiration_date?: string): Promise<any[]> {
  const expQ = expiration_date ? `&expiration_date=${encodeURIComponent(expiration_date)}` : "";
  let next = `${BASE}/v3/snapshot/options/${encodeURIComponent(ticker)}?limit=250${expQ}&apiKey=${KEY}`;
  const all: any[] = [];
  let pages = 0;
  const maxPages = expiration_date ? 6 : 20;
  while (next && pages < maxPages) {
    const dd = await fetchJson(next);
    if (Array.isArray(dd.results)) all.push(...dd.results);
    pages++;
    next = dd.next_url ? `${dd.next_url}&apiKey=${KEY}` : "";
  }
  return all;
}

export async function getSnapshot(ticker: string): Promise<any> {
  const url = `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}?apiKey=${KEY}`;
  const d = await fetchJson(url);
  return d?.ticker ?? null;
}

export async function getOptionsExpirations(ticker: string): Promise<string[]> {
  const seen = new Set<string>();
  let next = `${BASE}/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(ticker)}&limit=1000&expired=false&apiKey=${KEY}`;
  let pages = 0;
  while (next && pages < 10) {
    const dd = await fetchJson(next);
    for (const c of dd.results ?? []) if (c.expiration_date) seen.add(c.expiration_date);
    pages++;
    next = dd.next_url ? `${dd.next_url}&apiKey=${KEY}` : "";
  }
  return Array.from(seen).sort();
}

export async function getStockBars(
  ticker: string,
  from: string,
  to: string,
  timespan: "day" | "hour" = "day",
): Promise<any[]> {
  const url = `${BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${KEY}`;
  const d = await fetchJson(url);
  const polygonBars = Array.isArray(d?.results) ? d.results : [];
  return polygonBars.length ? polygonBars : await yahooStockBars(ticker, from, to, timespan);
}