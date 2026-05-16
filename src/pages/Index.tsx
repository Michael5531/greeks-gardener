import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowRight, Zap, Sparkles, ShieldCheck, Activity, BarChart3, LineChart, Layers, Radar, Boxes } from "lucide-react";
import { useT } from "@/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

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

const moduleIcons = [Activity, BarChart3, Layers, LineChart, Radar, Boxes];

const GEX_DATA: Record<string, { spot: number; zeroG: number; strikes: { k: number; gex: number }[] }> = {
  SPY: { spot: 612.34, zeroG: 608.5, strikes: [
    { k: 595, gex: -1.8 }, { k: 600, gex: -2.6 }, { k: 605, gex: -1.2 },
    { k: 610, gex: 0.4 }, { k: 612, gex: 1.1 }, { k: 615, gex: 3.2 },
    { k: 620, gex: 2.4 }, { k: 625, gex: 1.6 }, { k: 630, gex: 0.7 },
  ]},
  QQQ: { spot: 548.91, zeroG: 545.0, strikes: [
    { k: 530, gex: -1.4 }, { k: 535, gex: -2.1 }, { k: 540, gex: -0.9 },
    { k: 545, gex: 0.3 }, { k: 548, gex: 0.9 }, { k: 550, gex: 2.6 },
    { k: 555, gex: 1.9 }, { k: 560, gex: 1.1 }, { k: 565, gex: 0.5 },
  ]},
  NVDA: { spot: 184.22, zeroG: 180.0, strikes: [
    { k: 170, gex: -0.9 }, { k: 175, gex: -1.6 }, { k: 180, gex: -0.4 },
    { k: 182, gex: 0.5 }, { k: 185, gex: 1.4 }, { k: 190, gex: 2.8 },
    { k: 195, gex: 1.7 }, { k: 200, gex: 1.0 }, { k: 205, gex: 0.4 },
  ]},
  TSLA: { spot: 412.07, zeroG: 418.0, strikes: [
    { k: 395, gex: -2.2 }, { k: 400, gex: -3.1 }, { k: 405, gex: -1.8 },
    { k: 410, gex: -0.6 }, { k: 415, gex: 0.4 }, { k: 420, gex: 1.5 },
    { k: 425, gex: 1.1 }, { k: 430, gex: 0.7 }, { k: 435, gex: 0.3 },
  ]},
};

