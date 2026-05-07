import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { fmt } from "@/lib/optionUtils";

export default function GEX() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const [exp, setExp] = useState<string | undefined>();
  const { data, expirations, loading } = useOptionsChain(ticker || null);

  // Estimate spot from ATM contracts
  const spot = useMemo(() => {
    const withDelta = data.filter(d => d.greeks?.delta != null && d.underlying_asset?.price);
    if (withDelta.length) return withDelta[0].underlying_asset.price;
    // fallback: median strike of contracts whose |delta| ~0.5
    const atms = data.filter(d => d.greeks && Math.abs(Math.abs(d.greeks.delta) - 0.5) < 0.05);
    if (!atms.length) return null;
    const ks = atms.map(d => d.details.strike_price).sort((a,b)=>a-b);
    return ks[Math.floor(ks.length/2)];
  }, [data]);

  const rows = useMemo(() => {
    if (!spot) return [];
    const filtered = exp ? data.filter(d => d.details?.expiration_date === exp) : data;
    const map = new Map<number, { strike: number; callGex: number; putGex: number }>();
    for (const d of filtered) {
      const g = d.greeks?.gamma; const oi = d.open_interest ?? 0;
      if (g == null || !oi) continue;
      const k = d.details.strike_price;
      const isCall = d.details.contract_type === "call";
      // GEX = OI * gamma * 100 * S^2 * 0.01  ; puts negative
      const gex = oi * g * 100 * spot * spot * 0.01;
      const r = map.get(k) ?? { strike: k, callGex: 0, putGex: 0 };
      if (isCall) r.callGex += gex; else r.putGex -= gex;
      map.set(k, r);
    }
    return Array.from(map.values())
      .filter(r => r.strike > spot * 0.7 && r.strike < spot * 1.3)
      .sort((a,b) => a.strike - b.strike)
      .map(r => ({ ...r, net: r.callGex + r.putGex }));
  }, [data, exp, spot]);

  // zero gamma level: linear interpolation where cumulative net crosses zero
  const zeroGamma = useMemo(() => {
    if (!rows.length) return null;
    let cum = 0; const cums = rows.map(r => (cum += r.net, { strike: r.strike, cum }));
    for (let i = 1; i < cums.length; i++) {
      if (cums[i-1].cum < 0 && cums[i].cum >= 0) {
        const t = -cums[i-1].cum / (cums[i].cum - cums[i-1].cum);
        return cums[i-1].strike + t * (cums[i].strike - cums[i-1].strike);
      }
    }
    return null;
  }, [rows]);

  const totalGEX = rows.reduce((a, r) => a + r.net, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GEX 分析</h1>
          <p className="text-sm text-muted-foreground">Gamma Exposure 按行权价分布 · 识别 Pin 点与 Zero Gamma Level</p>
        </div>
        <div className="flex items-center gap-2">
          {expirations.length > 0 && (
            <Select value={exp} onValueChange={setExp}>
              <SelectTrigger className="w-44 font-mono"><SelectValue placeholder="所有到期" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" onClick={() => setExp(undefined)} className="font-mono">所有到期</SelectItem>
                {expirations.map(e => <SelectItem key={e} value={e} className="font-mono">{e}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Spot" value={spot ? `$${fmt(spot)}` : "—"} />
        <Stat label="Total Net GEX" value={fmt(totalGEX / 1e6, 2) + "M"} positive={totalGEX >= 0} />
        <Stat label="Zero Gamma" value={zeroGamma ? `$${fmt(zeroGamma)}` : "—"} />
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 h-[500px]">
        {loading && <div className="text-xs text-muted-foreground font-mono">加载中…</div>}
        {!ticker && <div className="grid place-items-center h-full text-muted-foreground">请先搜索标的</div>}
        {ticker && rows.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 24 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
              <XAxis dataKey="strike" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => `${(v/1e6).toFixed(1)}M`} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
                formatter={(v: number) => `${(v/1e6).toFixed(2)}M`} />
              {spot && <ReferenceLine x={Math.round(spot)} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Spot", fill: "hsl(var(--primary))", fontSize: 10 }} />}
              {zeroGamma && <ReferenceLine x={Math.round(zeroGamma)} stroke="hsl(var(--accent))" strokeDasharray="3 3" label={{ value: "Zero γ", fill: "hsl(var(--accent))", fontSize: 10 }} />}
              <Bar dataKey="net">
                {rows.map((r, i) => <Cell key={i} fill={r.net >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-mono mt-1 ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}