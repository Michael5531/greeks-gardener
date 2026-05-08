import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MLLeg {
  type: "call" | "put";
  side: "long" | "short";
  strike: number;
  dte: number;
  iv: number;
  qty?: number;
  expiration?: string;
}
export interface MLPricerInput {
  ticker: string;
  spot: number;
  legs: MLLeg[];
  pctMove?: number;
  ivMove?: number;
  daysPassed?: number;
  withUnderlying?: boolean;
}
export interface MLPricerResult {
  legs: any[];
  currentValue: number;
  projectedValue: number;
  dPrice: number;
  greeks: { delta: number; gamma: number; theta: number; vega: number };
  curve: { price: number; expiry: number; today: number }[];
  breakevens: number[];
  spot: number;
  underlying: { t: string; c: number }[];
  maxProfit: number;
  maxLoss: number;
  source?: string;
}

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [JSON.stringify(v), ms]);
  return d;
}

export function useComputePricerMultileg(input: MLPricerInput | null) {
  const debounced = useDebounced(input, 300);
  const enabled = !!debounced && debounced.legs.length > 0 && debounced.spot > 0;
  const q = useQuery({
    queryKey: ["pricer-ml", debounced && JSON.stringify(debounced)],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-pricer-multileg", { body: debounced });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as MLPricerResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading || q.isFetching, error: q.error ? (q.error as Error).message : null };
}