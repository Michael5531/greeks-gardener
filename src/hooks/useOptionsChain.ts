import { useEffect, useState } from "react";
import { getOptionsChain, getOptionsExpirations } from "@/lib/polygon";

export function useOptionsChain(ticker: string | null, expiration?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirations, setExpirations] = useState<string[]>([]);

  useEffect(() => {
    if (!ticker) { setData([]); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    getOptionsChain(ticker, expiration)
      .then(r => {
        if (cancelled) return;
        setData(r);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker, expiration]);

  // Fetch the FULL list of expirations independently of the snapshot chain,
  // which is capped by the snapshot endpoint's limit.
  useEffect(() => {
    if (!ticker) { setExpirations([]); return; }
    getOptionsExpirations(ticker).then(setExpirations).catch(() => {});
  }, [ticker]);

  return { data, loading, error, expirations };
}