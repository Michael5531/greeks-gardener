import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GEXResult {
  rows: any[];
  expRows: any[];
  total: number;
  flip: number | null;
  spot: number | null;
  contractCount: number;
  totalOI: number;
  mini: { strike: number; gex: number }[];
  computed_at?: string;
  source?: string;
}

export function useComputeGEX(ticker: string | null, expirations: string[]) {
  const key = `${ticker ?? ""}|${[...expirations].sort().join(",")}`;
  const q = useQuery({
    queryKey: ["gex", key],
    enabled: !!ticker,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-gex", { body: { ticker, expirations } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as GEXResult;
    },
  });
  return { data: q.data ?? null, loading: q.isLoading, error: q.error ? (q.error as Error).message : null };
}