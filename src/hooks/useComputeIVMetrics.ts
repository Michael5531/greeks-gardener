import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IVMetricsResult {
  ticker: string;
  spot: number | null;
  computed_at: string;
  hv: { hv20: number | null; hv30: number | null; hv60: number | null };
  iv30: number | null;
  ivRank: number | null;
  ivPercentile: number | null;
  ivHvSpread: number | null;
  term: { exp: string; dte: number; iv: number; n: number }[];
  skew: { exp: string | null; rr25: number | null; fly25: number | null };
  historyDays: number;
  source?: string;
}

export function useComputeIVMetrics(ticker: string | null) {
  const q = useQuery({
    queryKey: ["iv-metrics", ticker ?? ""],
    enabled: !!ticker,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-iv-metrics", {
        body: { ticker },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as IVMetricsResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null };
}