import { supabase } from "@/integrations/supabase/client";

// In-memory cache + in-flight dedup for polygon edge function calls.
// Many components mount the same hooks (HeroTicker, WatchCard, MarketStatusBar)
// and were each issuing identical requests, hammering the edge function.
type CacheEntry = { value: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

// Per-action cache TTL (ms). 0 = no cache.
const TTL: Record<string, number> = {
  // Underlying snapshot — many components mount useLiveQuote for the same
  // ticker; cache briefly so multiple cards share the request, but refresh
  // fast enough that dashboard prices feel live.
  "ticker-snapshot": 8_000,
  "stock-aggregates": 5 * 60_000,
  "options-expirations": 10 * 60_000,
  "options-contracts": 5 * 60_000,
  "options-snapshot-chain": 20_000,
  "option-snapshot-single": 10_000,
  "option-aggregates": 5 * 60_000,
  "option-intraday-pair": 30_000,
  "option-history-pair": 5 * 60_000,
  "search-tickers": 5 * 60_000,
  "market-status": 60_000,
};

function keyFor(action: string, body: Record<string, any>) {
  const sorted = Object.keys(body).sort().reduce<Record<string, any>>((a, k) => { a[k] = body[k]; return a; }, {});
  return `${action}:${JSON.stringify(sorted)}`;
}

export async function callPolygon<T = any>(action: string, body: Record<string, any> = {}): Promise<T> {
  const key = keyFor(action, body);
  const now = Date.now();
  const ttl = TTL[action] ?? 0;

  if (ttl > 0) {
    const c = cache.get(key);
    if (c && c.expiresAt > now) return c.value as T;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const { data, error } = await supabase.functions.invoke("polygon-proxy", {
      body: { action, ...body },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    const shouldCache = !((data as any)?.fallback && Array.isArray((data as any)?.results) && (data as any).results.length === 0);
    if (ttl > 0 && shouldCache) cache.set(key, { value: data, expiresAt: Date.now() + ttl });
    return data;
  })().finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p as Promise<T>;
}

/** Force-refresh: clears cache so next call hits network. */
export function invalidatePolygonCache(actionPrefix?: string) {
  if (!actionPrefix) { cache.clear(); return; }
  for (const k of cache.keys()) if (k.startsWith(actionPrefix + ":")) cache.delete(k);
}

if (typeof window !== "undefined") {
  window.addEventListener("optix:refresh", () => invalidatePolygonCache());
}

export async function searchTickers(query: string) {
  if (!query.trim()) return [];
  const data = await callPolygon<{ results?: any[] }>("search-tickers", { query });
  return data.results ?? [];
}

export async function getSnapshot(ticker: string) {
  const data = await callPolygon<any>("ticker-snapshot", { ticker });
  return data?.ticker ?? null;
}

export async function getOptionsChain(ticker: string, expiration_date?: string) {
  const data = await callPolygon<{ results?: any[] }>("options-snapshot-chain", { ticker, expiration_date });
  return data.results ?? [];
}

export async function getOptionsContracts(ticker: string, expiration_date?: string) {
  const data = await callPolygon<{ results?: any[] }>("options-contracts", { ticker, expiration_date });
  return data.results ?? [];
}

export async function getOptionsExpirations(ticker: string): Promise<string[]> {
  const data = await callPolygon<{ results?: string[] }>("options-expirations", { ticker });
  return data.results ?? [];
}

export async function getStockBars(ticker: string, from: string, to: string) {
  const data = await callPolygon<{ results?: any[] }>("stock-aggregates", { ticker, from, to });
  return data.results ?? [];
}

export async function getMarketStatus() {
  return callPolygon<any>("market-status", {});
}

export async function getOptionQuotes(
  option_ticker: string,
  opts: { gte?: number; lte?: number; limit?: number; order?: "asc" | "desc" } = {},
) {
  const { gte, lte, limit = 50000, order = "asc" } = opts;
  const data = await callPolygon<{ results?: any[] }>("option-quotes", { option_ticker, gte, lte, limit, order });
  return data.results ?? [];
}

export async function getOptionTrades(option_ticker: string, gte?: number, limit = 5000) {
  const data = await callPolygon<{ results?: any[] }>("option-trades", { option_ticker, gte, limit });
  return data.results ?? [];
}

export async function getOptionSnapshotSingle(underlying: string, option_ticker: string) {
  const data = await callPolygon<any>("option-snapshot-single", { underlying, option_ticker });
  return data?.results ?? null;
}

export async function runHistoricalFlow(payload: Record<string, any>) {
  const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke("historical-flow", { body: payload });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}