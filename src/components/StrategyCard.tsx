import { useEffect, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getStrategy } from "@/lib/strategies";
import { useComputePayoff } from "@/hooks/useComputePayoff";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtPct } from "@/lib/optionUtils";

export default function StrategyCard({
  strategyId, ticker, dte, iv,
}: { strategyId: string; ticker: string; dte: number; iv: number }) {
  const def = getStrategy(strategyId);
  const { quote } = useLiveQuote(ticker || null, 8000);
  const spot = quote?.price ?? 100;

  const { data: po } = useComputePayoff(strategyId, spot, iv, dte);
  const legs = po?.legs ?? [];
  const grid = po?.grid ?? [];
  const breakevens = po?.breakevens ?? [];
  const maxProfit = po?.maxProfit ?? 0;
  const maxLoss = po?.maxLoss ?? 0;
  const netDebit = po?.netDebit ?? 0;

  const [hist, setHist] = useState<{ winRate: number | null; avgRet: number | null; n: number }>({ winRate: null, avgRet: null, n: 0 });
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("backtests")
        .select("metrics, params")
        .eq("ticker", ticker.toUpperCase())
        .order("created_at", { ascending: false })
        .limit(50);
      const matched = (data ?? []).filter((b: any) => b.params?.strategy_type === strategyId);
      if (!matched.length) { setHist({ winRate: null, avgRet: null, n: 0 }); return; }
      const wr = matched.reduce((s: number, b: any) => s + (b.metrics?.win_rate ?? 0), 0) / matched.length;
      const ar = matched.reduce((s: number, b: any) => s + (b.metrics?.total_return ?? 0), 0) / matched.length;
      setHist({ winRate: wr, avgRet: ar, n: matched.length });
    })();
  }, [strategyId, ticker]);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-base font-semibold">{def.name}
            {!def.engineSupported && <span className="ml-2 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">仅 Payoff（暂不支持引擎回测）</span>}
          </div>
          <div className="text-xs text-muted-foreground">{def.description}</div>
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          {ticker || "—"} · spot ${fmt(spot)} · IV {fmt(iv * 100)}% · DTE {dte}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Stat label="Max Loss" value={`$${fmt(maxLoss)}`} positive={false} />
        <Stat label="Max Profit" value={maxProfit > 1e6 ? "∞" : `$${fmt(maxProfit)}`} positive={true} />
        <Stat label={netDebit >= 0 ? "Net Debit" : "Net Credit"} value={`$${fmt(Math.abs(netDebit) * 100)}`} />
        <Stat label="Breakeven" value={breakevens.length ? breakevens.map(b => `$${fmt(b)}`).join(" / ") : "—"} mono />
        <Stat label="Win Rate（历史）" value={hist.winRate != null ? fmtPct(hist.winRate) : "—"} />
        <Stat label={`Win Fill (n=${hist.n})`} value={hist.avgRet != null ? fmtPct(hist.avgRet) : "—"} positive={hist.avgRet != null && hist.avgRet > 0} />
      </div>

      <div className="text-[11px] text-muted-foreground font-mono space-x-3">
        <span>规则：MaxLoss={def.maxLossText}</span>
        <span>· MaxProfit={def.maxProfitText}</span>
        <span>· BE={def.breakevenText}</span>
      </div>

      <div className="text-[11px] font-mono">
        <span className="text-muted-foreground">Legs：</span>
        {legs.map((l, i) => (
          <span key={i} className={`mr-3 ${l.side === "long" ? "text-bull" : "text-bear"}`}>
            {l.side === "long" ? "+" : "-"}{l.qty} {l.type.toUpperCase()} @ {l.strike} (${fmt(l.entryPrice)})
          </span>
        ))}
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={grid} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="hsl(var(--grid-line))" />
            <XAxis dataKey="price" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any, n: any) => [`$${v}`, n === "expiry" ? "到期 PnL" : "今日 PnL"]} labelFormatter={(l: any) => `Spot $${l}`} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine x={+spot.toFixed(2)} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "spot", fill: "hsl(var(--primary))", fontSize: 10 }} />
            {breakevens.map((b, i) => (
              <ReferenceLine key={i} x={b} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: "BE", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            ))}
            <Line type="monotone" dataKey="expiry" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="到期 PnL" />
            <Line type="monotone" dataKey="today" stroke="hsl(var(--accent))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="今日 PnL" />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, positive, mono }: { label: string; value: string; positive?: boolean; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono ${mono ? "text-xs" : "text-sm"} ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}