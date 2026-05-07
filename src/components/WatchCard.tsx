import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveQuote, computeSessionET } from "@/hooks/useLiveQuote";
import { useStockBars } from "@/hooks/useStockBars";
import { useT } from "@/i18n";

function yearStartISO() { return `${new Date().getFullYear()}-01-01`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function WatchCard({
  ticker, active, onSelect, onRemove,
}: {
  ticker: string; active: boolean; onSelect: () => void; onRemove: () => void;
}) {
  const t = useT();
  const session = computeSessionET();
  const refreshMs = session === "regular" ? 5000 : session === "closed" ? 60000 : 15000;
  const { quote } = useLiveQuote(ticker, refreshMs);
  const { bars } = useStockBars(ticker, yearStartISO(), todayISO(), "day", 1);

  const series = useMemo(() => bars.map(b => ({ t: b.t, c: b.c })), [bars]);
  const start = bars[0]?.o ?? bars[0]?.c ?? null;
  const last = bars[bars.length - 1]?.c ?? null;
  const ytd = start && last ? (last - start) / start : null;
  const ytdUp = (ytd ?? 0) >= 0;

  const price = quote?.price ?? last;
  const chg = quote?.change ?? null;
  const chgPct = quote?.changePct ?? null;
  const up = (chg ?? 0) >= 0;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-lg border bg-card/50 p-4 group hover:border-primary/60 transition-colors cursor-pointer",
        active ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono font-bold text-lg">{ticker}</div>
          <div className="font-mono text-2xl mt-1">{price != null ? `$${price.toFixed(2)}` : "—"}</div>
          {chg != null && (
            <div className={cn("text-xs font-mono flex items-center gap-1 mt-0.5", up ? "text-bull" : "text-bear")}>
              {up ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)} ({((chgPct ?? 0) * 100).toFixed(2)}%)
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <div className="h-12 flex-1 min-w-0">
          {series.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`wc-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area dataKey="c" stroke={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} fill={`url(#wc-${ticker})`} strokeWidth={1.2} dot={false} type="monotone" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t.market.ytd}</div>
          <div className={cn("text-xs font-mono", ytdUp ? "text-bull" : "text-bear")}>
            {ytd != null ? `${ytd >= 0 ? "+" : ""}${(ytd * 100).toFixed(2)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Link to={`/app/chain?ticker=${ticker}`} onClick={onSelect}><Button size="sm" variant="secondary">{t.dashboard.openChain}</Button></Link>
        <Link to={`/app/greeks?ticker=${ticker}`} onClick={onSelect}><Button size="sm" variant="ghost">{t.dashboard.open3D}</Button></Link>
      </div>
    </div>
  );
}