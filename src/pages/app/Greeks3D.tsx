import { useMemo, useRef, useState, useEffect } from "react";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { getOptionsChain } from "@/lib/polygon";
import { Bar, BarChart, CartesianGrid, Legend, Line as RLine, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/optionUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { useLiveQuote } from "@/hooks/useLiveQuote";

export default function Greeks3D() {
  const [ticker, setTicker] = useSelectedTicker();
  const { data: baseData, loading, error, expirations } = useOptionsChain(ticker || null);
  const { quote: liveQuote } = useLiveQuote(ticker || null, 4000);

  // Selected expirations for charts (defaults to closest to +7/+14/+21d)
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  // Cache scoped per-ticker so switching symbols never leaks stale contracts
  const [extraDataAll, setExtraDataAll] = useState<Record<string, Record<string, any[]>>>({});
  const extraData = (ticker && extraDataAll[ticker]) || {};

  // Reset selected expirations when ticker changes (different chains, different dates)
  useEffect(() => { setSelectedExps([]); }, [ticker]);

  const pickClosestExp = (days: number, list: string[]): string | undefined => {
    if (!list.length) return undefined;
    const target = new Date();
    target.setDate(target.getDate() + days);
    const t = target.getTime();
    let best = list[0];
    let bestDiff = Math.abs(new Date(best).getTime() - t);
    for (const e of list) {
      const d = Math.abs(new Date(e).getTime() - t);
      if (d < bestDiff) { bestDiff = d; best = e; }
    }
    return best;
  };

  // Initialize defaults when expirations arrive
  useEffect(() => {
    if (!expirations.length) { setSelectedExps([]); return; }
    const defaults = [7, 14, 21]
      .map(d => pickClosestExp(d, expirations))
      .filter((x): x is string => !!x);
    setSelectedExps(Array.from(new Set(defaults)));
  }, [expirations]);

  // Fetch chain for any selected expiration that we don't have yet (per-ticker cache)
  useEffect(() => {
    if (!ticker) return;
    const baseForThisTicker = baseData.filter(d => d.details?.ticker?.startsWith(`O:${ticker}`));
    const have = new Set(baseForThisTicker.map(d => d.details?.expiration_date).filter(Boolean));
    const missing = selectedExps.filter(e => !have.has(e) && !extraData[e]);
    if (!missing.length) return;
    let cancelled = false;
    const tk = ticker;
    Promise.all(missing.map(async e => {
      try { const r = await getOptionsChain(tk, e); return [e, r as any[]] as const; }
      catch { return [e, [] as any[]] as const; }
    })).then(results => {
      if (cancelled) return;
      setExtraDataAll(prev => {
        const bucket = { ...(prev[tk] ?? {}) };
        for (const [e, r] of results) bucket[e] = r;
        return { ...prev, [tk]: bucket };
      });
    });
    return () => { cancelled = true; };
  }, [ticker, selectedExps, baseData]);

  // Merge: base data + extra fetched data, then filter to selectedExps for charts
  const data = useMemo(() => {
    // Defensive: only keep rows whose option ticker matches the selected underlying
    const baseFiltered = ticker
      ? baseData.filter(d => d.details?.ticker?.startsWith(`O:${ticker}`))
      : baseData;
    if (!selectedExps.length) return baseFiltered;
    const seen = new Set<string>();
    const out: any[] = [];
    const push = (d: any) => {
      const k = `${d.details?.ticker}|${d.details?.strike_price}|${d.details?.expiration_date}|${d.details?.contract_type}`;
      if (seen.has(k)) return;
      seen.add(k); out.push(d);
    };
    for (const d of baseFiltered) {
      if (selectedExps.includes(d.details?.expiration_date)) push(d);
    }
    for (const e of selectedExps) for (const d of (extraData[e] ?? [])) push(d);
    return out;
  }, [baseData, extraData, selectedExps, ticker]);

  // Build IV smile data: rows = strike, columns = expiration IV (avg of call & put)
  const { strikes, exps, ivCurve, total } = useMemo(() => {
    const strikeSet = new Set<number>();
    const expSet = new Set<string>();
    const acc = new Map<string, { sum: number; n: number }>();
    let total = 0;
    for (const d of data) {
      const k = d.details?.strike_price; const e = d.details?.expiration_date;
      if (k == null || !e) continue;
      strikeSet.add(k); expSet.add(e); total++;
      const iv = d.implied_volatility;
      if (typeof iv === "number" && iv > 0 && iv < 5) {
        const key = `${k}|${e}`;
        const r = acc.get(key) ?? { sum: 0, n: 0 };
        r.sum += iv; r.n += 1; acc.set(key, r);
      }
    }
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const exps = Array.from(expSet).sort();
    const ivCurve = strikes.map(s => {
      const row: any = { strike: s };
      for (const e of exps) {
        const r = acc.get(`${s}|${e}`);
        row[e] = r && r.n ? +(r.sum / r.n * 100).toFixed(2) : null;
      }
      return row;
    });
    return { strikes, exps, ivCurve, total };
  }, [data]);

  const ready = strikes.length > 1 && exps.length > 0;

  // CALL/PUT 拆分聚合
  const { byStrike, byExp, totals } = useMemo(() => {
    const sMap = new Map<number, { strike: number; callOI: number; putOI: number; callVol: number; putVol: number }>();
    const eMap = new Map<string, { exp: string; callOI: number; putOI: number; callVol: number; putVol: number }>();
    let cOI = 0, pOI = 0, cV = 0, pV = 0;
    for (const d of data) {
      const k = d.details?.strike_price;
      const e = d.details?.expiration_date;
      const isCall = d.details?.contract_type === "call";
      const oi = d.open_interest ?? 0;
      const vol = d.day?.volume ?? 0;
      if (k != null) {
        const r = sMap.get(k) ?? { strike: k, callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        if (isCall) { r.callOI += oi; r.callVol += vol; } else { r.putOI += oi; r.putVol += vol; }
        sMap.set(k, r);
      }
      if (e) {
        const r = eMap.get(e) ?? { exp: e, callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
        if (isCall) { r.callOI += oi; r.callVol += vol; } else { r.putOI += oi; r.putVol += vol; }
        eMap.set(e, r);
      }
      if (isCall) { cOI += oi; cV += vol; } else { pOI += oi; pV += vol; }
    }
    const byStrike = Array.from(sMap.values()).sort((a, b) => a.strike - b.strike);
    const byExp = Array.from(eMap.values()).sort((a, b) => a.exp.localeCompare(b.exp));
    return { byStrike, byExp, totals: { callOI: cOI, putOI: pOI, callVol: cV, putVol: pV } };
  }, [data]);

  const pcrOI = totals.callOI ? totals.putOI / totals.callOI : 0;
  const pcrVol = totals.callVol ? totals.putVol / totals.callVol : 0;

  // underlying price (from any contract that carries it)
  const underlyingPrice = useMemo(() => {
    if (liveQuote?.price != null) return liveQuote.price;
    for (const d of data) {
      const p = d.underlying_asset?.price;
      if (p != null) return p as number;
    }
    return null;
  }, [data, liveQuote?.price]);

  // Per-DTE pivot: rows = strike, one numeric column per selected expiration
  const expColors = useMemo(() => {
    const list = [...selectedExps].sort();
    const map: Record<string, string> = {};
    const N = Math.max(1, list.length);
    list.forEach((e, i) => { map[e] = `hsl(${Math.round((i * 360) / N)} 70% 55%)`; });
    return map;
  }, [selectedExps]);

  const { strikePivotOI, strikePivotVol } = useMemo(() => {
    const oi = new Map<number, any>();
    const vol = new Map<number, any>();
    for (const d of data) {
      const k = d.details?.strike_price;
      const e = d.details?.expiration_date;
      if (k == null || !e || !selectedExps.includes(e)) continue;
      const isCall = d.details?.contract_type === "call";
      const oiRow = oi.get(k) ?? { strike: k };
      const vRow = vol.get(k) ?? { strike: k };
      const oiVal = d.open_interest ?? 0;
      const volVal = d.day?.volume ?? 0;
      // calls are positive (above axis), puts negative (below axis)
      if (isCall) {
        oiRow[`${e}__c`] = (oiRow[`${e}__c`] ?? 0) + oiVal;
        vRow[`${e}__c`] = (vRow[`${e}__c`] ?? 0) + volVal;
      } else {
        oiRow[`${e}__p`] = (oiRow[`${e}__p`] ?? 0) - oiVal;
        vRow[`${e}__p`] = (vRow[`${e}__p`] ?? 0) - volVal;
      }
      oi.set(k, oiRow);
      vol.set(k, vRow);
    }
    return {
      strikePivotOI: Array.from(oi.values()).sort((a, b) => a.strike - b.strike),
      strikePivotVol: Array.from(vol.values()).sort((a, b) => a.strike - b.strike),
    };
  }, [data, selectedExps]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">波动率曲线 IV Smile</h1>
          <p className="text-sm text-muted-foreground">X = Strike · Y = 隐含波动率 · 每条曲线对应一个到期日</p>
        </div>
        <div className="w-72"><TickerSearch onSelect={t => setTicker(t.ticker)} /></div>
      </div>

      {ticker && expirations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">到期日:</span>
          {selectedExps.map(e => (
            <Badge key={e} variant="secondary" className="font-mono gap-1 pr-1">
              {e}
              <button
                onClick={() => setSelectedExps(prev => prev.filter(x => x !== e))}
                className="hover:bg-muted rounded p-0.5"
                aria-label={`移除 ${e}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-mono">
                <Plus className="h-3 w-3 mr-1" /> 添加
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 max-h-80 overflow-auto">
              <div className="space-y-1">
                {expirations.map(e => {
                  const checked = selectedExps.includes(e);
                  return (
                    <label key={e} className="flex items-center gap-2 text-sm font-mono px-2 py-1 rounded hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          setSelectedExps(prev =>
                            c ? Array.from(new Set([...prev, e])).sort() : prev.filter(x => x !== e)
                          );
                        }}
                      />
                      {e}
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => {
              const defaults = [7, 14, 21].map(d => pickClosestExp(d, expirations)).filter((x): x is string => !!x);
              setSelectedExps(Array.from(new Set(defaults)));
            }}>
            重置默认
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/30 h-[560px] relative overflow-hidden p-4">
        {!ticker && <div className="absolute inset-0 grid place-items-center text-muted-foreground">请先搜索标的</div>}
        {loading && <div className="absolute top-3 left-3 text-xs text-muted-foreground font-mono">加载期权链…</div>}
        {error && <div className="absolute top-3 left-3 text-xs text-destructive font-mono">{error}</div>}
        {ticker && ready && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ivCurve} margin={{ top: 12, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" />
              <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tickFormatter={v => `${v}%`}
                tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }}
                formatter={(v: any, n: any) => [v != null ? `${v}%` : "—", n]}
                labelFormatter={(l: any) => `Strike ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              {underlyingPrice != null && (
                <ReferenceLine x={underlyingPrice} stroke="hsl(var(--foreground))" strokeDasharray="4 4"
                  label={{ value: `Spot ${underlyingPrice.toFixed(2)}`, fontSize: 10, fill: "hsl(var(--foreground))" }} />
              )}
              {exps.map(e => (
                <RLine key={e} type="monotone" dataKey={e} name={e} stroke={expColors[e] ?? "hsl(var(--primary))"}
                  strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        {ticker && !ready && !loading && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">数据不足以绘制曲线</div>
        )}
        <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-foreground bg-card/70 backdrop-blur border border-border rounded px-2 py-1">
          {strikes.length} strikes · {exps.length} expiries · {total} contracts
        </div>
      </div>

      {ticker && data.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Call OI" value={fmtK(totals.callOI)} tone="bull" />
            <Stat label="Put OI" value={fmtK(totals.putOI)} tone="bear" />
            <Stat label="Call Volume" value={fmtK(totals.callVol)} tone="bull" />
            <Stat label="Put Volume" value={fmtK(totals.putVol)} tone="bear" />
            <Stat label="Put/Call OI Ratio" value={pcrOI.toFixed(2)} tone={pcrOI > 1 ? "bear" : "bull"} />
            <Stat label="Put/Call Vol Ratio" value={pcrVol.toFixed(2)} tone={pcrVol > 1 ? "bear" : "bull"} />
            <Stat label="Strikes" value={String(byStrike.length)} />
            <Stat label="Expiries" value={String(byExp.length)} />
          </div>

          <Section title="未平仓量 OI · 按行权价" subtitle="Call 在上 / Put 在下 · 不同到期日叠加" tall>
            <DTEStackedChart data={strikePivotOI} xKey="strike" exps={[...selectedExps].sort()} colors={expColors} refX={underlyingPrice} />
          </Section>

          <Section title="成交量 Volume · 按行权价" subtitle="Call 在上 / Put 在下 · 不同到期日叠加" tall>
            <DTEStackedChart data={strikePivotVol} xKey="strike" exps={[...selectedExps].sort()} colors={expColors} refX={underlyingPrice} />
          </Section>

          <Section title="OI & Volume · 按到期日" subtitle="Call / Put 的 OI 与成交量随到期日变化">
            <ExpiryLineChart data={byExp} />
          </Section>
        </>
      )}
    </div>
  );
}

function fmtK(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-mono mt-0.5 ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children, tall }: { title: string; subtitle?: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className={tall ? "h-[760px]" : "h-96"}>{children}</div>
    </div>
  );
}

function StackedChart({ data, xKey, aKey, bKey }: { data: any[]; xKey: string; aKey: string; bKey: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
        <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtK(v)} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
          formatter={(v: number, name: string) => [fmtK(v), name.startsWith("call") ? "Call" : "Put"]}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v) => v.startsWith("call") ? "Call" : "Put"} />
        <Bar dataKey={aKey} stackId="s" fill="hsl(var(--bull))" />
        <Bar dataKey={bKey} stackId="s" fill="hsl(var(--bear))" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DTEStackedChart({
  data, xKey, exps, colors, refX,
}: { data: any[]; xKey: string; exps: string[]; colors: Record<string, string>; refX: number | null }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }} stackOffset="sign" barCategoryGap="8%">
        <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
        <XAxis dataKey={xKey} type="category" interval="preserveStartEnd" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtK(Math.abs(v))} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
          formatter={(v: number, name: string) => {
            const isCall = name.endsWith("__c");
            const exp = name.replace(/__[cp]$/, "");
            return [`${isCall ? "C" : "P"} ${fmtK(Math.abs(v))}`, exp];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
          formatter={(v: string) => v.replace(/__[cp]$/, "")}
        />
        {exps.map(e => (
          <Bar key={`${e}-c`} dataKey={`${e}__c`} stackId="dte" fill={colors[e]} name={`${e}__c`} />
        ))}
        {exps.map(e => (
          <Bar key={`${e}-p`} dataKey={`${e}__p`} stackId="dte" fill={colors[e]} fillOpacity={0.55} name={`${e}__p`} legendType="none" />
        ))}
        {refX != null && (
          <ReferenceLine
            x={refX}
            stroke="hsl(var(--foreground))"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: `Spot ${refX.toFixed(2)}`, position: "top", fill: "hsl(var(--foreground))", fontSize: 11, fontFamily: "JetBrains Mono" }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ExpiryLineChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
        <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
        <XAxis dataKey="exp" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
        <YAxis yAxisId="oi" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtK(v)} />
        <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtK(v)} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
          formatter={(v: number, name: string) => [fmtK(v), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
        <RLine yAxisId="oi" type="monotone" dataKey="callOI" name="Call OI" stroke="hsl(var(--bull))" strokeWidth={2} dot={{ r: 3 }} />
        <RLine yAxisId="oi" type="monotone" dataKey="putOI" name="Put OI" stroke="hsl(var(--bear))" strokeWidth={2} dot={{ r: 3 }} />
        <RLine yAxisId="vol" type="monotone" dataKey="callVol" name="Call Vol" stroke="hsl(var(--bull))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        <RLine yAxisId="vol" type="monotone" dataKey="putVol" name="Put Vol" stroke="hsl(var(--bear))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}