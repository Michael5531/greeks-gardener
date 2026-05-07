import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { getOptionsChain } from "@/lib/polygon";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/optionUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

function Axes({ size = 5 }: { size?: number }) {
  const L = size;
  return (
    <group>
      <Line points={[[0,0,0],[L,0,0]]} color="#ff5577" lineWidth={1.5} />
      <Line points={[[0,0,0],[0,L,0]]} color="#55ff99" lineWidth={1.5} />
      <Line points={[[0,0,0],[0,0,L]]} color="#5599ff" lineWidth={1.5} />
      <Text position={[L+0.3,0,0]} fontSize={0.3} color="#ff7799">Strike</Text>
      <Text position={[0,L+0.3,0]} fontSize={0.3} color="#77ffaa">OI</Text>
      <Text position={[0,0,L+0.3]} fontSize={0.3} color="#77aaff">Expiry</Text>
      <gridHelper args={[L*2, 10, "#333", "#1f1f1f"]} position={[L/2,0,L/2]} />
    </group>
  );
}

type Cell = { oi: number; iv: number; n: number };

function Surface({ strikes, exps, grid }: { strikes: number[]; exps: string[]; grid: Cell[][] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const W = 10, D = 10, H = 5;
  const nx = strikes.length, nz = exps.length;

  const { geometry, material } = useMemo(() => {
    const geom = new THREE.PlaneGeometry(W, D, Math.max(1, nx - 1), Math.max(1, nz - 1));
    geom.rotateX(-Math.PI / 2);
    geom.translate(W / 2, 0, D / 2);

    let oiMax = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) oiMax = Math.max(oiMax, grid[j][i].oi);
    oiMax = oiMax || 1;

    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const cell = grid[j][i];
        const h = (cell.oi / oiMax) * H;
        pos.setY(idx, h);
        const iv = cell.iv;
        const t = Math.min(1, Math.max(0, iv / 1.0));
        c.setHSL(((1 - t) * 220) / 360, 0.85, 0.5 + (cell.oi / oiMax) * 0.15);
        colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b;
      }
    }
    pos.needsUpdate = true;
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide,
      metalness: 0.2, roughness: 0.55, flatShading: false,
    });
    return { geometry: geom, material: mat };
  }, [strikes, exps, grid, nx, nz]);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // axis tick labels (sample)
  const xTicks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(nx / 6));
    for (let i = 0; i < nx; i += step) out.push({ x: (i / Math.max(1, nx - 1)) * W, label: String(strikes[i]) });
    return out;
  }, [strikes, nx]);
  const zTicks = useMemo(() => {
    const out: { z: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(nz / 5));
    for (let j = 0; j < nz; j += step) out.push({ z: (j / Math.max(1, nz - 1)) * D, label: exps[j]?.slice(5) ?? "" });
    return out;
  }, [exps, nz]);

  return (
    <group position={[-W / 2, 0, -D / 2]}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {/* wireframe overlay */}
      <mesh geometry={geometry}>
        <meshBasicMaterial wireframe color="#ffffff" transparent opacity={0.08} />
      </mesh>
      <Axes size={Math.max(W, D) * 0.6} />
      {xTicks.map((t, i) => (
        <Text key={`xt-${i}`} position={[t.x, -0.05, -0.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#ff9aae">{t.label}</Text>
      ))}
      {zTicks.map((t, i) => (
        <Text key={`zt-${i}`} position={[-0.3, -0.05, t.z]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#9ab5ff">{t.label}</Text>
      ))}
    </group>
  );
}

export default function Greeks3D() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const { data: baseData, loading, error, expirations } = useOptionsChain(ticker || null);

  // Selected expirations for charts (defaults to closest to +7/+14/+21d)
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  const [extraData, setExtraData] = useState<Record<string, any[]>>({});

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

  // Fetch chain for any selected expiration that we don't have yet
  useEffect(() => {
    if (!ticker) return;
    const have = new Set(baseData.map(d => d.details?.expiration_date).filter(Boolean));
    const missing = selectedExps.filter(e => !have.has(e) && !extraData[e]);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(async e => {
      try { const r = await getOptionsChain(ticker, e); return [e, r as any[]] as const; }
      catch { return [e, [] as any[]] as const; }
    })).then(results => {
      if (cancelled) return;
      setExtraData(prev => {
        const next = { ...prev };
        for (const [e, r] of results) next[e] = r;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [ticker, selectedExps, baseData, extraData]);

  // Merge: base data + extra fetched data, then filter to selectedExps for charts
  const data = useMemo(() => {
    if (!selectedExps.length) return baseData;
    const seen = new Set<string>();
    const out: any[] = [];
    const push = (d: any) => {
      const k = `${d.details?.ticker}|${d.details?.strike_price}|${d.details?.expiration_date}|${d.details?.contract_type}`;
      if (seen.has(k)) return;
      seen.add(k); out.push(d);
    };
    for (const d of baseData) {
      if (selectedExps.includes(d.details?.expiration_date)) push(d);
    }
    for (const e of selectedExps) for (const d of (extraData[e] ?? [])) push(d);
    return out;
  }, [baseData, extraData, selectedExps]);

  const { strikes, exps, grid, total } = useMemo(() => {
    const strikeSet = new Set<number>();
    const expSet = new Set<string>();
    for (const d of data) {
      const k = d.details?.strike_price; const e = d.details?.expiration_date;
      if (k != null && e) { strikeSet.add(k); expSet.add(e); }
    }
    const strikes = Array.from(strikeSet).sort((a, b) => a - b);
    const exps = Array.from(expSet).sort();
    const sIdx = new Map(strikes.map((s, i) => [s, i] as const));
    const eIdx = new Map(exps.map((e, i) => [e, i] as const));
    const grid: Cell[][] = exps.map(() => strikes.map(() => ({ oi: 0, iv: 0, n: 0 })));
    let total = 0;
    for (const d of data) {
      const i = sIdx.get(d.details?.strike_price);
      const j = eIdx.get(d.details?.expiration_date);
      if (i == null || j == null) continue;
      const cell = grid[j][i];
      cell.oi += d.open_interest ?? 0;
      if (d.implied_volatility != null) { cell.iv += d.implied_volatility; cell.n += 1; }
      total += 1;
    }
    for (const row of grid) for (const c of row) c.iv = c.n ? c.iv / c.n : 0;
    return { strikes, exps, grid, total };
  }, [data]);

  const ready = strikes.length > 1 && exps.length > 1;

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
    for (const d of data) {
      const p = d.underlying_asset?.price;
      if (p != null) return p as number;
    }
    return null;
  }, [data]);

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
      const oiRow = oi.get(k) ?? { strike: k };
      oiRow[e] = (oiRow[e] ?? 0) + (d.open_interest ?? 0);
      oi.set(k, oiRow);
      const vRow = vol.get(k) ?? { strike: k };
      vRow[e] = (vRow[e] ?? 0) + (d.day?.volume ?? 0);
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
          <h1 className="text-2xl font-semibold tracking-tight">期权 OI 曲面</h1>
          <p className="text-sm text-muted-foreground">X = Strike · Z = 到期 · Y = 未平仓量 · 颜色 = IV</p>
        </div>
        <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
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

      <div className="rounded-lg border border-border bg-card/30 h-[640px] relative overflow-hidden">
        {!ticker && <div className="absolute inset-0 grid place-items-center text-muted-foreground">请先搜索标的</div>}
        {loading && <div className="absolute top-3 left-3 text-xs text-muted-foreground font-mono">加载期权链…</div>}
        {error && <div className="absolute top-3 left-3 text-xs text-destructive font-mono">{error}</div>}
        {ticker && ready && (
          <Canvas camera={{ position: [11, 9, 11], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 12, 10]} intensity={1.1} />
            <pointLight position={[-10, 6, -10]} intensity={0.4} color="#88aaff" />
            <Surface strikes={strikes} exps={exps} grid={grid} />
            <OrbitControls enableDamping />
          </Canvas>
        )}
        {ticker && !ready && !loading && (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">数据不足以绘制曲面</div>
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

          <Section title="未平仓量 OI · 按行权价" subtitle="不同到期日叠加显示">
            <DTEStackedChart data={strikePivotOI} xKey="strike" exps={[...selectedExps].sort()} colors={expColors} refX={underlyingPrice} />
          </Section>

          <Section title="未平仓量 OI · 按到期日" subtitle="Call vs Put 堆叠">
            <StackedChart data={byExp} xKey="exp" aKey="callOI" bKey="putOI" />
          </Section>

          <Section title="成交量 Volume · 按行权价" subtitle="不同到期日叠加显示">
            <DTEStackedChart data={strikePivotVol} xKey="strike" exps={[...selectedExps].sort()} colors={expColors} refX={underlyingPrice} />
          </Section>

          <Section title="成交量 Volume · 按到期日" subtitle="Call vs Put 堆叠">
            <StackedChart data={byExp} xKey="exp" aKey="callVol" bKey="putVol" />
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

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="h-72">{children}</div>
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
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
        <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
        <XAxis dataKey={xKey} type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtK(v)} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
          formatter={(v: number, name: string) => [fmtK(v), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
        {exps.map(e => (
          <Bar key={e} dataKey={e} stackId="dte" fill={colors[e]} name={e} />
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