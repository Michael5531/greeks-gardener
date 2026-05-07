import { useEffect, useRef, useState } from "react";
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
  const [data, setData] = useState<GEXResult | null>(null);
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
    supabase.functions.invoke("compute-gex", {
      body: { ticker, expirations },
    }).then(({ data: d, error: e }) => {
      if (cancel) return;
      if (e || (d as any)?.error) { setError(e?.message ?? (d as any).error); setData(null); }
      else setData(d as GEXResult);
    }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [key]);

  return { data, loading, error };
}