import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Activity, BarChart3, LineChart, TrendingUp, Boxes, Radar,
  ArrowUpRight, ArrowDownRight, Zap, Layers, Sparkles, ArrowRight,
} from "lucide-react";

const tape = [
  { s: "SPY",  p: 612.34, c: +0.82 },
  { s: "QQQ",  p: 548.91, c: +1.14 },
  { s: "NVDA", p: 184.22, c: +2.46 },
  { s: "TSLA", p: 412.07, c: -1.32 },
  { s: "AAPL", p: 268.55, c: +0.41 },
  { s: "META", p: 742.18, c: +1.91 },
  { s: "AMZN", p: 248.66, c: -0.27 },
  { s: "GOOGL",p: 209.13, c: +0.88 },
  { s: "MSFT", p: 498.74, c: +0.55 },
  { s: "VIX",  p:  14.62, c: -3.10 },
];

const modules = [
  { k: "01", icon: Activity,  t: "3D Greeks 立体图谱", d: "Δ · Γ · Θ 在三维空间内实时旋转，整条期权链的风险结构一目了然。" },
  { k: "02", icon: BarChart3, t: "GEX 市场微观结构",   d: "Gamma Exposure 分布、Zero Gamma、Pin Risk —— 看懂做市商的脚本。" },
  { k: "03", icon: Layers,    t: "Order Flow 解码",     d: "实时大单、Sweep、Block 拆解，跟住聪明钱的脚步。" },
  { k: "04", icon: LineChart, t: "策略回测引擎",        d: "Covered Call / Spread / Iron Condor，Sharpe、回撤、胜率全套。" },
  { k: "05", icon: Radar,     t: "信号雷达",            d: "扫描自选池，按你的规则生成可执行开仓建议。" },
  { k: "06", icon: Boxes,     t: "全市场期权链",        d: "Polygon.io 实时数据，IV、OI、Volume 与希腊字母同屏呈现。" },
];

const stats = [
  { v: "8K+",  l: "美股标的" },
  { v: "1M+",  l: "实时期权合约" },
  { v: "<120ms", l: "端到端延时" },
  { v: "24/7", l: "数据流守护" },
];

// Mock GEX profile per ticker — strikes & gamma exposure (in $B)
const GEX_DATA: Record<string, { spot: number; zeroG: number; strikes: { k: number; gex: number }[] }> = {
  SPY: {
    spot: 612.34, zeroG: 608.5,
    strikes: [
      { k: 595, gex: -1.8 }, { k: 600, gex: -2.6 }, { k: 605, gex: -1.2 },
      { k: 610, gex: 0.4 }, { k: 612, gex: 1.1 }, { k: 615, gex: 3.2 },
      { k: 620, gex: 2.4 }, { k: 625, gex: 1.6 }, { k: 630, gex: 0.7 },
    ],
  },
  QQQ: {
    spot: 548.91, zeroG: 545.0,
    strikes: [
      { k: 530, gex: -1.4 }, { k: 535, gex: -2.1 }, { k: 540, gex: -0.9 },
      { k: 545, gex: 0.3 }, { k: 548, gex: 0.9 }, { k: 550, gex: 2.6 },
      { k: 555, gex: 1.9 }, { k: 560, gex: 1.1 }, { k: 565, gex: 0.5 },
    ],
  },
  NVDA: {
    spot: 184.22, zeroG: 180.0,
    strikes: [
      { k: 170, gex: -0.9 }, { k: 175, gex: -1.6 }, { k: 180, gex: -0.4 },
      { k: 182, gex: 0.5 }, { k: 185, gex: 1.4 }, { k: 190, gex: 2.8 },
      { k: 195, gex: 1.7 }, { k: 200, gex: 1.0 }, { k: 205, gex: 0.4 },
    ],
  },
  TSLA: {
    spot: 412.07, zeroG: 418.0,
    strikes: [
      { k: 395, gex: -2.2 }, { k: 400, gex: -3.1 }, { k: 405, gex: -1.8 },
      { k: 410, gex: -0.6 }, { k: 415, gex: 0.4 }, { k: 420, gex: 1.5 },
      { k: 425, gex: 1.1 }, { k: 430, gex: 0.7 }, { k: 435, gex: 0.3 },
    ],
  },
};

