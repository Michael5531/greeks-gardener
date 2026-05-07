import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";

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
  const { data, loading, error } = useOptionsChain(ticker || null);

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">期权 OI 曲面</h1>
          <p className="text-sm text-muted-foreground">X = Strike · Z = 到期 · Y = 未平仓量 · 颜色 = IV</p>
        </div>
        <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
      </div>

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
    </div>
  );
}