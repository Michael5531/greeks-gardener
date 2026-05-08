import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis, Legend, ComposedChart, Area } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import TickerSearch from "./TickerSearch";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import OptionLegsBuilder, { dteFor, type UILeg } from "@/components/OptionLegsBuilder";
import { useComputePricerMultileg } from "@/hooks/useComputePricerMultileg";
import { fmt } from "@/lib/optionUtils";

export interface OptionPricerProps {
  externalTicker?: string | null;
}

export default function OptionPricer({ externalTicker }: OptionPricerProps = {}) {
  const [ticker, setTicker] = useState<string>(externalTicker ?? "");
  useEffect(() => { if (externalTicker) setTicker(externalTicker); }, [externalTicker]);
  const { quote } = useLiveQuote(ticker || null, 5000);
  const spot = quote?.price ?? null;

  const { data: chain, expirations } = useOptionsChain(ticker || null);
  const [legs, setLegs] = useState<UILeg[]>([]);
  // reset legs when ticker changes
  useEffect(() => { setLegs([]); }, [ticker]);

  const [pctMove, setPctMove] = useState(0);
  const [ivMove, setIvMove] = useState(0);
  const [daysPassed, setDaysPassed] = useState(0);

  const minDte = legs.length ? Math.min(...legs.map(l => dteFor(l.expiration))) : 30;

  const input = useMemo(() => {
    if (!spot || !legs.length) return null;
    return {
      ticker: ticker || "",
      spot,
      legs: legs.map(l => ({
        type: l.type, side: l.side, strike: l.strike,
        dte: dteFor(l.expiration), iv: l.iv, qty: l.qty, expiration: l.expiration,
      })),
      pctMove, ivMove, daysPassed,
      withUnderlying: true,
    };
  }, [ticker, spot, legs, pctMove, ivMove, daysPassed]);

  const { data: pr, loading } = useComputePricerMultileg(input);
  const curve = pr?.curve ?? [];
  const underlying = pr?.underlying ?? [];
  const greeks = pr?.greeks ?? { delta: 0, gamma: 0, theta: 0, vega: 0 };

  // Merge underlying close into a separate chart series scaled to right axis.
  const undMin = underlying.length ? Math.min(...underlying.map(u => u.c)) : 0;
  const undMax = underlying.length ? Math.max(...underlying.map(u => u.c)) : 0;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">期权价值计算器 · 多腿</h3>
          <p className="text-[11px] text-muted-foreground">从期权链选择 buy/sell legs · 单合约 = 100 股</p>
        </div>
        <div className="flex items-center gap-3">
          {spot != null && <span className="font-mono text-xs text-muted-foreground">Spot ${spot.toFixed(2)}</span>}
          <div className="w-64"><TickerSearch onSelect={t => setTicker(t.ticker)} /></div>
        </div>
      </div>

      <OptionLegsBuilder ticker={ticker} spot={spot} chain={chain} expirations={expirations} legs={legs} onChange={setLegs} />

      <div className="grid md:grid-cols-3 gap-4">
        <SliderField label={`标的变动: ${pctMove > 0 ? "+" : ""}${pctMove}%`} value={pctMove} min={-20} max={20} step={0.5} onChange={setPctMove} />
        <SliderField label={`IV 变动: ${ivMove > 0 ? "+" : ""}${ivMove}%`} value={ivMove} min={-30} max={30} step={1} onChange={setIvMove} />
        <SliderField label={`时间流逝: ${daysPassed} 天`} value={daysPassed} min={0} max={Math.max(minDte - 1, 1)} step={1} onChange={setDaysPassed} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="组合现值" value={`$${fmt(pr?.currentValue ?? 0)}`} />
        <Stat label="预测值" value={`$${fmt(pr?.projectedValue ?? 0)}`} />
        <Stat label="ΔPnL" value={`${(pr?.dPrice ?? 0) >= 0 ? "+" : ""}$${fmt(pr?.dPrice ?? 0)}`} positive={(pr?.dPrice ?? 0) >= 0} />
        <Stat label="净 Δ" value={fmt(greeks.delta, 3)} />
        <Stat label="净 Γ" value={fmt(greeks.gamma, 4)} />
        <Stat label="净 Θ /day" value={`$${fmt(greeks.theta * 100)}`} />
      </div>

      <div className="h-80">
        <ChartSizer>
          {({ width, height }) => (
            <ComposedChart width={width} height={height} data={curve} margin={{ top: 8, right: 50, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" />
              <XAxis dataKey="price" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="pnl" tickFormatter={v => `$${v}`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any, n: any) => [`$${v}`, n === "expiry" ? "到期 PnL" : "今日 PnL"]} labelFormatter={(l: any) => `Spot $${l}`} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <ReferenceLine yAxisId="pnl" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              {spot != null && (
                <ReferenceLine yAxisId="pnl" x={+spot.toFixed(2)} stroke="hsl(var(--primary))" strokeDasharray="3 3"
                  label={{ value: `Spot $${spot.toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 10, position: "top" }} />
              )}
              {(pr?.breakevens ?? []).map((b, i) => (
                <ReferenceLine yAxisId="pnl" key={i} x={b} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: `BE $${b}`, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              ))}
              <Line yAxisId="pnl" type="monotone" dataKey="expiry" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="到期 PnL" />
              <Line yAxisId="pnl" type="monotone" dataKey="today" stroke="hsl(var(--accent))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="今日 PnL" />
            </ComposedChart>
          )}
        </ChartSizer>
      </div>

      {underlying.length > 0 && (
        <div className="h-44">
          <div className="text-[11px] text-muted-foreground mb-1">{ticker} 标的近 30 个交易日走势</div>
          <ChartSizer>
            {({ width, height }) => (
              <LineChart width={width} height={height} data={underlying} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--grid-line))" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                <YAxis domain={[undMin * 0.99, undMax * 1.01]} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any) => `$${v}`} />
                {spot != null && <ReferenceLine y={spot} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: `Spot $${spot.toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 10 }} />}
                <Line type="monotone" dataKey="c" stroke="hsl(var(--bull))" strokeWidth={1.5} dot={false} />
              </LineChart>
            )}
          </ChartSizer>
        </div>
      )}

      {loading && <div className="text-[11px] text-muted-foreground">计算中…</div>}
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange }: any) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground font-mono">{label}</Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} className="mt-2" />
    </div>
  );
}
function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}
