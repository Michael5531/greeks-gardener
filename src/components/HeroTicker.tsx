import { useMemo } from "react";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import { useLiveQuote, computeSessionET } from "@/hooks/useLiveQuote";
import { useStockBars } from "@/hooks/useStockBars";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function prevWeekdayISO() {
  const d = new Date();
  do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}
function yearStartISO() { return `${new Date().getFullYear()}-01-01`; }

export default function HeroTicker({ ticker }: { ticker: string }) {
  const t = useT();
  const session = computeSessionET();
  const isOpen = session === "regular" || session === "after";
  const isExt = session === "pre" || session === "after";
  // Unified 15s polling for stability across sessions.
  const refreshMs = session === "closed" ? 30_000 : 15_000;
  const { quote } = useLiveQuote(ticker, refreshMs);

  const intradayDate = isOpen ? todayISO() : prevWeekdayISO();
  const { bars: intraday } = useStockBars(ticker || null, intradayDate, intradayDate, "minute", 5);
  const { bars: ytd } = useStockBars(ticker || null, yearStartISO(), todayISO(), "day", 1);

  const intraSeries = useMemo(() => intraday.map(b => ({ t: b.t, c: b.c })), [intraday]);
  const ytdSeries = useMemo(() => ytd.map(b => ({ t: b.t, c: b.c })), [ytd]);

  const intraStart = intraday[0]?.o ?? intraday[0]?.c ?? null;
  const intraLast = intraday[intraday.length - 1]?.c ?? null;
  const intraChg = intraStart && intraLast ? (intraLast - intraStart) / intraStart : null;
  const intraUp = (intraChg ?? 0) >= 0;

  const ytdStart = ytd[0]?.o ?? ytd[0]?.c ?? null;
  const ytdLast = ytd[ytd.length - 1]?.c ?? null;
  const ytdChg = ytdStart && ytdLast ? (ytdLast - ytdStart) / ytdStart : null;
  const ytdUp = (ytdChg ?? 0) >= 0;

  const liveUp = (quote?.change ?? 0) >= 0;

  const sessionLabel = { pre: t.market.pre, regular: t.market.regular, after: t.market.after, closed: t.market.closed }[session];
  const sessionTone = {
    pre: "bg-accent/15 text-accent border-accent/30",
    regular: "bg-bull/15 text-bull border-bull/30",
    after: "bg-primary/15 text-primary border-primary/30",
    closed: "bg-muted text-muted-foreground border-border",
  }[session];

  const fallbackPrice = intraLast ?? null;
  const displayPrice = quote?.price ?? fallbackPrice;

  return (
    <div className="grid md:grid-cols-[auto_1fr_auto] gap-8 items-center">
      <div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">{ticker}</div>
          <span className={cn("inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.2em]", sessionTone.replace(/bg-[^\s]+/g, "").replace(/border-[^\s]+/g, ""))}>
            <span className={cn("h-1 w-1 rounded-full bg-current", session === "regular" && "animate-pulse")} />
            {sessionLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-3 mt-1">
          <div className="font-serif-display text-5xl md:text-6xl tabular-nums leading-none">
            {displayPrice != null ? `$${displayPrice.toFixed(2)}` : "—"}
          </div>
          {isExt && displayPrice != null && (
            <span
              title={t.market.extTip}
              className="text-primary text-[9px] font-mono uppercase tracking-[0.2em]"
            >
              {t.market.ext}
            </span>
          )}
          {quote?.change != null && (
            <div className={cn("text-xs font-mono flex items-center gap-1 tabular-nums", liveUp ? "text-bull" : "text-bear")}>
              {liveUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({((quote.changePct ?? 0) * 100).toFixed(2)}%)
            </div>
          )}
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground font-mono uppercase tracking-[0.25em]">
          {isOpen ? t.market.since : `${t.market.prevDay} · ${intradayDate}`}
        </div>
      </div>

      <div className="h-16 min-w-0">
        {intraSeries.length > 1 && (
          <ChartSizer>
            {({ width, height }) => (
            <AreaChart width={width} height={height} data={intraSeries} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="intraGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`hsl(var(--${intraUp ? "bull" : "bear"}))`} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={`hsl(var(--${intraUp ? "bull" : "bear"}))`} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }}
                formatter={(v: any) => `$${(+v).toFixed(2)}`}
                labelFormatter={(_l, p) => p?.[0]?.payload?.t ? new Date(p[0].payload.t).toLocaleTimeString() : ""}
              />
              <Area dataKey="c" stroke={`hsl(var(--${intraUp ? "bull" : "bear"}))`} fill="url(#intraGrad)" strokeWidth={1.5} dot={false} type="monotone" isAnimationActive={false} />
            </AreaChart>
            )}
          </ChartSizer>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">{t.market.ytd}</div>
          <div className={cn("font-serif-display text-2xl tabular-nums mt-1", ytdUp ? "text-bull" : "text-bear")}>
            {ytdChg != null ? `${ytdChg >= 0 ? "+" : ""}${(ytdChg * 100).toFixed(2)}%` : "—"}
          </div>
        </div>
        <div className="h-12 w-28">
          {ytdSeries.length > 1 && (
            <ChartSizer>
              {({ width, height }) => (
              <AreaChart width={width} height={height} data={ytdSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ytdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area dataKey="c" stroke={`hsl(var(--${ytdUp ? "bull" : "bear"}))`} fill="url(#ytdGrad)" strokeWidth={1.2} dot={false} type="monotone" isAnimationActive={false} />
              </AreaChart>
              )}
            </ChartSizer>
          )}
        </div>
      </div>
    </div>
  );
}