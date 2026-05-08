import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [debounced, setDebounced] = useState(input);
  useEffect(() => { const id = setTimeout(() => setDebounced(input), 300); return () => clearTimeout(id); }, [JSON.stringify(input)]);
  const q = useQuery({
    queryKey: ["pricer", debounced && JSON.stringify(debounced)],
    enabled: !!debounced,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-pricer", { body: debounced });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as PricerResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null };
}