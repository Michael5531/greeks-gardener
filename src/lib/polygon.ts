import { supabase } from "@/integrations/supabase/client";

export async function callPolygon<T = any>(action: string, body: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("polygon-proxy", {
    body: { action, ...body },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
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

export async function getOptionQuotes(option_ticker: string, gte?: number, limit = 5000) {
  const data = await callPolygon<{ results?: any[] }>("option-quotes", { option_ticker, gte, limit });
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