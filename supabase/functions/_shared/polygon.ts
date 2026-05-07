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