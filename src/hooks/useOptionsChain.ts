import { useEffect, useState } from "react";
import { getOptionsChain } from "@/lib/polygon";

export function useOptionsChain(ticker: string | null, expiration?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirations, setExpirations] = useState<string[]>([]);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null);
    getOptionsChain(ticker, expiration)
      .then(r => {
        setData(r);
        const exps = Array.from(new Set(r.map((x: any) => x.details?.expiration_date).filter(Boolean))).sort();
        setExpirations(exps as string[]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker, expiration]);

  return { data, loading, error, expirations };
}