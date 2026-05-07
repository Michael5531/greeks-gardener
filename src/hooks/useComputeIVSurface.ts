import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface IVSurfaceResult {
  strikes: number[];
  exps: string[];
  ivCurve: any[];
  total: number;
  byStrike: any[];
  byExp: any[];
  totals: { callOI: number; putOI: number; callVol: number; putVol: number };
  strikePivotOI: any[];
  strikePivotVol: any[];
  spot: number | null;
  computed_at?: string;
  source?: string;
}

export function useComputeIVSurface(ticker: string | null, expirations: string[]) {
  const [data, setData] = useState<IVSurfaceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${ticker ?? ""}|${[...expirations].sort().join(",")}`;
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!ticker) { setData(null); return; }
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancel = false;
    setLoading(true); setError(null);
    supabase.functions.invoke("compute-iv-surface", { body: { ticker, expirations } })
      .then(({ data: d, error: e }) => {
        if (cancel) return;
        if (e || (d as any)?.error) { setError(e?.message ?? (d as any).error); setData(null); }
        else setData(d as IVSurfaceResult);
      }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [key]);

  return { data, loading, error };
}