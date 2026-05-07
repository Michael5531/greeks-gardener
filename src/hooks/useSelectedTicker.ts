import { useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";

const KEY = "optix.ticker";

/** Reads ticker from URL `?ticker=`, falling back to localStorage. Persists URL ticker to storage. */
export function useSelectedTicker(): [string, (t: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();
  const urlTicker = params.get("ticker") ?? "";
  const stored = typeof window !== "undefined" ? localStorage.getItem(KEY) ?? "" : "";
  const ticker = urlTicker || stored;

  useEffect(() => {
    if (urlTicker) localStorage.setItem(KEY, urlTicker);
    else if (stored && !params.get("ticker")) {
      // hydrate URL once if missing (without pushing history entry)
      const sp = new URLSearchParams(params);
      sp.set("ticker", stored);
      nav({ pathname: loc.pathname, search: `?${sp.toString()}` }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTicker]);

  const set = (t: string | null) => {
    if (!t) {
      const sp = new URLSearchParams(params); sp.delete("ticker"); setParams(sp, { replace: true });
      localStorage.removeItem(KEY);
    } else {
      const sp = new URLSearchParams(params); sp.set("ticker", t); setParams(sp, { replace: true });
      localStorage.setItem(KEY, t);
    }
  };

  return [ticker, set];
}