import { useEffect, useState } from "react";
import { callPolygon } from "@/lib/polygon";

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export function useStockBars(ticker: string | null, from: string, to: string, timespan = "day", multiplier = 1) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!ticker || !from || !to) { setBars([]); return; }
    let cancelled = false;
    setLoading(true);
    callPolygon<{ results?: Bar[] }>("stock-aggregates", { ticker, from, to, timespan, multiplier })
      .then(d => { if (!cancelled) setBars(d.results ?? []); })
      .catch(() => { /* keep the last visible chart instead of flashing blank */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, from, to, timespan, multiplier]);
  return { bars, loading };
}