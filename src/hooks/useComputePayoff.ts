import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PayoffResult {
  legs: { type: "call" | "put"; side: "long" | "short"; strike: number; entryPrice: number; qty: number }[];
  grid: { price: number; expiry: number; today: number }[];
  breakevens: number[];
  maxProfit: number;
  maxLoss: number;
  netDebit: number;
  computed_at?: string;
  source?: string;
}

export function useComputePayoff(strategyId: string, spot: number, iv: number, dte: number) {
  const [data, setData] = useState<PayoffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${strategyId}|${spot.toFixed(2)}|${iv.toFixed(4)}|${dte}`;
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!strategyId || !(spot > 0) || !(iv > 0) || !(dte > 0)) return;
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancel = false;
    setLoading(true); setError(null);
    supabase.functions.invoke("compute-payoff", {
      body: { strategy_id: strategyId, spot, iv, dte },
    }).then(({ data: d, error: e }) => {
      if (cancel) return;
      if (e || (d as any)?.error) { setError(e?.message ?? (d as any).error); setData(null); }
      else setData(d as PayoffResult);
    }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [key]);

  return { data, loading, error };
}