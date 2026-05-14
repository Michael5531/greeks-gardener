import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import {
  CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis,
} from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import OptionLegsBuilder, { type UILeg } from "@/components/OptionLegsBuilder";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { Download, Play } from "lucide-react";
import { fmt } from "@/lib/optionUtils";

function nyToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
function daysAgoNY(n: number) {
  const d = new Date(Date.now() - n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

export default function SingleTradeSim({ ticker }: { ticker: string }) {
  const { quote } = useLiveQuote(ticker || null, 5000);
  const spot = quote?.price ?? null;
  const { data: chain, expirations } = useOptionsChain(ticker || null);

  const [entryDate, setEntryDate] = useState(daysAgoNY(30));
  const [entryPriceOverride, setEntryPriceOverride] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [r, setR] = useState(0.045);
  const [q, setQ] = useState(0);
  const [ivOverride, setIvOverride] = useState<string>("");

  const [legs, setLegs] = useState<UILeg[]>([]);
  const [running, setRunning] = useState(false);
  const [resp, setResp] = useState<any>(null);

  useEffect(() => { setLegs([]); setResp(null); }, [ticker]);

  const maxExp = useMemo(() => {
    const exps = legs.map(l => l.expiration).filter(Boolean).sort();
    return exps.at(-1) ?? "";
  }, [legs]);

  async function run() {
    if (!ticker || !legs.length || !entryDate) {
      toast.error("请填齐 标的 / 买入日期 / Legs");
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-backtest", {
        body: {
          mode: "single_trade",
          ticker, entry_date: entryDate,
          entry_spot_override: entryPriceOverride !== "" ? +entryPriceOverride : undefined,
          end_date: endDate || maxExp || undefined,
          bs: { r, q, iv: ivOverride !== "" ? +ivOverride / (+ivOverride > 3 ? 100 : 1) : undefined },
          legs: legs.map(l => ({
            type: l.type, side: l.side, strike: l.strike,
            expiration: l.expiration, qty: l.qty, iv: l.iv,
            entry_premium: l.mid,
          })),
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message ?? (data as any).error);
      setResp(data);
      toast.success("推演完成");
    } catch (e: any) {
      toast.error(e.message ?? "推演失败");
    } finally { setRunning(false); }
  }

  function exportCsv() {
    if (!resp?.timeline?.length) return;
    const cols = ["date","spot","net_premium","pnl","delta","gamma","theta","vega"];
    const lines = [cols.join(",")];
    for (const r of resp.timeline) lines.push(cols.map(c => r[c]).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${resp.ticker}_${resp.summary.entry_date}_single_trade.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">单笔合约推演 · What-if</h3>
          <p className="text-[11px] text-muted-foreground">
            指定一个历史买入日期与合约腿，按 Black–Scholes 用 <strong>原始（未复权）</strong>
            日 K 推演直到到期日。Underlying 与期权链/盘面口径一致。
          </p>
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          <Field label={`标的${spot != null ? ` · $${spot.toFixed(2)}` : ""}`}>
            <Input className="font-mono" value={ticker} disabled />
          </Field>
          <Field label="假设买入日期 (NY)">
            <DatePicker value={entryDate} onChange={setEntryDate} />
          </Field>
          <Field label="买入时标的价 · 留空=当日收盘">
            <Input className="font-mono" placeholder="auto" value={entryPriceOverride}
              onChange={e => setEntryPriceOverride(e.target.value)} />
          </Field>
          <Field label={`推演结束 · 默认 ${maxExp || "最远到期"}`}>
            <DatePicker value={endDate} onChange={setEndDate} />
          </Field>
          <Field label="BS · 无风险利率 r">
            <Input type="number" step="0.005" className="font-mono" value={r}
              onChange={e => setR(+e.target.value)} />
          </Field>
          <Field label="BS · 股息率 q">
            <Input type="number" step="0.005" className="font-mono" value={q}
              onChange={e => setQ(+e.target.value)} />
          </Field>
          <Field label="未来 IV 覆写 · 留空=按各 leg IV">
            <Input className="font-mono" placeholder="e.g. 0.45 或 45" value={ivOverride}
              onChange={e => setIvOverride(e.target.value)} />
          </Field>
        </div>

        <OptionLegsBuilder
          ticker={ticker} spot={spot} chain={chain} expirations={expirations}
          legs={legs} onChange={setLegs}
        />

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[11px] text-muted-foreground">
            {legs.length === 0 ? "请添加至少一条 leg" : `${legs.length} 条 leg · 最远到期 ${maxExp}`}
          </div>
          <div className="flex gap-2">
            {resp && (
              <Button size="sm" variant="outline" onClick={exportCsv} className="h-8">
                <Download className="h-3.5 w-3.5 mr-1.5" /> 导出 CSV
              </Button>
            )}
            <Button size="sm" disabled={running || !legs.length} onClick={run} className="h-8">
              <Play className="h-3.5 w-3.5 mr-1.5" /> {running ? "推演中…" : "开始推演"}
            </Button>
          </div>
        </div>
      </div>

      {resp && <ResultPanel resp={resp} />}
    </div>
  );
}

function Field({ label, children }: any) {
  return <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>;
}

function ResultPanel({ resp }: { resp: any }) {
  const tl = resp.timeline ?? [];
  const s = resp.summary ?? {};
  const last = tl.at(-1) ?? {};

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-6 gap-3">
        <Stat label="入场日 / 入场价" value={`${s.entry_date} · $${fmt(s.entry_spot)}`} />
        <Stat label="当前 PnL" value={`$${fmt(s.final_pnl)}`} positive={s.final_pnl >= 0} />
        <Stat label="区间最大 PnL" value={`$${fmt(s.max_pnl)}`} positive={true} />
        <Stat label="区间最小 PnL" value={`$${fmt(s.min_pnl)}`} positive={false} />
        <Stat label="净 Δ / Γ" value={`${fmt(last.delta, 3)} / ${fmt(last.gamma, 4)}`} />
        <Stat label="净 Θ /day · Vega" value={`$${fmt(last.theta)} · $${fmt(last.vega)}`} />
      </div>

      {/* Main chart: PnL (left) + underlying (right) */}
      <div className="rounded-lg border border-border bg-card/40 p-3 h-80">
        <div className="text-[11px] text-muted-foreground mb-1">
          组合 PnL（左轴）vs {resp.ticker} 收盘价（右轴）· 原始未复权
        </div>
        <ChartSizer>
          {({ width, height }) => (
            <ComposedChart width={width} height={height} data={tl}
              margin={{ top: 6, right: 50, left: 8, bottom: 6 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis yAxisId="pnl" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${v}`} />
              <YAxis yAxisId="spot" orientation="right" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <ReferenceLine yAxisId="pnl" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line yAxisId="pnl" type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="组合 PnL ($)" />
              <Line yAxisId="spot" type="monotone" dataKey="spot" stroke="hsl(var(--accent))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name={`${resp.ticker} Close`} />
            </ComposedChart>
          )}
        </ChartSizer>
      </div>

      {/* Greeks evolution */}
      <div className="rounded-lg border border-border bg-card/40 p-3 h-64">
        <div className="text-[11px] text-muted-foreground mb-1">希腊字母演化</div>
        <ChartSizer>
          {({ width, height }) => (
            <LineChart width={width} height={height} data={tl} margin={{ top: 6, right: 50, left: 8, bottom: 6 }}>
              <CartesianGrid stroke="hsl(var(--grid-line))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
              <YAxis yAxisId="dg" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="tv" orientation="right" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Line yAxisId="dg" type="monotone" dataKey="delta" stroke="hsl(var(--primary))" dot={false} name="Δ" />
              <Line yAxisId="dg" type="monotone" dataKey="gamma" stroke="hsl(var(--accent))" dot={false} name="Γ" />
              <Line yAxisId="tv" type="monotone" dataKey="theta" stroke="hsl(var(--bear))" dot={false} name="Θ /day ($)" />
              <Line yAxisId="tv" type="monotone" dataKey="vega" stroke="hsl(var(--bull))" dot={false} name="Vega ($)" />
            </LineChart>
          )}
        </ChartSizer>
      </div>

      {/* Daily detail table */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          每日明细（共 {tl.length} 个交易日）
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="text-muted-foreground bg-secondary/30 sticky top-0">
              <tr>
                <th className="text-left px-3 py-1.5">日期</th>
                <th className="text-right">Spot</th>
                <th className="text-right">净权利金</th>
                <th className="text-right">PnL</th>
                <th className="text-right">Δ</th>
                <th className="text-right">Γ</th>
                <th className="text-right">Θ/day</th>
                <th className="text-right pr-3">Vega</th>
              </tr>
            </thead>
            <tbody>
              {tl.map((row: any) => (
                <tr key={row.date} className="border-t border-border/40">
                  <td className="px-3 py-1">{row.date}</td>
                  <td className="text-right">{fmt(row.spot)}</td>
                  <td className="text-right">{fmt(row.net_premium)}</td>
                  <td className={`text-right ${row.pnl >= 0 ? "text-bull" : "text-bear"}`}>{fmt(row.pnl)}</td>
                  <td className="text-right">{fmt(row.delta, 3)}</td>
                  <td className="text-right">{fmt(row.gamma, 4)}</td>
                  <td className="text-right">{fmt(row.theta)}</td>
                  <td className="text-right pr-3">{fmt(row.vega)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}