export default function Index() {
  const [gexTicker, setGexTicker] = useState<keyof typeof GEX_DATA>("SPY");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gex = GEX_DATA[gexTicker];
  const maxAbs = useMemo(() => Math.max(...gex.strikes.map(s => Math.abs(s.gex))), [gex]);
  const callWall = useMemo(() => gex.strikes.reduce((a, b) => (b.gex > a.gex ? b : a)).k, [gex]);
  const putWall = useMemo(() => gex.strikes.reduce((a, b) => (b.gex < a.gex ? b : a)).k, [gex]);
  const netGex = useMemo(() => gex.strikes.reduce((s, x) => s + x.gex, 0), [gex]);
  const active = hoverIdx != null ? gex.strikes[hoverIdx] : null;

  return (
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground">
      {/* Ambient layers */}
      <div className="absolute inset-0 grid-bg opacity-[0.18] pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full pointer-events-none blur-3xl opacity-60"
        style={{ background: "radial-gradient(closest-side, hsl(165 90% 50% / 0.25), transparent 70%)" }} />
      <div className="absolute top-[20%] -right-40 h-[500px] w-[500px] rounded-full pointer-events-none blur-3xl opacity-50"
        style={{ background: "radial-gradient(closest-side, hsl(280 85% 65% / 0.22), transparent 70%)" }} />

      {/* Nav */}
      <header className="relative z-20 max-w-[1400px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-7 text-sm text-muted-foreground font-mono uppercase tracking-wider">
          <a className="hover:text-foreground transition-colors" href="#modules">Modules</a>
          <a className="hover:text-foreground transition-colors" href="#tape">Market</a>
          <a className="hover:text-foreground transition-colors" href="#stats">Engine</a>
        </div>
        <Link to="/auth">
          <Button size="sm" className="font-mono uppercase tracking-wider">
            Launch Terminal <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </header>

      {/* Live tape */}
      <div id="tape" className="relative z-10 border-y border-border/60 bg-card/30 backdrop-blur overflow-hidden">
        <div className="flex gap-10 py-2.5 animate-[scroll_40s_linear_infinite] whitespace-nowrap font-mono text-xs">
          {[...tape, ...tape, ...tape].map((t, i) => (
            <span key={i} className="flex items-center gap-2 shrink-0">
              <span className="text-muted-foreground">{t.s}</span>
              <span className="tabular-nums">{t.p.toFixed(2)}</span>
              <span className={t.c >= 0 ? "text-bull" : "text-bear"}>
                {t.c >= 0 ? "▲" : "▼"} {Math.abs(t.c).toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
        <style>{`@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
      </div>

      {/* HERO */}
      <section className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-20 lg:pt-28 pb-24">
        <div className="grid lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Polygon.io · Live Options Tape
            </div>
            <h1 className="text-[clamp(2.75rem,8vw,7.5rem)] font-bold tracking-[-0.04em] leading-[0.92]">
              See the <em className="not-italic bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>market</em>
              <br/>
              <span className="text-muted-foreground/70">before</span> it moves.
            </h1>
            <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              OPTI-X 把整张美股期权链拆解成三维 Greeks、GEX 微观结构与可执行的策略信号 ——
              一套为系统化交易者打造的市场洞察终端。
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="glow font-mono uppercase tracking-wider h-12 px-7">
                  开始使用 <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#modules">
                <Button size="lg" variant="outline" className="font-mono uppercase tracking-wider h-12 px-7">
                  探索模块
                </Button>
              </a>
            </div>
          </div>

          {/* Terminal preview card */}
          <div className="lg:col-span-4">
            <div className="relative rounded-xl border border-border bg-card/70 backdrop-blur p-5 elevated">
              <div className="absolute -inset-px rounded-xl pointer-events-none -z-10" style={{ background: "linear-gradient(135deg, hsl(165 90% 50% / 0.4), transparent 40%, hsl(280 85% 65% / 0.3))" }} />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-bear" />
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  <span className="h-2 w-2 rounded-full bg-bull" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider">{gexTicker} · 0DTE · GEX</span>
              </div>

              {/* Ticker switcher */}
              <div className="flex gap-1 mb-4 p-0.5 rounded-md bg-background/40 border border-border/60">
                {(Object.keys(GEX_DATA) as Array<keyof typeof GEX_DATA>).map(t => (
                  <button
                    key={t}
                    onClick={() => { setGexTicker(t); setHoverIdx(null); }}
                    className={`flex-1 text-[10px] font-mono uppercase tracking-wider py-1.5 rounded transition-colors ${
                      gexTicker === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Interactive GEX bar chart */}
              <div className="relative h-40 mb-3">
                <svg viewBox="0 0 320 160" className="w-full h-full" preserveAspectRatio="none">
                  {/* zero line */}
                  <line x1="0" y1="80" x2="320" y2="80" stroke="hsl(var(--border))" strokeDasharray="2 2" />
                  {/* spot marker */}
                  {(() => {
                    const spotIdx = gex.strikes.findIndex((s, i) =>
                      i === gex.strikes.length - 1 || (gex.spot >= s.k && gex.spot < gex.strikes[i + 1].k)
                    );
                    const xs = gex.strikes.length;
                    const bw = 320 / xs;
                    const sx = (spotIdx + 0.5) * bw + ((gex.spot - gex.strikes[spotIdx].k) / (gex.strikes[Math.min(spotIdx + 1, xs - 1)].k - gex.strikes[spotIdx].k || 1)) * bw;
                    return (
                      <line x1={sx} y1="0" x2={sx} y2="160" stroke="hsl(var(--foreground))" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                    );
                  })()}
                  {gex.strikes.map((s, i) => {
                    const bw = 320 / gex.strikes.length;
                    const x = i * bw + bw * 0.15;
                    const w = bw * 0.7;
                    const h = (Math.abs(s.gex) / maxAbs) * 70;
                    const y = s.gex >= 0 ? 80 - h : 80;
                    const isHover = hoverIdx === i;
                    return (
                      <rect
                        key={i}
                        x={x} y={y} width={w} height={h}
                        fill={s.gex >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"}
                        opacity={hoverIdx == null || isHover ? 0.95 : 0.35}
                        className="transition-opacity cursor-pointer"
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx(null)}
                      />
                    );
                  })}
                </svg>
                {active && (
                  <div className="absolute top-1 right-1 px-2 py-1 rounded bg-popover border border-border text-[10px] font-mono pointer-events-none">
                    <div className="text-muted-foreground">K {active.k}</div>
                    <div className={active.gex >= 0 ? "text-bull" : "text-bear"}>
                      {active.gex >= 0 ? "+" : ""}{active.gex.toFixed(2)}B
                    </div>
                  </div>
                )}
              </div>

              <div className="font-mono text-xs space-y-1.5">
                <Row k="Spot"      v={gex.spot.toFixed(2)} tone="default"/>
                <Row k="Zero Γ"    v={gex.zeroG.toFixed(2)} tone="warn"/>
                <Row k="Call Wall" v={callWall.toFixed(2)} tone="bull"/>
                <Row k="Put Wall"  v={putWall.toFixed(2)} tone="bear"/>
                <Row k="Net GEX"   v={`${netGex >= 0 ? "+" : ""}${netGex.toFixed(2)}B`} tone={netGex >= 0 ? "bull" : "bear"}/>
              </div>

              <div className="flex items-center justify-between mt-3 text-[10px] font-mono text-muted-foreground">
                <span>09:30 ET</span>
                <span className="flex items-center gap-1 text-bull"><Zap className="h-3 w-3"/> LIVE</span>
                <span>16:00 ET</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div id="stats" className="mt-24 grid grid-cols-2 md:grid-cols-4 border-y border-border">
          {stats.map((s, i) => (
            <div key={s.l} className={`py-7 px-2 ${i !== 0 ? "md:border-l border-border" : ""} ${i === 1 ? "border-l border-border" : ""} ${i === 2 ? "md:border-l border-l-0 border-t md:border-t-0 border-border" : ""} ${i === 3 ? "border-t md:border-t-0 border-l border-border" : ""}`}>
              <div className="text-3xl md:text-5xl font-bold tracking-tight tabular-nums">{s.v}</div>
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pb-32">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> 06 Modules
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-[-0.03em]">
              一个终端，<br/>洞察整个期权市场。
            </h2>
          </div>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            从希腊字母的微分变化，到聪明钱的下注路径 —— 每一个模块都为决策而生。
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {modules.map(m => (
            <div key={m.k} className="group relative p-7 bg-card/60 backdrop-blur hover:bg-card transition-colors min-h-[220px] flex flex-col">
              <div className="flex items-start justify-between mb-8">
                <m.icon className="h-6 w-6 text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em]">{m.k}</span>
              </div>
              <div className="text-xl font-semibold tracking-tight mb-2">{m.t}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{m.d}</div>
              <ArrowUpRight className="absolute bottom-6 right-6 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-24 relative rounded-2xl border border-border overflow-hidden">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at top right, hsl(165 90% 50% / 0.18), transparent 60%), radial-gradient(ellipse at bottom left, hsl(280 85% 65% / 0.15), transparent 60%)" }} />
          <div className="relative p-10 md:p-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">Ready when markets open</div>
              <h3 className="text-3xl md:text-5xl font-bold tracking-[-0.03em] leading-tight">
                把直觉，<br className="md:hidden"/>升级为<span className="text-primary">系统</span>。
              </h3>
            </div>
            <Link to="/auth">
              <Button size="lg" className="glow font-mono uppercase tracking-wider h-14 px-8 text-sm">
                进入终端 <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <div>© OPTI-X · Options Intelligence Terminal</div>
          <div>仅信号研究平台 · 不构成投资建议</div>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      <div className="relative h-10 w-10">
        {/* outer glow */}
        <div className="absolute inset-0 rounded-lg blur-md opacity-60 group-hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-primary)" }} />
        {/* glass plate */}
        <div className="relative h-10 w-10 rounded-lg border border-border/80 bg-background/80 backdrop-blur grid place-items-center overflow-hidden">
          <div className="absolute inset-0 opacity-30"
            style={{ background: "linear-gradient(135deg, hsl(165 90% 50% / 0.5), transparent 50%, hsl(280 85% 65% / 0.4))" }} />
          <svg viewBox="0 0 32 32" className="relative h-5 w-5">
            <defs>
              <linearGradient id="lg-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(165 90% 55%)" />
                <stop offset="100%" stopColor="hsl(280 85% 70%)" />
              </linearGradient>
            </defs>
            {/* X-curve: rising and falling, like option payoff */}
            <path d="M3 26 L13 14 L19 20 L29 6" fill="none" stroke="url(#lg-stroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="13" cy="14" r="1.6" fill="hsl(165 90% 55%)" />
            <circle cx="19" cy="20" r="1.6" fill="hsl(280 85% 70%)" />
          </svg>
        </div>
      </div>
      <div>
        <div className="font-semibold tracking-[-0.02em] leading-none text-[15px]">
          OPTI<span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>·X</span>
        </div>
        <div className="text-[9px] text-muted-foreground font-mono mt-1 tracking-[0.25em]">OPTIONS INTELLIGENCE</div>
      </div>
    </Link>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone: "default" | "bull" | "bear" | "warn" }) {
  const cls =
    tone === "bull" ? "text-bull" :
    tone === "bear" ? "text-bear" :
    tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1">
      <span className="text-muted-foreground tracking-wider">{k}</span>
      <span className={`tabular-nums ${cls}`}>{v}</span>
    </div>
  );
}
