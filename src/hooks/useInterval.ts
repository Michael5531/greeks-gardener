import { useEffect, useRef } from "react";

export function useInterval(fn: () => void, ms: number, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const cb = useRef(fn);
  useEffect(() => { cb.current = fn; }, [fn]);
  useEffect(() => {
    if (!enabled || !ms) return;
    cb.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") cb.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}