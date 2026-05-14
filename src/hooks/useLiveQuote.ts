import { useCallback, useEffect, useState } from "react";
import { getSnapshot } from "@/lib/polygon";
import { useInterval } from "./useInterval";

export type LiveQuote = {
  ticker: string;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  updated: number;
};

/**
 * Default underlying-price refresh interval. Callers may pass a custom
 * value (e.g. 3s during regular session, 30s when closed).
 */
export const UNDERLYING_REFRESH_MS = 15_000;

export function useLiveQuote(ticker: string | null, intervalMs = UNDERLYING_REFRESH_MS) {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setQuote(null); }, [ticker]);

  const fetchOnce = useCallback(() => {
    if (!ticker) return;
    setLoading(true);
    getSnapshot(ticker)
      .then((s: any) => {
        if (!s) return;
        const price = s.lastTrade?.p ?? s.day?.c ?? s.min?.c ?? null;
        const prev = s.prevDay?.c ?? null;
        const change = price != null && prev != null ? price - prev : null;
        const changePct = change != null && prev ? change / prev : null;
        setQuote({ ticker, price, prevClose: prev, change, changePct, updated: Date.now() });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  useInterval(fetchOnce, intervalMs, { enabled: !!ticker });

  useEffect(() => {
    const onRefresh = () => fetchOnce();
    window.addEventListener("optix:refresh", onRefresh);
    return () => window.removeEventListener("optix:refresh", onRefresh);
  }, [fetchOnce]);

  return { quote, loading, refresh: fetchOnce };
}

export type MarketSession = "pre" | "regular" | "after" | "closed";

export function computeSessionET(now = new Date()): MarketSession {
  // Use ET via Intl
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = parts.find(p => p.type === "weekday")?.value ?? "";
  const hh = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
  if (wd === "Sat" || wd === "Sun") return "closed";
  const t = hh * 60 + mm;
  if (t >= 4 * 60 && t < 9 * 60 + 30) return "pre";
  if (t >= 9 * 60 + 30 && t < 16 * 60) return "regular";
  if (t >= 16 * 60 && t < 20 * 60) return "after";
  return "closed";
}