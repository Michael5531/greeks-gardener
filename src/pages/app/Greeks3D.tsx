import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtPct } from "@/lib/optionUtils";

function ivColor(iv: number) {
  // map IV 0..1.5 -> hue 200..0 (cyan -> red)
  const t = Math.min(1, Math.max(0, iv / 1.0));
  const h = (1 - t) * 200;
  const c = new THREE.Color();
  c.setHSL(h / 360, 0.8, 0.55);
  return c;
}

function Axes() {
  const L = 5;
  return (
    <group>
      {/* axes */}
      <Line points={[[-L,0,0],[L,0,0]]} color="#ff5577" lineWidth={1.5} />
      <Line points={[[0,-L,0],[0,L,0]]} color="#55ff99" lineWidth={1.5} />
      <Line points={[[0,0,-L],[0,0,L]]} color="#5599ff" lineWidth={1.5} />
      <Text position={[L+0.3,0,0]} fontSize={0.35} color="#ff7799">Δ Delta</Text>
      <Text position={[0,L+0.3,0]} fontSize={0.35} color="#77ffaa">Γ Gamma</Text>
      <Text position={[0,0,L+0.3]} fontSize={0.35} color="#77aaff">Θ Theta</Text>
      {/* grid */}
      <gridHelper args={[10, 10, "#444", "#222"]} position={[0,-L,0]} />
    </group>
  );
}

type Row = { d: number; g: number; t: number; iv: number; oi: number; ticker: string; strike: number; type: string; exp: string };

function Points({ rows, onHover }: { rows: Row[]; onHover: (r: Row | null) => void }) {
  return (
    <group>
      {rows.map((r, i) => {
        const x = r.d * 5; // delta -1..1 -> -5..5
        const gMax = Math.max(...rows.map(rr => rr.g), 0.0001);
        const tMin = Math.min(...rows.map(rr => rr.t), -0.0001);
        const y = (r.g / gMax) * 5;
        const z = (r.t / Math.abs(tMin)) * 5;
        const size = Math.max(0.07, Math.min(0.35, Math.log10((r.oi || 1) + 1) * 0.07));
        return (
          <mesh key={i} position={[x, y, z]} onPointerOver={(e) => { e.stopPropagation(); onHover(r); }} onPointerOut={() => onHover(null)}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshStandardMaterial color={ivColor(r.iv)} emissive={ivColor(r.iv)} emissiveIntensity={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Greeks3D() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const [exp, setExp] = useState<string | undefined>();
  const { data, expirations, loading, error } = useOptionsChain(ticker || null);
  const [hover, setHover] = useState<Row | null>(null);

  const rows: Row[] = useMemo(() => {
    const filtered = exp ? data.filter(d => d.details?.expiration_date === exp) : data;
    return filtered
      .filter(d => d.greeks?.delta != null && d.greeks?.gamma != null && d.greeks?.theta != null)
      .map(d => ({
        d: d.greeks.delta,
        g: d.greeks.gamma,
        t: d.greeks.theta,
        iv: d.implied_volatility ?? 0,
        oi: d.open_interest ?? 0,
        ticker: d.details.ticker,
        strike: d.details.strike_price,
        type: d.details.contract_type,
        exp: d.details.expiration_date,
      }));
  }, [data, exp]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">3D Greeks 可视化</h1>
          <p className="text-sm text-muted-foreground">X = Delta · Y = Gamma · Z = Theta · 颜色 = IV · 大小 = OI</p>
        </div>
        <div className="flex items-center gap-2">
          {expirations.length > 0 && (
            <Select value={exp} onValueChange={setExp}>
              <SelectTrigger className="w-44 font-mono"><SelectValue placeholder="所有到期" /></SelectTrigger>
              <SelectContent>{expirations.map(e => <SelectItem key={e} value={e} className="font-mono">{e}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <div className="w-72"><TickerSearch onSelect={t => { setExp(undefined); setParams({ ticker: t.ticker }); }} /></div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/30 h-[640px] relative overflow-hidden">
        {!ticker && <div className="absolute inset-0 grid place-items-center text-muted-foreground">请先搜索标的</div>}
        {loading && <div className="absolute top-3 left-3 text-xs text-muted-foreground font-mono">加载期权链…</div>}
        {error && <div className="absolute top-3 left-3 text-xs text-destructive font-mono">{error}</div>}
        {ticker && (
          <Canvas camera={{ position: [10, 8, 10], fov: 45 }}>
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.3} color="#88aaff" />
            <Axes />
            <Points rows={rows} onHover={setHover} />
            <OrbitControls enableDamping />
          </Canvas>
        )}
        {hover && (
          <div className="absolute bottom-3 left-3 rounded-md border border-border bg-card/90 backdrop-blur p-3 text-xs font-mono space-y-0.5 elevated">
            <div className="font-semibold">{hover.ticker}</div>
            <div>{hover.type.toUpperCase()} · K={fmt(hover.strike)} · {hover.exp}</div>
            <div>Δ {fmt(hover.d, 3)}  Γ {fmt(hover.g, 4)}  Θ {fmt(hover.t, 3)}</div>
            <div>IV {fmtPct(hover.iv)} · OI {hover.oi}</div>
          </div>
        )}
        <div className="absolute top-3 right-3 text-[10px] font-mono text-muted-foreground bg-card/70 backdrop-blur border border-border rounded px-2 py-1">
          {rows.length} contracts
        </div>
      </div>
    </div>
  );
}