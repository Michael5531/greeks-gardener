import { useEffect, useState } from "react";
import { getOptionsChain, getOptionsExpirations } from "@/lib/polygon";

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
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker, expiration]);

  // Fetch the FULL list of expirations independently of the snapshot chain,
  // which is capped by the snapshot endpoint's limit.
  useEffect(() => {
    if (!ticker) { setExpirations([]); return; }
    getOptionsExpirations(ticker).then(setExpirations).catch(() => {});
  }, [ticker]);

  return { data, loading, error, expirations };
}