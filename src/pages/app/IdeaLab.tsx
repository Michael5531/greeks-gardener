import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { useBuyerIdeas, BuyerIdeaRow } from "@/hooks/useBuyerIdeas";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

function pct(n: number | null | undefined, d = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(d)}%`;
}
function num(n: number | null | undefined, d = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function ScoreBar({ value, max }: { value: number; max: number }) {
  const w = Math.max(2, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-1.5 w-24 bg-muted overflow-hidden">
      <div className="h-full bg-primary" style={{ width: `${w}%` }} />
    </div>
  );
}

function BiasChip({ bias }: { bias: BuyerIdeaRow["bias"] }) {
  const map = {
    "long-call": { label: "LONG CALL", tone: "text-bull border-bull/30" },
    "long-put": { label: "LONG PUT", tone: "text-bear border-bear/30" },
    "neutral": { label: "STRADDLE", tone: "text-primary border-primary/30" },
  } as const;
  const c = map[bias];
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 border text-[10px] font-mono uppercase tracking-[0.15em]",
      c.tone,
    )}>
      {c.label}
    </span>
  );
}

export default function IdeaLab() {
  const [tab, setTab] = useState<"directional" | "vol" | "0dte">("directional");
  const nav = useNavigate();
  const { data, loading, error, refetch } = useBuyerIdeas();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const maxScore = rows.reduce((m, r) => Math.max(m, r.score), 0);

  function openBuilder(row: BuyerIdeaRow) {
    const dir = row.bias === "long-put" ? "short" : row.bias === "neutral" ? "neutral" : "long";
    const move = row.bias === "long-put" ? -0.05 : row.bias === "long-call" ? 0.05 : 0;
    const target = +(row.spot * (1 + move)).toFixed(2);
    const sp = new URLSearchParams({
      ticker: row.ticker,
      direction: dir,
      target: String(target),
      days: "14",
    });
    nav(`/app/trade-builder?${sp.toString()}`);
  }

  return (
    <div className="px-6 md:px-10 py-8 space-y-10 max-w-[1480px] mx-auto">
      <PageHeader
        tag={<span>№06 — STRATEGY · IDEA LAB</span>}
        title={<>Today's setups<span className="text-primary">.</span></>}
        subtitle="买方视角：扫描低 IV + 动量 + 流动性，给出可执行的 long-premium 候选。"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading} className="font-mono text-[11px] uppercase tracking-[0.15em] gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Rescan
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="bg-transparent border border-border p-0 h-auto rounded-none">
          <TabsTrigger value="directional" className="rounded-none font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Directional · Long Premium
          </TabsTrigger>
          <TabsTrigger value="vol" disabled className="rounded-none font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2">
            Vol · Pre-Earnings · soon
          </TabsTrigger>
          <TabsTrigger value="0dte" disabled className="rounded-none font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2">
            0DTE / Gamma · soon
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div className="border border-destructive/40 text-destructive p-4 text-sm font-mono">{error}</div>
      )}

      {loading && !data && (
        <div className="border border-border p-12 text-center text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">
          Scanning universe…
        </div>
      )}

      {data && (
        <section className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="text-left">
                {["#", "Ticker", "Spot", "5d", "20d", "RSI14", "IVR", "IV30", "HV20", "IV-HV", "Bias", "Score", ""].map(h => (
                  <th key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.ticker} className="border-b border-border/60 hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-3 font-mono text-[12px] tracking-wider">{r.ticker}</td>
                  <td className="px-3 py-3 font-serif-display text-base tabular-nums">${num(r.spot)}</td>
                  <td className={cn("px-3 py-3 font-mono text-[12px] tabular-nums", r.ret5 >= 0 ? "text-bull" : "text-bear")}>
                    <span className="inline-flex items-center gap-1">
                      {r.ret5 >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {pct(r.ret5)}
                    </span>
                  </td>
                  <td className={cn("px-3 py-3 font-mono text-[12px] tabular-nums", r.ret20 >= 0 ? "text-bull" : "text-bear")}>
                    {pct(r.ret20)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums">{num(r.rsi14, 0)}</td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums">
                    {r.ivr != null ? (
                      <span className={cn(
                        r.ivr < 30 ? "text-bull" : r.ivr > 70 ? "text-bear" : "text-foreground",
                      )}>{r.ivr}</span>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums">{pct(r.iv30, 0)}</td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums">{pct(r.hv20, 0)}</td>
                  <td className={cn(
                    "px-3 py-3 font-mono text-[12px] tabular-nums",
                    r.ivHvSpread == null ? "" :
                    r.ivHvSpread > 0.02 ? "text-bear" :
                    r.ivHvSpread < -0.02 ? "text-bull" : "",
                  )}>{pct(r.ivHvSpread, 1)}</td>
                  <td className="px-3 py-3"><BiasChip bias={r.bias} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] tabular-nums w-8">{r.score.toFixed(0)}</span>
                      <ScoreBar value={r.score} max={maxScore} />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => openBuilder(r)}
                      className="font-serif-display italic text-sm text-primary hover:text-foreground transition-colors inline-flex items-center gap-1"
                    >
                      Build <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={13} className="py-12 text-center text-muted-foreground font-serif-display italic">No candidates.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="text-[11px] text-muted-foreground font-mono uppercase tracking-[0.15em]">
        Score = (50 − IVR) + |20d return|×200 + alignment + |5d|×150.
        IVR shown only after ≥20 days of history is collected per ticker.
      </section>
    </div>
  );
}