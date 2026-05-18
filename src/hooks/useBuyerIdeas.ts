import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BuyerIdeaRow {
  ticker: string;
  spot: number;
  iv30: number | null;
  ivr: number | null;
  hv20: number | null;
  rsi14: number | null;
  ret5: number;
  ret20: number;
  ivHvSpread: number | null;
  bias: "long-call" | "long-put" | "neutral";
  score: number;
  historyDays: number;
}

export function useBuyerIdeas(extraTickers: string[] = []) {
  const key = [...extraTickers].sort().join(",");
  const q = useQuery({
    queryKey: ["buyer-ideas", key],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("scan-buyer-ideas", {
        body: { tickers: extraTickers },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: BuyerIdeaRow[]; universe: string[]; computed_at: string };
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null, refetch: q.refetch };
}