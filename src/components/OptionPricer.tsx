import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import TickerSearch from "./TickerSearch";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { bsPrice, bsGreeks, OptType } from "@/lib/blackScholes";
import { fmt } from "@/lib/optionUtils";

export interface OptionPricerProps {
  /** Auto-sync external ticker (e.g. from page selector). */
  externalTicker?: string | null;
  /** Optional strike list for dropdown selection */
  strikeOptions?: number[];
  /** Optional expiration date list (YYYY-MM-DD) for DTE dropdown */
  expirationOptions?: string[];
}

export default function OptionPricer({ externalTicker, strikeOptions, expirationOptions }: OptionPricerProps = {}) {
  const [ticker, setTicker] = useState<string>(externalTicker ?? "");
  useEffect(() => { if (externalTicker) setTicker(externalTicker); }, [externalTicker]);
  const { quote } = useLiveQuote(ticker || null, 5000);
  const livePrice = quote?.price ?? null;

  const [manualSpot, setManualSpot] = useState<string>("");
  const spot = manualSpot ? +manualSpot : (livePrice ?? 100);

  const [type, setType] = useState<OptType>("call");
  const [dte, setDte] = useState(30);
  const [strike, setStrike] = useState<string>("");
  const [iv, setIv] = useState(30);
  const [r, setR] = useState(4.5);

  // Auto-pick first strike near spot when strike options provided
  useEffect(() => {
    if (!strikeOptions?.length) return;
    const target = livePrice ?? +manualSpot || strikeOptions[0];
    let best = strikeOptions[0], bd = Infinity;
    for (const s of strikeOptions) { const d = Math.abs(s - target); if (d < bd) { bd = d; best = s; } }
    setStrike(String(best));
  }, [strikeOptions, livePrice]);

  // Auto-pick nearest expiration ~30d
  useEffect(() => {
    if (!expirationOptions?.length) return;
    const now = Date.now();
    let best = expirationOptions[0], bd = Infinity;
    for (const e of expirationOptions) {
      const d = Math.abs((new Date(e).getTime() - now) / 86400000 - 30);
      if (d < bd) { bd = d; best = e; }
    }
    const days = Math.max(1, Math.round((new Date(best).getTime() - now) / 86400000));
    setDte(days);
  }, [expirationOptions]);

  const [pctMove, setPctMove] = useState(0); // -20..+20
  const [ivMove, setIvMove] = useState(0);   // -30..+30
  const [daysPassed, setDaysPassed] = useState(0);

  const K = strike ? +strike : Math.round(spot);
  const T = Math.max(dte / 365, 1 / 365);
  const sigma = iv / 100;
  const rate = r / 100;

  const current = useMemo(() => bsPrice(spot, K, T, rate, sigma, type), [spot, K, T, rate, sigma, type]);
  const greeks = useMemo(() => bsGreeks(spot, K, T, rate, sigma, type), [spot, K, T, rate, sigma, type]);

  const newSpot = spot * (1 + pctMove / 100);
  const newSigma = Math.max(0.01, sigma + ivMove / 100);
  const newT = Math.max((dte - daysPassed) / 365, 1 / 365);
  const projected = bsPrice(newSpot, K, newT, rate, newSigma, type);
  const dPrice = projected - current;
  const pnl = dPrice * 100;

  const curve = useMemo(() => {
    const lo = spot * 0.8, hi = spot * 1.2;
    const out: any[] = [];
    for (let i = 0; i < 81; i++) {
      const p = lo + (hi - lo) * (i / 80);
      const proj = bsPrice(p, K, newT, rate, newSigma, type);
      out.push({ price: +p.toFixed(2), pnl: +((proj - current) * 100).toFixed(2) });
    }
    return out;
  }, [spot, K, newT, rate, newSigma, type, current]);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">期权价值计算器</h3>
          <p className="text-[11px] text-muted-foreground">基于 Black–Scholes，单合约 = 100 股</p>
        </div>
        <div className="w-64"><TickerSearch onSelect={t => setTicker(t.ticker)} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Field label={`Spot ${ticker ? `(${ticker})` : ""}`}>
          <Input className="h-8 font-mono text-xs" placeholder={livePrice ? livePrice.toFixed(2) : "—"} value={manualSpot} onChange={e => setManualSpot(e.target.value)} />
        </Field>
        <Field label="类型">
          <Select value={type} onValueChange={v => setType(v as OptType)}>
            <SelectTrigger className="h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="put">Put</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Strike">
          {strikeOptions?.length ? (
            <Select value={strike} onValueChange={setStrike}>
              <SelectTrigger className="h-8 font-mono text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {strikeOptions.map(s => <SelectItem key={s} value={String(s)} className="font-mono text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input className="h-8 font-mono text-xs" placeholder={String(Math.round(spot))} value={strike} onChange={e => setStrike(e.target.value)} />
          )}
        </Field>
        <Field label="到期 / DTE">
          {expirationOptions?.length ? (
            <Select
              value={String(dte)}
              onValueChange={(v) => setDte(+v)}
            >
              <SelectTrigger className="h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {expirationOptions.map(e => {
                  const days = Math.max(1, Math.round((new Date(e).getTime() - Date.now()) / 86400000));
                  return <SelectItem key={e} value={String(days)} className="font-mono text-xs">{e} ({days}d)</SelectItem>;
                })}
              </SelectContent>
            </Select>
          ) : (
            <Input type="number" className="h-8 font-mono text-xs" value={dte} onChange={e => setDte(+e.target.value)} />
          )}
        </Field>
        <Field label="IV %"><Input type="number" step="1" className="h-8 font-mono text-xs" value={iv} onChange={e => setIv(+e.target.value)} /></Field>
        <Field label="Rate %"><Input type="number" step="0.1" className="h-8 font-mono text-xs" value={r} onChange={e => setR(+e.target.value)} /></Field>
        <Stat label="当前理论价" value={`$${fmt(current)}`} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <SliderField label={`标的变动: ${pctMove > 0 ? "+" : ""}${pctMove}%`} value={pctMove} min={-20} max={20} step={0.5} onChange={setPctMove} />
        <SliderField label={`IV 变动: ${ivMove > 0 ? "+" : ""}${ivMove}%`} value={ivMove} min={-30} max={30} step={1} onChange={setIvMove} />
        <SliderField label={`时间流逝: ${daysPassed} 天`} value={daysPassed} min={0} max={Math.max(dte - 1, 1)} step={1} onChange={setDaysPassed} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="预测价" value={`$${fmt(projected)}`} />
        <Stat label="价格变动" value={`${dPrice >= 0 ? "+" : ""}$${fmt(dPrice)}`} positive={dPrice >= 0} />
        <Stat label="PnL / 张" value={`${pnl >= 0 ? "+" : ""}$${fmt(pnl)}`} positive={pnl >= 0} />
        <Stat label="Δ" value={fmt(greeks.delta, 3)} />
        <Stat label="Γ" value={fmt(greeks.gamma, 4)} />
        <Stat label="Θ /day" value={`$${fmt(greeks.theta * 100)}`} />
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="hsl(var(--grid-line))" />
            <XAxis dataKey="price" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any) => `$${v}`} labelFormatter={(l: any) => `Spot $${l}`} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine x={+spot.toFixed(2)} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "now", fill: "hsl(var(--primary))", fontSize: 10 }} />
            <Line type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-[10px] text-muted-foreground font-mono">{label}</Label>{children}</div>;
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