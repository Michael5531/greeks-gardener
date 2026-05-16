import { useEffect, useMemo, useState } from "react";
import { computeSessionET, useLiveQuote, type MarketSession } from "@/hooks/useLiveQuote";
import { cn } from "@/lib/utils";
import { Activity, RefreshCw } from "lucide-react";
import { useT } from "@/i18n";
import LanguageSwitcher from "./LanguageSwitcher";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";

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

/** Returns minutes-of-day in ET for the given Date. */
function etMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const hh = +(parts.find(p => p.type === "hour")?.value ?? 0);
  const mm = +(parts.find(p => p.type === "minute")?.value ?? 0);
  const ss = +(parts.find(p => p.type === "second")?.value ?? 0);
  const wd = parts.find(p => p.type === "weekday")?.value ?? "";
  return { mins: hh * 60 + mm + ss / 60, wd };
}

function nextMilestone(now: Date, t: { untilPre: string; untilOpen: string; untilClose: string }) {
  const { mins, wd } = etMinutes(now);
  const PRE = 4 * 60, OPEN = 9 * 60 + 30, CLOSE = 16 * 60;
  const isWeekend = wd === "Sat" || wd === "Sun";
  let target: number;
  let label: string;
  if (!isWeekend && mins < PRE) { target = PRE; label = t.untilPre; }
  else if (!isWeekend && mins < OPEN) { target = OPEN; label = t.untilOpen; }
  else if (!isWeekend && mins < CLOSE) { target = CLOSE; label = t.untilClose; }
  else {
    // next weekday open
    const daysToAdd = (() => {
      if (wd === "Fri") return 3;
      if (wd === "Sat") return 2;
      if (wd === "Sun") return 1;
      return 1;
    })();
    target = OPEN + daysToAdd * 24 * 60;
    label = t.untilOpen;
  }
  const diff = Math.max(0, target - mins);
  const h = Math.floor(diff / 60);
  const m = Math.floor(diff % 60);
  const s = Math.floor((diff * 60) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { label, text: `${pad(h)}:${pad(m)}:${pad(s)}` };
}

export default function MarketStatusBar() {
  const t = useT();
  const [ticker] = useSelectedTicker();
  const now = useETClock();
  const session = useMemo(() => computeSessionET(now), [now]);
  // Unified 15s polling across all sessions; closed market polls a bit slower.
  const { quote, refresh } = useLiveQuote(ticker || null, session === "closed" ? 30_000 : 15_000);
  const sessionLabel: Record<MarketSession, string> = { pre: t.market.pre, regular: t.market.regular, after: t.market.after, closed: t.market.closed };

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
  const localTime = useMemo(() => new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now), [now]);
  const countdown = useMemo(() => nextMilestone(now, t.market), [now, t.market]);

  const [spin, setSpin] = useState(false);
  function handleRefresh() {
    setSpin(true);
    refresh?.();
    window.dispatchEvent(new CustomEvent("optix:refresh"));
    setTimeout(() => setSpin(false), 600);
  }

  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
      <div className="px-6">
        <div className="flex items-center gap-4 h-11 text-[11px] font-mono overflow-x-auto">
          <button
            onClick={handleRefresh}
            title={t.market.refresh}
            className="inline-flex items-center justify-center h-6 w-6 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RefreshCw className={cn("h-3 w-3", spin && "animate-spin")} />
          </button>

          <div className={cn(
            "inline-flex items-center gap-1.5 shrink-0 uppercase tracking-[0.18em] text-[10px]",
            session === "regular" ? "text-bull" : session === "closed" ? "text-muted-foreground" : "text-primary",
          )}>
            <span className={cn("h-1 w-1 rounded-full bg-current", session === "regular" && "animate-pulse")} />
            {sessionLabel[session]}
          </div>

          <div className="text-muted-foreground shrink-0 flex items-baseline gap-1.5">
            <span className="font-serif-display italic text-xs opacity-80">{countdown.label}</span>
            <span className="tabular-nums text-foreground">{countdown.text}</span>
          </div>

          <div className="h-3 w-px bg-border shrink-0" />

          {ticker ? (
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-foreground font-semibold tracking-wider">{ticker}</div>
              <div
                className={cn(
                  "tabular-nums transition-colors",
                  flash === "up" && "text-bull",
                  flash === "down" && "text-bear",
                )}
              >
                {quote?.price != null ? `$${quote.price.toFixed(2)}` : "—"}
              </div>
              {(session === "pre" || session === "after") && quote?.price != null && (
                <span
                  title={t.market.extTip}
                  className="text-primary text-[9px] uppercase tracking-[0.2em]"
                >
                  {t.market.ext}
                </span>
              )}
              {quote?.change != null && (
                <div className={cn("tabular-nums text-[10px]", quote.change >= 0 ? "text-bull" : "text-bear")}>
                  {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct != null ? (quote.changePct * 100).toFixed(2) : "0.00"}%)
                </div>
              )}
              <Activity className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          ) : (
            <div className="text-muted-foreground shrink-0 font-serif-display italic text-xs">{t.market.noTicker}</div>
          )}

          <div className="ml-auto flex items-center gap-4 shrink-0">
            <div className="text-muted-foreground uppercase tracking-[0.2em] text-[10px]">ET <span className="text-foreground tabular-nums ml-1">{etTime}</span></div>
            <div className="text-muted-foreground uppercase tracking-[0.2em] text-[10px] hidden sm:block">LOCAL <span className="text-foreground tabular-nums ml-1">{localTime}</span></div>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}