import { useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { fmt } from "@/lib/optionUtils";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function GEX() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const [exp, setExp] = useState<string | undefined>();
  const { data, expirations, loading } = useOptionsChain(ticker || null, exp);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Quick expiration presets: closest available to today + N days
  const pickClosestExp = (days: number): string | undefined => {
    if (!expirations.length) return undefined;
    const target = new Date();
    target.setDate(target.getDate() + days);
    const t = target.getTime();
    let best = expirations[0];
    let bestDiff = Math.abs(new Date(best).getTime() - t);
    for (const e of expirations) {
      const d = Math.abs(new Date(e).getTime() - t);
      if (d < bestDiff) { bestDiff = d; best = e; }
    }
    return best;
  };

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
    const map = new Map<number, { strike: number; callGex: number; putGex: number; callOI: number; putOI: number }>();
    for (const d of filtered) {
      const g = d.greeks?.gamma; const oi = d.open_interest ?? 0;
      if (g == null || !oi) continue;
      const k = d.details.strike_price;
      const isCall = d.details.contract_type === "call";
      // GEX = OI * gamma * 100 * S^2 * 0.01  ; puts negative
      const gex = oi * g * 100 * spot * spot * 0.01;
      const r = map.get(k) ?? { strike: k, callGex: 0, putGex: 0, callOI: 0, putOI: 0 };
      if (isCall) { r.callGex += gex; r.callOI += oi; }
      else { r.putGex -= gex; r.putOI += oi; }
      map.set(k, r);
    }
    return Array.from(map.values())
      .filter(r => r.strike > spot * 0.7 && r.strike < spot * 1.3)
      .sort((a,b) => a.strike - b.strike)
      .map(r => ({ ...r, net: r.callGex + r.putGex, totalOI: r.callOI + r.putOI }));
  }, [data, exp, spot]);

  // DTE distribution: aggregate OI & |GEX| per expiration
  const dteRows = useMemo(() => {
    if (!spot) return [];
    const map = new Map<string, { exp: string; dte: number; callOI: number; putOI: number; callGex: number; putGex: number }>();
    const today = new Date(); today.setHours(0,0,0,0);
    for (const d of data) {
      const g = d.greeks?.gamma; const oi = d.open_interest ?? 0;
      const e = d.details?.expiration_date;
      if (!e || g == null || !oi) continue;
      const isCall = d.details.contract_type === "call";
      const gex = oi * g * 100 * spot * spot * 0.01;
      const dte = Math.max(0, Math.round((new Date(e).getTime() - today.getTime()) / 86400000));
      const r = map.get(e) ?? { exp: e, dte, callOI: 0, putOI: 0, callGex: 0, putGex: 0 };
      if (isCall) { r.callOI += oi; r.callGex += gex; }
      else { r.putOI += oi; r.putGex -= gex; }
      map.set(e, r);
    }
    return Array.from(map.values())
      .sort((a, b) => a.dte - b.dte)
      .map(r => ({ ...r, totalOI: r.callOI + r.putOI, netGex: r.callGex + r.putGex, label: `${r.exp.slice(5)} (${r.dte}d)` }));
  }, [data, spot]);

  const totalContracts = data.length;
  const totalOI = useMemo(() => data.reduce((a, d) => a + (d.open_interest ?? 0), 0), [data]);

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

  async function runAIAnalysis() {
    if (!ticker || !rows.length || !spot) {
      toast.error("请先加载数据");
      return;
    }
    setAiText("");
    setAiLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-gex`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ ticker, spot, expiration: exp, totalGEX, zeroGamma, rows }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        toast.error(err.error || "AI 分析失败");
        setAiLoading(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) setAiText(prev => prev + c);
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GEX 分析</h1>
          <p className="text-sm text-muted-foreground">Gamma Exposure 按行权价分布 · 识别 Pin 点与 Zero Gamma Level</p>
        </div>
        <div className="flex items-center gap-2">
          {expirations.length > 0 && (
            <Select value={exp ?? "ALL"} onValueChange={(v) => setExp(v === "ALL" ? undefined : v)}>
              <SelectTrigger className="w-44 font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="font-mono">所有到期</SelectItem>
                {expirations.map(e => <SelectItem key={e} value={e} className="font-mono">{e}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
        </div>
      </div>

      {expirations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">快速到期:</span>
          {[7, 14, 21].map(d => {
            const target = pickClosestExp(d);
            const active = exp === target;
            return (
              <Button key={d} variant={active ? "default" : "outline"} size="sm" className="font-mono h-7"
                onClick={() => setExp(target)}>
                +{d}D {target ? `· ${target.slice(5)}` : ""}
              </Button>
            );
          })}
          <Button variant={!exp ? "default" : "outline"} size="sm" className="font-mono h-7" onClick={() => setExp(undefined)}>
            全部
          </Button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Spot" value={spot ? `$${fmt(spot)}` : "—"} />
        <Stat label="Total Net GEX" value={fmt(totalGEX / 1e6, 2) + "M"} positive={totalGEX >= 0} />
        <Stat label="Zero Gamma" value={zeroGamma ? `$${fmt(zeroGamma)}` : "—"} />
        <Stat label="合约数" value={`${totalContracts}`} />
        <Stat label="总 OI" value={totalOI >= 1e6 ? `${(totalOI/1e6).toFixed(2)}M` : totalOI >= 1e3 ? `${(totalOI/1e3).toFixed(1)}K` : `${totalOI}`} />
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 h-[500px]">
        {loading && <div className="text-xs text-muted-foreground font-mono">加载中…</div>}
        {!ticker && <div className="grid place-items-center h-full text-muted-foreground">请先搜索标的</div>}
        {ticker && rows.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 40 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
              <XAxis
                dataKey="strike"
                type="category"
                interval="preserveStartEnd"
                minTickGap={8}
                height={36}
                tickMargin={8}
                tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis yAxisId="gex" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => `${(v/1e6).toFixed(1)}M`} />
              <YAxis yAxisId="oi" orientation="right" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
                formatter={(v: number, name: string) => name === "OI" ? v.toLocaleString() : `${(v/1e6).toFixed(2)}M`} />
              {spot && <ReferenceLine x={Math.round(spot)} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Spot", fill: "hsl(var(--primary))", fontSize: 10 }} />}
              {zeroGamma && <ReferenceLine x={Math.round(zeroGamma)} stroke="hsl(var(--accent))" strokeDasharray="3 3" label={{ value: "Zero γ", fill: "hsl(var(--accent))", fontSize: 10 }} />}
              <Bar yAxisId="oi" dataKey="totalOI" name="OI" fill="hsl(var(--muted-foreground) / 0.25)" />
              <Bar yAxisId="gex" dataKey="net" name="Net GEX">
                {rows.map((r, i) => <Cell key={i} fill={r.net >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold">DTE 分布</h2>
            <p className="text-xs text-muted-foreground">按到期日聚合 OI 与 |Net GEX|（全数据，不受到期筛选影响）</p>
          </div>
        </div>
        <div className="h-[320px]">
          {dteRows.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dteRows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
                <XAxis dataKey="label" angle={-35} textAnchor="end" height={60}
                  tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="oi" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
                <YAxis yAxisId="gex" orientation="right" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `${(v/1e6).toFixed(1)}M`} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
                  formatter={(v: number, name: string) => name.includes("OI") ? v.toLocaleString() : `${(v/1e6).toFixed(2)}M`} />
                <Bar yAxisId="oi" dataKey="callOI" name="Call OI" stackId="oi" fill="hsl(var(--bull) / 0.7)" />
                <Bar yAxisId="oi" dataKey="putOI" name="Put OI" stackId="oi" fill="hsl(var(--bear) / 0.7)" />
                <Bar yAxisId="gex" dataKey="netGex" name="Net GEX" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid place-items-center h-full text-xs text-muted-foreground">暂无数据</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              AI GEX 解读 + 期权策略
            </h2>
            <p className="text-xs text-muted-foreground">基于当前 GEX 结构推荐所有主流期权组合</p>
          </div>
          <Button onClick={runAIAnalysis} disabled={aiLoading || !rows.length} size="sm">
            {aiLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />分析中</> : "运行 AI 分析"}
          </Button>
        </div>
        {aiText ? (
          <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground/90 max-h-[600px] overflow-auto">{aiText}</pre>
        ) : (
          <div className="text-xs text-muted-foreground py-8 text-center">
            {rows.length ? "点击右上角运行 AI 分析" : "请先选择标的并加载数据"}
          </div>
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