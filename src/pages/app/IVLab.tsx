import { useMemo } from "react";
import TickerSearch from "@/components/TickerSearch";
import PageHeader from "@/components/PageHeader";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { useComputeIVMetrics } from "@/hooks/useComputeIVMetrics";
import { fmtPct } from "@/lib/optionUtils";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, BarChart, Bar, Cell,
} from "recharts";

function MetricCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-r border-border p-5">
      <div className="editorial-eyebrow mb-2">{label}</div>
      <div className="font-serif-display text-4xl tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1 font-mono">{hint}</div>}
    </div>
  );
}

function RankBar({ value }: { value: number | null }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone =
    value == null ? "bg-muted" :
    v > 75 ? "bg-red-500" :
    v > 50 ? "bg-primary" :
    v > 25 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="h-2 bg-muted overflow-hidden">
      <div className={`h-full ${tone} transition-all`} style={{ width: `${v}%` }} />
    </div>
  );
}

export default function IVLab() {
  const [ticker, setTicker] = useSelectedTicker();
  const { data, loading } = useComputeIVMetrics(ticker || null);

  const termChart = useMemo(() => (data?.term ?? []).map(t => ({
    dte: t.dte,
    iv: +(t.iv * 100).toFixed(2),
    label: t.exp.slice(5),
  })), [data]);

  const hvVsIv = useMemo(() => {
    if (!data) return [];
    const rows: any[] = [];
    if (data.hv.hv20 != null) rows.push({ k: "HV20", v: +(data.hv.hv20 * 100).toFixed(2), tone: "hv" });
    if (data.hv.hv30 != null) rows.push({ k: "HV30", v: +(data.hv.hv30 * 100).toFixed(2), tone: "hv" });
    if (data.hv.hv60 != null) rows.push({ k: "HV60", v: +(data.hv.hv60 * 100).toFixed(2), tone: "hv" });
    if (data.iv30 != null) rows.push({ k: "IV30", v: +(data.iv30 * 100).toFixed(2), tone: "iv" });
    return rows;
  }, [data]);

  return (
    <div className="px-6 md:px-10 py-8 space-y-10 max-w-[1400px] mx-auto">
      <PageHeader
        tag={<span>№05 — ANALYTICS · IV LAB</span>}
        title={<>IV / HV<span className="text-primary">.</span></>}
        subtitle="隐含波动率结构、历史波动率对比、偏度与 IV Rank。"
        actions={
          <div className="w-[360px]">
            <TickerSearch current={ticker || undefined} onSelect={t => setTicker(t.ticker)} />
          </div>
        }
      />

      {!ticker && (
        <div className="border border-border p-12 text-center text-muted-foreground font-serif-display italic text-xl">
          Select an underlying to begin.
        </div>
      )}

      {ticker && loading && (
        <div className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">Computing…</div>
      )}

      {ticker && data && (
        <>
          {/* Hero metric grid */}
          <section className="border-t border-l border-border">
            <div className="grid grid-cols-2 md:grid-cols-4">
              <MetricCell
                label="IV30"
                value={data.iv30 != null ? fmtPct(data.iv30) : "—"}
                hint={data.spot ? `Spot $${data.spot.toFixed(2)}` : undefined}
              />
              <MetricCell
                label="HV30"
                value={data.hv.hv30 != null ? fmtPct(data.hv.hv30) : "—"}
                hint="Annualised, 30d log-returns"
              />
              <MetricCell
                label="IV − HV Spread"
                value={data.ivHvSpread != null ? fmtPct(data.ivHvSpread) : "—"}
                hint={
                  data.ivHvSpread == null ? undefined :
                  data.ivHvSpread > 0.03 ? "Options rich · short premium edge" :
                  data.ivHvSpread < -0.03 ? "Options cheap · long premium edge" :
                  "Fairly priced"
                }
              />
              <MetricCell
                label="25Δ Risk Reversal"
                value={data.skew.rr25 != null ? `${(data.skew.rr25 * 100).toFixed(2)}pp` : "—"}
                hint={
                  data.skew.rr25 == null ? undefined :
                  data.skew.rr25 > 0 ? "Calls bid over puts" :
                  "Puts bid over calls (downside skew)"
                }
              />
            </div>
          </section>

          {/* IV Rank gauge */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif-display text-2xl">
                <span className="editorial-eyebrow mr-3">№01</span>
                IV Rank
              </h2>
              <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                {data.historyDays >= 20
                  ? `${data.historyDays} days history`
                  : `building history · ${data.historyDays}/20 days`}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="editorial-eyebrow">IV Rank (52w)</span>
                  <span className="font-serif-display text-3xl tabular-nums">
                    {data.ivRank != null ? data.ivRank.toFixed(0) : "—"}
                  </span>
                </div>
                <RankBar value={data.ivRank} />
                <div className="text-[11px] text-muted-foreground font-mono">
                  Where current IV sits between the 52-week min &amp; max.
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="editorial-eyebrow">IV Percentile</span>
                  <span className="font-serif-display text-3xl tabular-nums">
                    {data.ivPercentile != null ? data.ivPercentile.toFixed(0) : "—"}
                  </span>
                </div>
                <RankBar value={data.ivPercentile} />
                <div className="text-[11px] text-muted-foreground font-mono">
                  % of past days that closed with lower IV than today.
                </div>
              </div>
            </div>
          </section>

          {/* IV vs HV bars */}
          <section className="space-y-3">
            <h2 className="font-serif-display text-2xl">
              <span className="editorial-eyebrow mr-3">№02</span>
              IV vs Realised Vol
            </h2>
            <div className="h-[260px] border border-border p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hvVsIv}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="k" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(v: any) => [`${v}%`, "Vol"]}
                  />
                  <Bar dataKey="v">
                    {hvVsIv.map((r, i) => (
                      <Cell key={i} fill={r.tone === "iv" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Term structure */}
          <section className="space-y-3">
            <h2 className="font-serif-display text-2xl">
              <span className="editorial-eyebrow mr-3">№03</span>
              IV Term Structure
            </h2>
            <div className="h-[300px] border border-border p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={termChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dte" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    label={{ value: "DTE", position: "insideBottom", offset: -2, fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                    formatter={(v: any, _n, p: any) => [`${v}%`, `IV @ ${p.payload.label}`]}
                  />
                  <ReferenceLine x={30} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "30D", fontSize: 10, fill: "hsl(var(--primary))" }} />
                  <Line type="monotone" dataKey="iv" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Avg IV of options within ±5% of spot, per expiration. Contango = forward IV &gt; near IV; backwardation often precedes events.
            </p>
          </section>

          {/* Skew detail */}
          <section className="space-y-3">
            <h2 className="font-serif-display text-2xl">
              <span className="editorial-eyebrow mr-3">№04</span>
              Skew @ {data.skew.exp ?? "—"}
            </h2>
            <div className="grid md:grid-cols-2 gap-8 border border-border p-6">
              <div>
                <div className="editorial-eyebrow mb-2">25Δ Risk Reversal</div>
                <div className="font-serif-display text-5xl tabular-nums">
                  {data.skew.rr25 != null ? `${(data.skew.rr25 * 100).toFixed(2)}pp` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono">
                  IV(25Δ call) − IV(25Δ put). Negative = fear bid in puts.
                </div>
              </div>
              <div>
                <div className="editorial-eyebrow mb-2">25Δ Butterfly</div>
                <div className="font-serif-display text-5xl tabular-nums">
                  {data.skew.fly25 != null ? `${(data.skew.fly25 * 100).toFixed(2)}pp` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-2 font-mono">
                  Avg wing IV − ATM IV. Higher = more expensive tails.
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}