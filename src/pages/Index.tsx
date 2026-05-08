import { Link } from "react-router-dom";
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

export default function Index() {
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
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md grid place-items-center" style={{ background: "var(--gradient-primary)" }}>
            <TrendingUp className="h-4 w-4 text-background" />
          </div>
          <div>
            <div className="font-semibold tracking-tight leading-none">OPTI-X</div>
            <div className="text-[10px] text-muted-foreground font-mono mt-1">OPTIONS · INTELLIGENCE</div>
          </div>
        </div>
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
              <div className="absolute -inset-px rounded-xl pointer-events-none" style={{ background: "linear-gradient(135deg, hsl(165 90% 50% / 0.4), transparent 40%, hsl(280 85% 65% / 0.3))", maskImage: "linear-gradient(black,black)", WebkitMaskComposite: "xor", padding: 1 }} />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-bear" />
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  <span className="h-2 w-2 rounded-full bg-bull" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider">SPY · 0DTE · GEX</span>
              </div>

              <div className="font-mono text-xs space-y-1.5">
                <Row k="Spot"        v="612.34"  tone="default"/>
                <Row k="Zero Γ"      v="608.50"  tone="warn"/>
                <Row k="Call Wall"   v="615.00"  tone="bull"/>
                <Row k="Put Wall"    v="600.00"  tone="bear"/>
                <Row k="Net GEX"     v="+2.84B"  tone="bull"/>
                <Row k="IV Rank"     v="34"      tone="default"/>
              </div>

              {/* sparkline */}
              <svg viewBox="0 0 200 60" className="w-full h-16 mt-5">
                <defs>
                  <linearGradient id="spk" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(165 90% 50%)" stopOpacity="0.5"/>
                    <stop offset="100%" stopColor="hsl(165 90% 50%)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M0,40 L20,32 L40,38 L60,24 L80,28 L100,18 L120,22 L140,12 L160,18 L180,8 L200,14 L200,60 L0,60 Z" fill="url(#spk)"/>
                <path d="M0,40 L20,32 L40,38 L60,24 L80,28 L100,18 L120,22 L140,12 L160,18 L180,8 L200,14" fill="none" stroke="hsl(165 90% 50%)" strokeWidth="1.5"/>
              </svg>

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
