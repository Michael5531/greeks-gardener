import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { computeSessionET, useLiveQuote, type MarketSession } from "@/hooks/useLiveQuote";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

const sessionLabel: Record<MarketSession, string> = {
  pre: "盘前",
  regular: "盘中",
  after: "盘后",
  closed: "休市",
};

const sessionTone: Record<MarketSession, string> = {
  pre: "bg-accent/15 text-accent border-accent/30",
  regular: "bg-bull/15 text-bull border-bull/30",
  after: "bg-primary/15 text-primary border-primary/30",
  closed: "bg-muted text-muted-foreground border-border",
};

function useETClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function MarketStatusBar() {
  const [params] = useSearchParams();
  const ticker = params.get("ticker");
  const now = useETClock();
  const session = useMemo(() => computeSessionET(now), [now]);
  const { quote } = useLiveQuote(ticker, session === "regular" ? 3000 : session === "closed" ? 30000 : 8000);

  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  useEffect(() => {
    if (quote?.price == null) return;
    if (lastPrice != null && quote.price !== lastPrice) {
      setFlash(quote.price > lastPrice ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(t);
    }
    setLastPrice(quote.price);
  }, [quote?.price, lastPrice]);

  const etTime = useMemo(() => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now), [now]);

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex items-center gap-4 px-4 h-10 text-xs font-mono">
        <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded border", sessionTone[session])}>
          <span className={cn("h-1.5 w-1.5 rounded-full", session === "regular" ? "bg-bull animate-pulse" : "bg-current opacity-70")} />
          {sessionLabel[session]}
        </div>
        <div className="text-muted-foreground">ET {etTime}</div>
        {ticker && (
          <div className="flex items-center gap-3 ml-auto">
            <div className="text-muted-foreground">{ticker}</div>
            <div
              className={cn(
                "tabular-nums transition-colors",
                flash === "up" && "text-bull",
                flash === "down" && "text-bear",
              )}
            >
              {quote?.price != null ? `$${quote.price.toFixed(2)}` : "—"}
            </div>
            {quote?.change != null && (
              <div className={cn("tabular-nums", quote.change >= 0 ? "text-bull" : "text-bear")}>
                {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct != null ? (quote.changePct * 100).toFixed(2) : "0.00"}%)
              </div>
            )}
            <Activity className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        {!ticker && <div className="ml-auto text-muted-foreground">未选择标的</div>}
      </div>
    </div>
  );
}