import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import TickerSearch from "@/components/TickerSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBuildTrade, BuiltStructure } from "@/hooks/useBuildTrade";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { Loader2, Sparkles, ArrowDown, ArrowUp, Minus, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function pct(n: number | null | undefined, d = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(d)}%`;
}
function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}
function strikeStr(L: BuiltStructure["legs"][number]) {
  return `${L.side === "long" ? "+" : "−"}${L.type[0].toUpperCase()} ${L.strike}`;
}

function DirChip({ value, onChange }: { value: "long" | "short" | "neutral"; onChange: (v: any) => void }) {
  const opts = [
    { v: "long", label: "BULLISH", icon: ArrowUp, tone: "text-bull border-bull/30 data-[on=true]:bg-bull/10" },
    { v: "short", label: "BEARISH", icon: ArrowDown, tone: "text-bear border-bear/30 data-[on=true]:bg-bear/10" },
    { v: "neutral", label: "VOL / NEUTRAL", icon: Minus, tone: "text-primary border-primary/30 data-[on=true]:bg-primary/10" },
  ] as const;
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button
          key={o.v}
          type="button"
          data-on={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 border font-mono text-[11px] uppercase tracking-[0.15em] transition-colors",
            o.tone,
            value === o.v ? "" : "text-muted-foreground border-border hover:text-foreground",
          )}
        >
          <o.icon className="h-3.5 w-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StructureCard({ s, spot, best }: { s: BuiltStructure; spot: number; best: boolean }) {
  const netDebit = s.cost > 0;
  function save() {
    try {
      const key = "optix.tradeIdeas";
      const arr = JSON.parse(localStorage.getItem(key) ?? "[]");
      arr.unshift({ ...s, savedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 50)));
      toast.success(`Saved · ${s.name}`, { description: "Positions Tracker 下一轮上线，先存本地草稿" });
    } catch { toast.error("Save failed"); }
  }
  return (
    <div className={cn(
      "border border-border p-5 space-y-4 hover:bg-secondary/30 transition-colors relative",
      best && "border-primary bg-primary/5",
    )}>
      {best && (
        <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-mono uppercase tracking-[0.2em] px-2 py-0.5">
          Top EV
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="editorial-eyebrow mb-1">{s.expiration}</div>
          <h3 className="font-serif-display text-2xl">{s.name}</h3>
        </div>
        <button
          onClick={save}
          className="text-muted-foreground hover:text-primary transition-colors p-1"
          title="Save draft"
        >
          <Bookmark className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground font-serif-display italic leading-snug">{s.rationale}</p>

      {/* Legs */}
      <div className="border-y border-border/60 py-2 space-y-1">
        {s.legs.map((L, i) => (
          <div key={i} className="flex justify-between font-mono text-[11px] tabular-nums">
            <span className={L.side === "long" ? "text-foreground" : "text-muted-foreground"}>{strikeStr(L)}</span>
            <span className="text-muted-foreground">
              mid ${L.mid.toFixed(2)} · iv {(L.iv * 100).toFixed(1)}% · Δ {L.delta.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <div className="editorial-eyebrow">{netDebit ? "Debit (cost)" : "Credit"}</div>
          <div className="font-serif-display text-xl tabular-nums">${Math.abs(s.cost).toFixed(0)}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">Expected Value</div>
          <div className={cn("font-serif-display text-xl tabular-nums",
            (s.ev ?? 0) > 0 ? "text-bull" : "text-bear")}>{money(s.ev)}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">@ Target</div>
          <div className={cn("font-mono text-base tabular-nums",
            s.profitAtTarget >= 0 ? "text-bull" : "text-bear")}>{money(s.profitAtTarget)}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">POP</div>
          <div className="font-mono text-base tabular-nums">{s.pop != null ? `${(s.pop * 100).toFixed(0)}%` : "—"}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">Max Profit</div>
          <div className="font-mono text-sm tabular-nums">{s.maxProfit == null ? "∞" : money(s.maxProfit)}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">Max Loss</div>
          <div className="font-mono text-sm tabular-nums text-bear">{money(s.maxLoss)}</div>
        </div>
        <div>
          <div className="editorial-eyebrow">Theta / day</div>
          <div className={cn("font-mono text-sm tabular-nums", s.theta >= 0 ? "text-bull" : "text-bear")}>
            {money(s.theta)}
          </div>
        </div>
        <div>
          <div className="editorial-eyebrow">Breakevens</div>
          <div className="font-mono text-sm tabular-nums truncate">
            {s.breakevens.length ? s.breakevens.map(b => `$${b.toFixed(0)}`).join(" / ") : "—"}
          </div>
        </div>
      </div>

      {/* Required move bar */}
      {s.breakevens.length > 0 && (
        <div className="pt-2 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Required move from ${spot.toFixed(2)}
          </div>
          <div className="flex gap-2">
            {s.breakevens.map((b, i) => {
              const m = (b - spot) / spot;
              return (
                <span key={i} className={cn(
                  "px-2 py-0.5 border font-mono text-[10px] tabular-nums",
                  Math.abs(m) > 0.1 ? "border-bear/40 text-bear" : "border-border text-muted-foreground",
                )}>
                  {m >= 0 ? "+" : ""}{(m * 100).toFixed(1)}%
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TradeBuilder() {
  const [params, setParams] = useSearchParams();
  const [ticker, setTicker] = useState(params.get("ticker") ?? "");
  const [direction, setDirection] = useState<"long" | "short" | "neutral">(
    (params.get("direction") as any) ?? "long");
  const [target, setTarget] = useState(params.get("target") ?? "");
  const [days, setDays] = useState(params.get("days") ?? "14");
  const [budget, setBudget] = useState("");

  const { quote } = useLiveQuote(ticker || null, 30_000);
  const spot = quote?.price ?? null;

  const build = useBuildTrade();

  // Auto-prefill target from spot when ticker changes (if empty)
  useEffect(() => {
    if (!target && spot) {
      const m = direction === "short" ? -0.05 : direction === "neutral" ? 0 : 0.05;
      setTarget((spot * (1 + m)).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, direction, ticker]);

  function submit() {
    const t = ticker.trim().toUpperCase();
    const tg = Number(target);
    const d = Number(days);
    if (!t || !Number.isFinite(tg) || !Number.isFinite(d)) {
      toast.error("Fill ticker · target · days");
      return;
    }
    setParams({ ticker: t, direction, target: String(tg), days: String(d) }, { replace: true });
    build.mutate({
      ticker: t,
      direction,
      target: tg,
      days: d,
      budget: budget ? Number(budget) : null,
    }, {
      onError: (e: any) => toast.error(e.message ?? "Build failed"),
    });
  }

  const errorMessage = build.error ? (build.error as Error).message : null;

  // Auto-build on first load if URL has all params
  useEffect(() => {
    if (ticker && target && days && !build.data && !build.isPending) {
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = build.data;
  const topEv = useMemo(() =>
    result?.structures.reduce((m, s) => (s.ev ?? -Infinity) > (m?.ev ?? -Infinity) ? s : m, undefined as BuiltStructure | undefined),
    [result]);

  return (
    <div className="px-6 md:px-10 py-8 space-y-10 max-w-[1480px] mx-auto">
      <PageHeader
        tag={<span>№07 — STRATEGY · TRADE BUILDER</span>}
        title={<>From intent to trade<span className="text-primary">.</span></>}
        subtitle="说出你的看法，系统给出 6 种结构的 EV · POP · 退出计划，挑一个最优。"
      />

      {/* Intent form */}
      <section className="border border-border p-6 space-y-5 bg-secondary/20">
        <div className="grid md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <Label className="editorial-eyebrow mb-2 block">Underlying</Label>
            <TickerSearch current={ticker || undefined} onSelect={t => setTicker(t.ticker)} />
            {spot && <div className="mt-2 text-[11px] font-mono text-muted-foreground tabular-nums">Spot ${spot.toFixed(2)}</div>}
          </div>
          <div className="md:col-span-8">
            <Label className="editorial-eyebrow mb-2 block">Direction</Label>
            <DirChip value={direction} onChange={setDirection} />
          </div>

          <div className="md:col-span-3">
            <Label className="editorial-eyebrow mb-2 block">Target price ($)</Label>
            <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 240" />
          </div>
          <div className="md:col-span-3">
            <Label className="editorial-eyebrow mb-2 block">Horizon (days)</Label>
            <Input value={days} onChange={e => setDays(e.target.value)} placeholder="14" />
          </div>
          <div className="md:col-span-3">
            <Label className="editorial-eyebrow mb-2 block">Budget (optional $)</Label>
            <Input value={budget} onChange={e => setBudget(e.target.value)} placeholder="500" />
          </div>
          <div className="md:col-span-3">
            <Button onClick={submit} disabled={build.isPending} className="w-full gap-2 font-mono text-[11px] uppercase tracking-[0.2em] h-10">
              {build.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Compare Structures
            </Button>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="border border-border bg-secondary/20 text-muted-foreground p-4 text-sm font-mono">
          {errorMessage}
        </div>
      )}

      {result?.fallback && (
        <div className="border border-primary/30 bg-primary/5 text-primary p-4 text-sm font-mono">
          {result.warning ?? "实时期权链不可用，当前结果使用理论定价模式生成。"}
        </div>
      )}

      {/* Result header */}
      {result && (
        <section className="space-y-2 border-b border-border pb-4">
          <div className="editorial-eyebrow">Result · {result.ticker}</div>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <span className="text-muted-foreground text-[11px] font-mono uppercase tracking-[0.15em] mr-2">Spot</span>
              <span className="font-serif-display text-2xl tabular-nums">${result.spot.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] font-mono uppercase tracking-[0.15em] mr-2">Target</span>
              <span className="font-serif-display text-2xl tabular-nums text-primary">${result.target.toFixed(2)}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                ({((result.target / result.spot - 1) * 100).toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] font-mono uppercase tracking-[0.15em] mr-2">Expiry</span>
              <span className="font-mono text-base tabular-nums">{result.expiration} ({result.dte}d)</span>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px] font-mono uppercase tracking-[0.15em] mr-2">IV30</span>
              <span className="font-mono text-base tabular-nums">{pct(result.iv30)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Cards */}
      {result && (
        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.structures.map(s => (
            <StructureCard key={s.name} s={s} spot={result.spot} best={s === topEv} />
          ))}
        </section>
      )}

      {!result && !build.isPending && (
        <section className="border border-dashed border-border p-12 text-center text-muted-foreground space-y-2">
          <Sparkles className="h-6 w-6 mx-auto opacity-60" />
          <p className="font-serif-display italic text-lg">填上意图，按 Compare Structures。</p>
          <p className="text-[11px] font-mono uppercase tracking-[0.15em]">
            EV / POP 基于 lognormal Monte-Carlo · 2000 paths
          </p>
        </section>
      )}
    </div>
  );
}