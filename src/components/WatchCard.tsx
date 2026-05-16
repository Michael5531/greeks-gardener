import { useMemo } from "react";
import { Area, AreaChart, YAxis } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
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
  const isExt = session === "pre" || session === "after";
  // Unified 15s polling; closed market slows to 60s.
  const refreshMs = session === "closed" ? 60_000 : 15_000;
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
        "relative border-r border-b border-border p-5 group transition-colors cursor-pointer bg-transparent hover:bg-secondary/40",
        active && "bg-secondary/60",
      )}
    >
      {active && (
        <span className="absolute top-0 left-0 h-0.5 w-12 bg-primary" aria-hidden />
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{ticker}</div>
          <div className="font-serif-display text-[34px] leading-none mt-2 tabular-nums">
            {price != null ? `$${price.toFixed(2)}` : "—"}
          </div>
          {isExt && price != null && (
            <span
              title={t.market.extTip}
              className="inline-block mt-2 text-primary text-[9px] font-mono uppercase tracking-[0.2em]"
            >
              {t.market.ext}
            </span>
          )}
          {chg != null && (
            <div className={cn("text-[11px] font-mono flex items-center gap-1 mt-1.5", up ? "text-bull" : "text-bear")}>
              {up ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)} ({((chgPct ?? 0) * 100).toFixed(2)}%)
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div className="h-14 flex-1 min-w-0">
          {series.length > 1 && (
            <ChartSizer>
              {({ width, height }) => (
              <AreaChart width={width} height={height} data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`wc-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area dataKey="c" stroke={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} fill={`url(#wc-${ticker})`} strokeWidth={1.2} dot={false} type="monotone" isAnimationActive={false} />
              </AreaChart>
              )}
            </ChartSizer>
          )}
        </div>
        <div className="text-right">
          <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{t.market.ytd}</div>
          <div className={cn("text-sm font-mono tabular-nums mt-0.5", ytdUp ? "text-bull" : "text-bear")}>
            {ytd != null ? `${ytd >= 0 ? "+" : ""}${(ytd * 100).toFixed(2)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-5 pt-3 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
        <Link
          to={`/app/chain?ticker=${ticker}`}
          onClick={onSelect}
          className="font-serif-display italic text-sm text-foreground hover:text-primary transition-colors"
        >
          {t.dashboard.openChain} →
        </Link>
        <Link
          to={`/app/greeks?ticker=${ticker}`}
          onClick={onSelect}
          className="font-serif-display italic text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {t.dashboard.open3D} →
        </Link>
      </div>
    </div>
  );
}