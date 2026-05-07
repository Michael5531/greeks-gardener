import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PricerInput {
  spot: number;
  strike: number;
  dte: number;
  iv: number;        // decimal
  r: number;         // decimal
  type: "call" | "put";
  pctMove?: number;
  ivMove?: number;   // percentage points (decimal scale matches edge function)
  daysPassed?: number;
}
export interface PricerResult {
  current: number;
  projected: number;
  dPrice: number;
  pnl: number;
  greeks: { delta: number; gamma: number; theta: number; vega: number; rho: number };
  curve: { price: number; pnl: number }[];
  computed_at?: string;
  source?: string;
}

export function useComputePricer(input: PricerInput | null) {
  const [data, setData] = useState<PricerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = input ? JSON.stringify(input) : "";
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!input) return;
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancel = false;
    setLoading(true); setError(null);
    supabase.functions.invoke("compute-pricer", { body: input })
      .then(({ data: d, error: e }) => {
        if (cancel) return;
        if (e || (d as any)?.error) { setError(e?.message ?? (d as any).error); setData(null); }
        else setData(d as PricerResult);
      }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [key]);

  return { data, loading, error };
}