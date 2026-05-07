import { useMemo, useState, useEffect, useRef } from "react";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Bar, BarChart, CartesianGrid, Legend, Line as RLine, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/optionUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { useComputeIVSurface } from "@/hooks/useComputeIVSurface";

export default function Greeks3D() {
  const [ticker, setTicker] = useSelectedTicker();
  const { loading: chainLoading, error, expirations } = useOptionsChain(ticker || null);
  const { quote: liveQuote } = useLiveQuote(ticker || null, 4000);

  // Selected expirations for charts (defaults to closest to +7/+14/+21d)
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
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

  // Backend compute
  const { data: surf, loading: surfLoading } = useComputeIVSurface(ticker, selectedExps);
  const loading = chainLoading || surfLoading;

  const strikes = surf?.strikes ?? [];
  const exps = surf?.exps ?? [];
  const ivCurve = surf?.ivCurve ?? [];
  const total = surf?.total ?? 0;
  const ready = strikes.length > 1 && exps.length > 0;
  const byStrike = surf?.byStrike ?? [];
  const byExp = surf?.byExp ?? [];
  const totals = surf?.totals ?? { callOI: 0, putOI: 0, callVol: 0, putVol: 0 };
  const data = surf ? new Array(total) : []; // placeholder for "data.length > 0" guard

  const pcrOI = totals.callOI ? totals.putOI / totals.callOI : 0;
  const pcrVol = totals.callVol ? totals.putVol / totals.callVol : 0;

  const underlyingPrice = liveQuote?.price ?? surf?.spot ?? null;

  // Per-DTE pivot: rows = strike, one numeric column per selected expiration
  const expColors = useMemo(() => {
    const list = [...selectedExps].sort();
    const map: Record<string, string> = {};
    const N = Math.max(1, list.length);
    list.forEach((e, i) => { map[e] = `hsl(${Math.round((i * 360) / N)} 70% 55%)`; });
    return map;
  }, [selectedExps]);

  const strikePivotOI = surf?.strikePivotOI ?? [];
  const strikePivotVol = surf?.strikePivotVol ?? [];

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
          <ChartSizer>
            {({ width, height }) => <LineChart width={width} height={height} data={ivCurve} margin={{ top: 12, right: 16, left: 0, bottom: 24 }}>
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
            </LineChart>}
          </ChartSizer>
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
          <Section title="IV Surface · DTE × Strike" subtitle="Heatmap · 颜色 = 隐含波动率 (蓝低 红高)">
            <IVSurfaceHeatmap ivCurve={ivCurve} strikes={strikes} exps={exps} spot={underlyingPrice} />
          </Section>

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

function ChartSizer({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 320 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className="h-full w-full min-h-0 min-w-0">{children(size)}</div>;
}

function StackedChart({ data, xKey, aKey, bKey }: { data: any[]; xKey: string; aKey: string; bKey: string }) {
  return (
    <ChartSizer>
      {({ width, height }) => <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
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
      </BarChart>}
    </ChartSizer>
  );
}

function DTEStackedChart({
  data, xKey, exps, colors, refX,
}: { data: any[]; xKey: string; exps: string[]; colors: Record<string, string>; refX: number | null }) {
  return (
    <ChartSizer>
      {({ width, height }) => <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }} stackOffset="sign" barCategoryGap="8%">
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
      </BarChart>}
    </ChartSizer>
  );
}

function ExpiryLineChart({ data }: { data: any[] }) {
  return (
    <ChartSizer>
      {({ width, height }) => <LineChart width={width} height={height} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
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
      </LineChart>}
    </ChartSizer>
  );
}

function IVSurfaceHeatmap({
  ivCurve, strikes, exps, spot,
}: { ivCurve: any[]; strikes: number[]; exps: string[]; spot: number | null }) {
  // Compute color scale from observed IVs (in %)
  const vals: number[] = [];
  for (const row of ivCurve) for (const e of exps) { const v = row[e]; if (typeof v === "number") vals.push(v); }
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const span = Math.max(0.001, hi - lo);
  const color = (v: number | null | undefined) => {
    if (typeof v !== "number") return "hsl(var(--muted) / 0.15)";
    const t = (v - lo) / span; // 0..1
    // Blue (low) → white → Red (high) via HSL
    const hue = (1 - t) * 220; // 220 blue → 0 red
    const light = 50 + (1 - Math.abs(0.5 - t) * 2) * 15; // brighter near mid
    return `hsl(${hue} 70% ${light}%)`;
  };
  // Find spot column index for the dashed marker
  let spotIdx = -1;
  if (spot != null && strikes.length) {
    let best = Infinity;
    strikes.forEach((s, i) => { const d = Math.abs(s - spot); if (d < best) { best = d; spotIdx = i; } });
  }
  if (!strikes.length || !exps.length) {
    return <div className="h-full grid place-items-center text-muted-foreground text-sm">数据不足</div>;
  }
  // Y axis: rows = expirations (top = nearest)
  const sortedExps = [...exps].sort();
  const ivByExp: Record<string, Record<number, number | null>> = {};
  for (const e of sortedExps) ivByExp[e] = {};
  for (const row of ivCurve) for (const e of sortedExps) ivByExp[e][row.strike] = row[e] ?? null;

  return (
    <div className="h-full w-full overflow-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-20 shrink-0" />
          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${strikes.length}, minmax(28px, 1fr))` }}>
            {strikes.map((s, i) => (
              <div key={s} className={`text-[9px] font-mono text-center text-muted-foreground py-1 ${i === spotIdx ? "text-foreground font-bold" : ""}`}>
                {s}
              </div>
            ))}
          </div>
        </div>
        {sortedExps.map(e => (
          <div key={e} className="flex">
            <div className="w-20 shrink-0 text-[10px] font-mono text-muted-foreground flex items-center pr-2 justify-end">{e}</div>
            <div className="flex-1 grid gap-px" style={{ gridTemplateColumns: `repeat(${strikes.length}, minmax(28px, 1fr))` }}>
              {strikes.map((s, i) => {
                const v = ivByExp[e][s];
                return (
                  <div
                    key={s}
                    className={`h-7 flex items-center justify-center text-[9px] font-mono ${i === spotIdx ? "ring-1 ring-foreground/60" : ""}`}
                    style={{ background: color(v), color: typeof v === "number" ? "hsl(0 0% 10%)" : "hsl(var(--muted-foreground))" }}
                    title={`Strike ${s} · ${e} · IV ${typeof v === "number" ? v.toFixed(1) + "%" : "—"}`}
                  >
                    {typeof v === "number" ? v.toFixed(0) : "·"}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pl-20 pt-2 text-[10px] font-mono text-muted-foreground">
          <span>IV%:</span>
          <span>{lo.toFixed(1)}</span>
          <div className="h-2 w-40 rounded" style={{ background: "linear-gradient(to right, hsl(220 70% 50%), hsl(110 70% 60%), hsl(0 70% 50%))" }} />
          <span>{hi.toFixed(1)}</span>
          {spot != null && <span className="ml-3">Spot ≈ {spot.toFixed(2)} (highlighted column)</span>}
        </div>
      </div>
    </div>
  );
}