import { useQuery } from "@tanstack/react-query";
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
  const key = `${ticker ?? ""}|${[...expirations].sort().join(",")}`;
  const q = useQuery({
    queryKey: ["iv-surface", key],
    enabled: !!ticker,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-iv-surface", { body: { ticker, expirations } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as IVSurfaceResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null };
}