export default function Index() {
  const t = useT();
  const stats = [
    { v: "8K+",    l: t.home.stats.tickers,   k: "Coverage",  src: "Polygon.io · 全美股标的" },
    { v: "1M+",    l: t.home.stats.contracts, k: "Contracts", src: "OPRA · 实时合约覆盖" },
    { v: "<120ms", l: t.home.stats.latency,   k: "Latency",   src: "端到端中位延时" },
    { v: "24/7",   l: t.home.stats.uptime,    k: "Uptime",    src: "数据流持续守护" },
  ];
  const [gexTicker, setGexTicker] = useState<keyof typeof GEX_DATA>("SPY");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gex = GEX_DATA[gexTicker];
  const maxAbs = useMemo(() => Math.max(...gex.strikes.map(s => Math.abs(s.gex))), [gex]);
  const callWall = useMemo(() => gex.strikes.reduce((a, b) => (b.gex > a.gex ? b : a)).k, [gex]);
  const putWall = useMemo(() => gex.strikes.reduce((a, b) => (b.gex < a.gex ? b : a)).k, [gex]);
  const netGex = useMemo(() => gex.strikes.reduce((s, x) => s + x.gex, 0), [gex]);
  const active = hoverIdx != null ? gex.strikes[hoverIdx] : null;

  const serif = { fontFamily: "'Noto Serif SC', 'Instrument Serif', serif" };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Top live tape — editorial cap rule */}
      <div id="tape" className="border-b border-border/60 bg-card/40 overflow-hidden">
        <div className="flex gap-12 py-3 animate-[scroll_50s_linear_infinite] whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.15em]">
          {[...tape, ...tape, ...tape].map((x, i) => (
            <span key={i} className="flex items-center gap-2 shrink-0 text-muted-foreground">
              <span className="text-foreground font-medium">{x.s}</span>
              <span className="tabular-nums">{x.p.toFixed(2)}</span>
              <span className={`tabular-nums ${x.c >= 0 ? "text-bull" : "text-bear"}`}>
                {x.c >= 0 ? "+" : ""}{x.c.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
        <style>{`@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-33.333%)}}`}</style>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
        {/* NAV — bottom-aligned, editorial masthead */}
        <header className="flex items-end justify-between pt-10 pb-20">
          <Link to="/" className="flex flex-col">
            <span className="text-xl font-semibold tracking-[-0.04em] leading-none">OPTI·X</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mt-1.5">Options Intelligence</span>
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm text-muted-foreground">
            <a href="#modules" className="hover:text-foreground transition-colors">{t.home.nav.modules}</a>
            <a href="#tape" className="hover:text-foreground transition-colors">{t.home.nav.market}</a>
            <a href="#about" className="hover:text-foreground transition-colors">{t.home.aboutTag}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link to="/auth">
              <Button size="sm" className="rounded-sm font-medium">
                {t.home.nav.launch} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </header>

        {/* HERO — editorial split */}
        <section className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start pb-28">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                Polygon.io · {t.home.livePill}
              </span>
            </div>
            <h1 style={serif} className="text-[clamp(3rem,9vw,7.5rem)] font-black leading-[0.92] tracking-[-0.02em]">
              <span className="block">{t.home.heroPre} {t.home.heroEm}</span>
              <span className="block italic text-primary">{t.home.heroPost} {t.home.heroPostBefore}{t.home.heroPostEnd}</span>
            </h1>
            <p className="mt-10 max-w-md text-lg leading-relaxed text-muted-foreground border-l-2 border-foreground/80 pl-6">
              {t.home.heroBody}
            </p>
            <div className="mt-12 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="h-12 px-8 rounded-sm text-sm font-medium">
                  {t.home.cta} <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#modules">
                <Button size="lg" variant="outline" className="h-12 px-8 rounded-sm text-sm font-medium">
                  {t.home.explore}
                </Button>
              </a>
            </div>
          </div>

          {/* Floating editorial card */}
          <div className="lg:col-span-5 relative">
            <div className="relative bg-card border border-border/60 p-6 rounded-md shadow-[40px_40px_80px_-20px_hsl(var(--foreground)/0.08)]">
              <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-6">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-bear/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-bull/70" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{gexTicker} · {t.home.cardTag}</span>
              </div>

              <div className="flex gap-1 mb-5">
                {(Object.keys(GEX_DATA) as Array<keyof typeof GEX_DATA>).map(tk => (
                  <button key={tk} onClick={() => { setGexTicker(tk); setHoverIdx(null); }}
                    className={`flex-1 text-[10px] font-mono uppercase tracking-[0.15em] py-1.5 rounded-sm transition-colors ${
                      gexTicker === tk ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {tk}
                  </button>
                ))}
              </div>

              <div className="relative h-40 mb-5">
                <svg viewBox="0 0 320 160" className="w-full h-full" preserveAspectRatio="none">
                  <line x1="0" y1="80" x2="320" y2="80" stroke="hsl(var(--border))" strokeDasharray="2 2" />
                  {(() => {
                    const xs = gex.strikes.length;
                    const spotIdx = gex.strikes.findIndex((s, i) =>
                      i === xs - 1 || (gex.spot >= s.k && gex.spot < gex.strikes[i + 1].k)
                    );
                    const bw = 320 / xs;
                    const next = gex.strikes[Math.min(spotIdx + 1, xs - 1)].k - gex.strikes[spotIdx].k || 1;
                    const sx = (spotIdx + 0.5) * bw + ((gex.spot - gex.strikes[spotIdx].k) / next) * bw;
                    return <line x1={sx} y1="0" x2={sx} y2="160" stroke="hsl(var(--foreground))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />;
                  })()}
                  {gex.strikes.map((s, i) => {
                    const bw = 320 / gex.strikes.length;
                    const x = i * bw + bw * 0.15;
                    const w = bw * 0.7;
                    const h = (Math.abs(s.gex) / maxAbs) * 70;
                    const y = s.gex >= 0 ? 80 - h : 80;
                    const isHover = hoverIdx === i;
                    return (
                      <rect key={i} x={x} y={y} width={w} height={h}
                        fill={s.gex >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))"}
                        opacity={hoverIdx == null || isHover ? 0.9 : 0.3}
                        className="transition-opacity cursor-pointer"
                        onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
                    );
                  })}
                </svg>
                {active && (
                  <div className="absolute top-1 right-1 px-2 py-1 rounded-sm bg-popover border border-border text-[10px] font-mono pointer-events-none">
                    <div className="text-muted-foreground">K {active.k}</div>
                    <div className={active.gex >= 0 ? "text-bull" : "text-bear"}>
                      {active.gex >= 0 ? "+" : ""}{active.gex.toFixed(2)}B
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 font-mono text-[11px]">
                <Row k="Spot"      v={gex.spot.toFixed(2)} />
                <Row k="Zero Γ"    v={gex.zeroG.toFixed(2)} />
                <Row k="Call Wall" v={callWall.toFixed(2)} tone="bull" />
                <Row k="Put Wall"  v={putWall.toFixed(2)}  tone="bear" />
                <div className="flex justify-between pt-2">
                  <span className="text-muted-foreground uppercase tracking-[0.15em]">Net GEX</span>
                  <span className={`tabular-nums font-bold text-base ${netGex >= 0 ? "text-bull" : "text-bear"}`}>
                    {netGex >= 0 ? "+" : ""}{netGex.toFixed(2)}B
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/60 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
                <span>09:30 ET</span>
                <span className="flex items-center gap-1 text-bull"><Zap className="h-3 w-3"/> LIVE</span>
                <span>16:00 ET</span>
              </div>
            </div>
            {/* decorative circle */}
            <div className="absolute -z-10 -bottom-10 -right-10 w-72 h-72 rounded-full border border-foreground/[0.06]" />
          </div>
        </section>

        {/* METRICS — paper footer strip */}
        <section id="stats" className="grid grid-cols-2 md:grid-cols-4 border-t border-border pb-32">
          {stats.map((s, i) => (
            <div key={s.l} className={`pt-10 pb-2 ${i !== 0 ? "md:pl-8 md:border-l border-border/60" : ""} ${i === 1 ? "pl-6 border-l border-border/60 md:pl-8" : ""} ${i >= 2 ? "pt-8" : ""}`}>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-3">{s.k}</div>
              <div style={serif} className="text-5xl md:text-6xl font-black tracking-[-0.03em] tabular-nums mb-4">{s.v}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground leading-relaxed">{s.l}</div>
              <div className="text-[10px] font-mono text-muted-foreground/60 mt-2">{s.src}</div>
            </div>
          ))}
        </section>

        {/* MODULES — editorial grid */}
        <section id="modules" className="pb-32 border-t border-border pt-20">
          <div className="grid lg:grid-cols-12 gap-10 mb-16">
            <div className="lg:col-span-7">
              <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary mb-4 flex items-center gap-2">
                <Sparkles className="h-3 w-3" /> {t.home.sectionTag}
              </div>
              <h2 style={serif} className="text-5xl md:text-7xl font-black leading-[0.95] tracking-[-0.02em]">
                {t.home.sectionTitle1}<br/>
                <span className="italic text-muted-foreground">{t.home.sectionTitle2}</span>
              </h2>
            </div>
            <p className="lg:col-span-5 text-muted-foreground text-base leading-relaxed self-end border-l-2 border-foreground/80 pl-6">
              {t.home.sectionDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/60 border border-border/60">
            {t.home.modules.map((m, i) => {
              const Icon = moduleIcons[i] ?? Activity;
              const k = String(i + 1).padStart(2, "0");
              return (
                <article key={i} className="group relative bg-background p-8 min-h-[240px] flex flex-col transition-colors hover:bg-card">
                  <div className="flex items-start justify-between mb-10">
                    <Icon className="h-5 w-5 text-foreground/80" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{k} / {String(t.home.modules.length).padStart(2,"0")}</span>
                  </div>
                  <h3 style={serif} className="text-2xl font-bold tracking-[-0.02em] mb-3 leading-tight">{m.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{m.d}</p>
                  <ArrowUpRight className="absolute bottom-6 right-6 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
                </article>
              );
            })}
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="pb-24 border-t border-border pt-20 grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary mb-4 flex items-center gap-2">
              <ShieldCheck className="h-3 w-3" /> {t.home.aboutTag}
            </div>
            <h2 style={serif} className="text-4xl md:text-5xl font-black leading-[1.02] tracking-[-0.02em]">
              {t.home.aboutTitle}
            </h2>
          </div>
          <div className="lg:col-span-7 space-y-8">
            <p className="text-lg leading-relaxed text-muted-foreground first-letter:float-left first-letter:text-6xl first-letter:font-black first-letter:mr-3 first-letter:mt-1 first-letter:leading-none first-letter:text-foreground" style={{ ...serif as any }}>
              {t.home.aboutBody}
            </p>
            <div className="border-l-2 border-primary pl-6">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-2">{t.home.aboutMission}</div>
              <p className="text-base leading-relaxed">{t.home.aboutMissionBody}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {t.home.aboutPrinciples.map((p, i) => (
                  <span key={i} className="text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1 border border-border text-muted-foreground">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-32">
          <div className="border-y-2 border-foreground py-16 md:py-20 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-4">{t.home.ctaTag}</div>
              <h3 style={serif} className="text-4xl md:text-6xl font-black tracking-[-0.02em] leading-[0.95]">
                {t.home.ctaTitle1}{t.home.ctaTitle2}<span className="italic text-primary">{t.home.ctaTitle3}</span>{t.home.ctaTitle4}
              </h3>
            </div>
            <Link to="/auth">
              <Button size="lg" className="h-14 px-8 rounded-sm text-sm font-medium shrink-0">
                {t.home.ctaBtn} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-border">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          <div>{t.home.footerCopy}</div>
          <div>{t.home.footerNote}</div>
        </div>
      </footer>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "bull" | "bear" }) {
  const cls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-dotted border-border/60 pb-1.5">
      <span className="text-muted-foreground uppercase tracking-[0.15em]">{k}</span>
      <span className={`tabular-nums font-medium ${cls}`}>{v}</span>
    </div>
  );
}
