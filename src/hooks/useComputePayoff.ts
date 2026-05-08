import { useQuery } from "@tanstack/react-query";
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
  const enabled = !!strategyId && spot > 0 && iv > 0 && dte > 0;
  const key = `${strategyId}|${enabled ? spot.toFixed(2) : ""}|${enabled ? iv.toFixed(4) : ""}|${dte}`;
  const q = useQuery({
    queryKey: ["payoff", key],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-payoff", { body: { strategy_id: strategyId, spot, iv, dte } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as PayoffResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null };
}