import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import TickerSearch from "@/components/TickerSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runHistoricalFlow } from "@/lib/polygon";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";

const today = () => new Date().toISOString().slice(0, 10);
const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export default function Flow() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";

  const [fromDate, setFromDate] = useState(ago(5));
  const [toDate, setToDate] = useState(today());
  const [maxContracts, setMaxContracts] = useState(12);
  const [limitPerContract, setLimitPerContract] = useState(1500);
  const [top, setTop] = useState(10);
  const [minSize, setMinSize] = useState(500);
  const [minPremium, setMinPremium] = useState(100_000);
  const [sweepWindowMs, setSweepWindowMs] = useState(500);
  const [sweepMinLegs, setSweepMinLegs] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!ticker) { toast.error("请先选择标的"); return; }
    setLoading(true);
    try {
      const data = await runHistoricalFlow({
        ticker, from_date: fromDate, to_date: toDate,
        max_contracts: maxContracts, limit_per_contract: limitPerContract, top,
        min_size: minSize, min_premium: minPremium,
        sweep_window_ms: sweepWindowMs, sweep_min_legs: sweepMinLegs,
      });
      setResult(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  const prints: any[] = result?.large_prints ?? [];
  const contracts: any[] = result?.contracts ?? [];
  const sweeps: any[] = result?.sweeps ?? [];

  // scatter data
  const scatterCalls = prints.filter(p => p.type === "call").map(p => ({ x: p.time, y: p.strike, z: p.premium, ...p }));
  const scatterPuts = prints.filter(p => p.type === "put").map(p => ({ x: p.time, y: p.strike, z: p.premium, ...p }));

  // premium histogram
  const histogram = (() => {
    if (!prints.length) return [];
    const bins = 20;
    const max = Math.max(...prints.map(p => p.premium));
    const w = max / bins;
    const out = Array.from({ length: bins }, (_, i) => ({ bin: `${(i * w / 1000).toFixed(0)}K`, count: 0 }));
    for (const p of prints) {
      const i = Math.min(bins - 1, Math.floor(p.premium / w));
      out[i].count++;
    }
    return out;
  })();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">历史期权流</h1>
          <p className="text-sm text-muted-foreground">扫描历史 trades & quotes，标记大单与 sweep 候选</p>
        </div>
        <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <Field label="起始日"><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="结束日"><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="合约数"><Input type="number" value={maxContracts} onChange={e => setMaxContracts(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="每合约样本"><Input type="number" value={limitPerContract} onChange={e => setLimitPerContract(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="Top N"><Input type="number" value={top} onChange={e => setTop(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="最小 size"><Input type="number" value={minSize} onChange={e => setMinSize(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="最小 premium $"><Input type="number" value={minPremium} onChange={e => setMinPremium(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="Sweep 窗口 ms"><Input type="number" value={sweepWindowMs} onChange={e => setSweepWindowMs(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <Field label="Sweep 最小腿数"><Input type="number" value={sweepMinLegs} onChange={e => setSweepMinLegs(+e.target.value)} className="h-8 font-mono text-xs" /></Field>
        <div className="flex items-end">
          <Button onClick={run} disabled={loading} className="h-8 w-full">
            {loading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />扫描中</> : "运行扫描"}
          </Button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid sm:grid-cols-4 gap-3">
            <Stat label="扫描合约" value={String(result.scanned)} />
            <Stat label="大单总数" value={String(result.total_prints)} />
            <Stat label="Sweep 候选" value={String(result.total_sweeps)} />
            <Stat label="时间范围" value={`${result.from_date} → ${result.to_date}`} mono />
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="text-sm font-semibold mb-2">时间 × Strike 散点图 <span className="text-xs text-muted-foreground ml-2">大小=premium · 绿=call 红=put</span></div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid stroke="hsl(var(--grid-line))" />
                  <XAxis type="number" dataKey="x" domain={["auto", "auto"]} tickFormatter={v => new Date(v).toISOString().slice(5, 16).replace("T", " ")}
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="number" dataKey="y" tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                  <ZAxis type="number" dataKey="z" range={[20, 600]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }}
                    formatter={(v: any, n: any, item: any) => {
                      if (n === "x") return [new Date(v).toISOString(), "time"];
                      if (n === "y") return [v, "strike"];
                      if (n === "z") return [`$${(v/1000).toFixed(0)}K`, "premium"];
                      return [v, n];
                    }}
                  />
                  <Scatter name="Call" data={scatterCalls} fill="hsl(var(--bull))" />
                  <Scatter name="Put" data={scatterPuts} fill="hsl(var(--bear))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="text-sm font-semibold mb-2">Top 合约（按 premium）</div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contracts} layout="vertical" margin={{ top: 4, right: 12, left: 80, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--grid-line))" />
                    <XAxis type="number" tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} width={140} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any) => `$${(v/1e6).toFixed(2)}M`} />
                    <Bar dataKey="premium" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="text-sm font-semibold mb-2">Premium 直方图</div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogram} margin={{ top: 4, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--grid-line))" />
                    <XAxis dataKey="bin" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                    <Bar dataKey="count" fill="hsl(var(--accent))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="text-sm font-semibold mb-2">Large Single Prints <span className="text-xs text-muted-foreground ml-2">前 200 条按 premium 排序</span></div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-xs font-mono">
                <thead className="text-muted-foreground sticky top-0 bg-card">
                  <tr className="text-left">
                    <th className="p-2">时间</th><th className="p-2">合约</th><th className="p-2">类型</th><th className="p-2">Strike</th>
                    <th className="p-2 text-right">price</th><th className="p-2 text-right">size</th><th className="p-2 text-right">premium</th><th className="p-2">context</th>
                  </tr>
                </thead>
                <tbody>
                  {prints.map((p, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="p-2 whitespace-nowrap">{new Date(p.time).toISOString().replace("T", " ").slice(0, 19)}</td>
                      <td className="p-2">{p.ticker.replace("O:", "")}</td>
                      <td className={`p-2 ${p.type === "call" ? "text-bull" : "text-bear"}`}>{p.type}</td>
                      <td className="p-2">{p.strike}</td>
                      <td className="p-2 text-right">{p.price?.toFixed(2)}</td>
                      <td className="p-2 text-right">{p.size?.toLocaleString()}</td>
                      <td className="p-2 text-right">${(p.premium/1000).toFixed(0)}K</td>
                      <td className={`p-2 ${p.context === "at ask" ? "text-bull" : p.context === "at bid" ? "text-bear" : "text-muted-foreground"}`}>{p.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sweeps.length > 0 && (
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="text-sm font-semibold mb-2">Sweep 候选</div>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs font-mono">
                  <thead className="text-muted-foreground sticky top-0 bg-card">
                    <tr className="text-left">
                      <th className="p-2">起始</th><th className="p-2">合约</th><th className="p-2 text-right">腿数</th>
                      <th className="p-2 text-right">size</th><th className="p-2 text-right">premium</th><th className="p-2 text-right">price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweeps.map((s, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="p-2">{new Date(s.start).toISOString().replace("T", " ").slice(0, 19)}</td>
                        <td className="p-2">{s.ticker.replace("O:", "")}</td>
                        <td className="p-2 text-right">{s.legs}</td>
                        <td className="p-2 text-right">{s.totalSize.toLocaleString()}</td>
                        <td className="p-2 text-right">${(s.totalPremium/1000).toFixed(0)}K</td>
                        <td className="p-2 text-right">{s.price?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground font-mono">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg mt-0.5 ${mono ? "font-mono text-xs" : "font-mono"}`}>{value}</div>
    </div>
  );
}