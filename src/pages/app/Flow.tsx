import { useMemo, useState } from "react";
import TickerSearch from "@/components/TickerSearch";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { runHistoricalFlow } from "@/lib/polygon";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import OptionPricer from "@/components/OptionPricer";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { useLiveQuote } from "@/hooks/useLiveQuote";

function isCallTicker(t?: string) {
  if (!t) return false;
  // OCC: O:UNDERYYMMDD[C|P]00000000  -> check the C/P after the 6-digit date
  const m = /[A-Z](\d{6})([CP])\d{8}$/.exec(t);
  return m ? m[2] === "C" : false;
}

const today = () => new Date().toISOString().slice(0, 10);
const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export default function Flow() {
  const [ticker, setTicker] = useSelectedTicker();
  const { data: chainData, expirations } = useOptionsChain(ticker || null);
  const { quote: liveQuote } = useLiveQuote(ticker || null, 5000);
  const spot = liveQuote?.price ?? null;
  const strikeOptions = useMemo(() => {
    const s = new Set<number>();
    for (const d of chainData) {
      const k = d.details?.strike_price;
      if (typeof k === "number") s.add(k);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [chainData]);

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

  // Filter / sort state for prints table
  const [pf, setPf] = useState({
    type: "all" as "all" | "call" | "put",
    context: "all" as "all" | "at ask" | "at bid" | "above ask" | "below bid" | "mid",
    contract: "",
    strikeMin: "" as string,
    strikeMax: "" as string,
    sizeMin: "" as string,
    premiumMin: "" as string,
  });
  const [pSort, setPSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "premium", dir: "desc" });

  // Filter / sort state for sweeps
  const [sf, setSf] = useState({ contract: "", legsMin: "" as string, premiumMin: "" as string });
  const [sSort, setSSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "totalPremium", dir: "desc" });

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

  const filteredPrints = useMemo(() => {
    const sMin = pf.strikeMin === "" ? -Infinity : +pf.strikeMin;
    const sMax = pf.strikeMax === "" ? Infinity : +pf.strikeMax;
    const szMin = pf.sizeMin === "" ? 0 : +pf.sizeMin;
    const pMin = pf.premiumMin === "" ? 0 : +pf.premiumMin;
    const cq = pf.contract.trim().toUpperCase();
    let out = prints.filter(p =>
      (pf.type === "all" || p.type === pf.type) &&
      (pf.context === "all" || p.context === pf.context) &&
      (!cq || (p.ticker || "").toUpperCase().includes(cq)) &&
      (p.strike ?? 0) >= sMin && (p.strike ?? 0) <= sMax &&
      (p.size ?? 0) >= szMin &&
      (p.premium ?? 0) >= pMin
    );
    const k = pSort.key, d = pSort.dir === "asc" ? 1 : -1;
    out = out.slice().sort((a, b) => {
      const av = a[k], bv = b[k];
      if (typeof av === "string") return av.localeCompare(bv) * d;
      return ((av ?? 0) - (bv ?? 0)) * d;
    });
    return out;
  }, [prints, pf, pSort]);

  const filteredSweeps = useMemo(() => {
    const lMin = sf.legsMin === "" ? 0 : +sf.legsMin;
    const pMin = sf.premiumMin === "" ? 0 : +sf.premiumMin;
    const cq = sf.contract.trim().toUpperCase();
    let out = sweeps.filter(s =>
      (!cq || (s.ticker || "").toUpperCase().includes(cq)) &&
      (s.legs ?? 0) >= lMin &&
      (s.totalPremium ?? 0) >= pMin
    );
    const k = sSort.key, d = sSort.dir === "asc" ? 1 : -1;
    out = out.slice().sort((a, b) => ((a[k] ?? 0) - (b[k] ?? 0)) * d);
    return out;
  }, [sweeps, sf, sSort]);

  const togglePSort = (key: string) =>
    setPSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  const toggleSSort = (key: string) =>
    setSSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    !active ? <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />
      : dir === "asc" ? <ArrowUp className="inline h-3 w-3 ml-1" /> : <ArrowDown className="inline h-3 w-3 ml-1" />;

  // scatter data
  const scatterCalls = prints.filter(p => p.type === "call").map(p => ({ x: p.time, y: p.strike, z: p.premium, ...p }));
  const scatterPuts = prints.filter(p => p.type === "put").map(p => ({ x: p.time, y: p.strike, z: p.premium, ...p }));

  // Aggregate prints by strike, stacked per expiration. Calls positive, puts negative. Matches Net GEX-by-strike layout.
  const { strikePremium, expSet } = useMemo(() => {
    const map = new Map<number, any>();
    const exps = new Set<string>();
    for (const p of prints) {
      const k = p.strike; const e = (p.expiration || "").slice(0, 10);
      if (k == null) continue;
      if (e) exps.add(e);
      const row = map.get(k) ?? { strike: k };
      const tag = e ? (p.type === "call" ? `${e}__c` : `${e}__p`) : (p.type === "call" ? "_other__c" : "_other__p");
      const sign = p.type === "call" ? 1 : -1;
      row[tag] = (row[tag] ?? 0) + sign * (p.premium ?? 0);
      map.set(k, row);
    }
    return {
      strikePremium: Array.from(map.values()).sort((a, b) => a.strike - b.strike),
      expSet: Array.from(exps).sort(),
    };
  }, [prints]);
  const expColorMap = useMemo(() => {
    const out: Record<string, string> = {};
    const N = Math.max(1, expSet.length);
    expSet.forEach((e, i) => { out[e] = `hsl(${Math.round((i * 360) / N)} 70% 55%)`; });
    return out;
  }, [expSet]);

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
        <div className="w-72"><TickerSearch onSelect={t => setTicker(t.ticker)} /></div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <Field label="起始日"><DatePicker value={fromDate} onChange={setFromDate} /></Field>
        <Field label="结束日"><DatePicker value={toDate} onChange={setToDate} /></Field>
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
            <Stat
              label={`${ticker} 实时现价`}
              value={spot != null ? `$${spot.toFixed(2)}` : (result.underlying_price != null ? `$${result.underlying_price.toFixed(2)}` : "—")}
              mono
            />
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="text-sm font-semibold mb-2">时间 × Strike 散点图 <span className="text-xs text-muted-foreground ml-2">大小=premium · 绿=call 红=put</span></div>
            <div className="h-[420px]">
              <ChartSizer>
                {({ width, height }) => (
                <ScatterChart width={width} height={height} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
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
                  {(spot ?? result.underlying_price) != null && (
                    <ReferenceLine y={spot ?? result.underlying_price} stroke="hsl(var(--primary))" strokeDasharray="4 3"
                      label={{ value: `Spot ${(spot ?? result.underlying_price).toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 10, position: "right" }} />
                  )}
                </ScatterChart>
                )}
              </ChartSizer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="text-sm font-semibold mb-2">
              Call ↑ / Put ↓ 大单 Premium · 按行权价
              <span className="text-xs text-muted-foreground ml-2">Call 在上 / Put 在下 · 不同到期日叠加</span>
            </div>
            <div className="h-[420px]">
              <ChartSizer>
                {({ width, height }) => (
                <BarChart width={width} height={height} data={strikePremium} margin={{ top: 8, right: 12, left: 0, bottom: 24 }} stackOffset="sign" barCategoryGap="8%">
                  <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
                  <XAxis dataKey="strike" type="category" interval="preserveStartEnd"
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickFormatter={v => `${(Math.abs(v) / 1000).toFixed(0)}K`}
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }}
                    formatter={(v: any, n: string) => {
                      const isCall = n.endsWith("__c");
                      const exp = n.replace(/__[cp]$/, "");
                      return [`${isCall ? "C" : "P"} $${(Math.abs(v) / 1000).toFixed(0)}K`, exp];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: string) => v.replace(/__[cp]$/, "")} />
                  {expSet.map(e => (
                    <Bar key={`${e}-c`} dataKey={`${e}__c`} stackId="x" fill={expColorMap[e]} name={`${e}__c`} />
                  ))}
                  {expSet.map(e => (
                    <Bar key={`${e}-p`} dataKey={`${e}__p`} stackId="x" fill={expColorMap[e]} fillOpacity={0.55} name={`${e}__p`} legendType="none" />
                  ))}
                  {(spot ?? result.underlying_price) != null && (
                    <ReferenceLine x={(spot ?? result.underlying_price)} stroke="hsl(var(--primary))" strokeDasharray="4 3"
                      label={{ value: `Spot ${(spot ?? result.underlying_price).toFixed(2)}`, fill: "hsl(var(--primary))", fontSize: 10, position: "top" }} />
                  )}
                </BarChart>
                )}
              </ChartSizer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="text-sm font-semibold mb-2">Top 合约（按 premium）</div>
              <div className="h-72">
                <ChartSizer>
                  {({ width, height }) => (
                  <BarChart width={width} height={height} data={contracts} layout="vertical" margin={{ top: 4, right: 12, left: 80, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--grid-line))" />
                    <XAxis type="number" tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} width={140} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any, _n, p: any) => [`$${(v/1e6).toFixed(2)}M`, isCallTicker(p?.payload?.ticker) ? "Call" : "Put"]} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} content={() => (
                      <div className="flex gap-4 justify-center mt-1 font-mono text-[11px]">
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--bull))" }} />Call</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--bear))" }} />Put</span>
                      </div>
                    )} />
                    <Bar dataKey="premium">
                      {contracts.map((c, i) => (
                        <Cell key={i} fill={isCallTicker(c.ticker) ? "hsl(var(--bull))" : "hsl(var(--bear))"} />
                      ))}
                    </Bar>
                  </BarChart>
                  )}
                </ChartSizer>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="text-sm font-semibold mb-2">Premium 直方图</div>
              <div className="h-72">
                <ChartSizer>
                  {({ width, height }) => (
                  <BarChart width={width} height={height} data={histogram} margin={{ top: 4, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="hsl(var(--grid-line))" />
                    <XAxis dataKey="bin" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} />
                    <Bar dataKey="count" fill="hsl(var(--accent))" />
                  </BarChart>
                  )}
                </ChartSizer>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
              <div className="text-sm font-semibold">Large Single Prints <span className="text-xs text-muted-foreground ml-2">{filteredPrints.length} / {prints.length}</span></div>
              <button className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setPf({ type: "all", context: "all", contract: "", strikeMin: "", strikeMax: "", sizeMin: "", premiumMin: "" })}>清除筛选</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
              <select className="h-7 text-xs bg-background border border-border rounded px-2" value={pf.type} onChange={e => setPf({ ...pf, type: e.target.value as any })}>
                <option value="all">全部类型</option><option value="call">call</option><option value="put">put</option>
              </select>
              <select className="h-7 text-xs bg-background border border-border rounded px-2" value={pf.context} onChange={e => setPf({ ...pf, context: e.target.value as any })}>
                <option value="all">全部 context</option>
                <option value="at ask">at ask</option><option value="above ask">above ask</option>
                <option value="mid">mid</option>
                <option value="at bid">at bid</option><option value="below bid">below bid</option>
              </select>
              <Input placeholder="合约" value={pf.contract} onChange={e => setPf({ ...pf, contract: e.target.value })} className="h-7 text-xs font-mono" />
              <Input placeholder="Strike ≥" value={pf.strikeMin} onChange={e => setPf({ ...pf, strikeMin: e.target.value })} className="h-7 text-xs font-mono" />
              <Input placeholder="Strike ≤" value={pf.strikeMax} onChange={e => setPf({ ...pf, strikeMax: e.target.value })} className="h-7 text-xs font-mono" />
              <Input placeholder="size ≥" value={pf.sizeMin} onChange={e => setPf({ ...pf, sizeMin: e.target.value })} className="h-7 text-xs font-mono" />
              <Input placeholder="premium ≥ $" value={pf.premiumMin} onChange={e => setPf({ ...pf, premiumMin: e.target.value })} className="h-7 text-xs font-mono" />
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-xs font-mono">
                <thead className="text-muted-foreground sticky top-0 bg-card">
                  <tr className="text-left select-none">
                    <th className="p-2 cursor-pointer" onClick={() => togglePSort("time")}>时间<SortIcon active={pSort.key==="time"} dir={pSort.dir} /></th>
                    <th className="p-2 cursor-pointer" onClick={() => togglePSort("ticker")}>合约<SortIcon active={pSort.key==="ticker"} dir={pSort.dir} /></th>
                    <th className="p-2 cursor-pointer" onClick={() => togglePSort("type")}>类型<SortIcon active={pSort.key==="type"} dir={pSort.dir} /></th>
                    <th className="p-2 cursor-pointer" onClick={() => togglePSort("strike")}>Strike<SortIcon active={pSort.key==="strike"} dir={pSort.dir} /></th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => togglePSort("price")}>price<SortIcon active={pSort.key==="price"} dir={pSort.dir} /></th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => togglePSort("size")}>size<SortIcon active={pSort.key==="size"} dir={pSort.dir} /></th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => togglePSort("premium")}>premium<SortIcon active={pSort.key==="premium"} dir={pSort.dir} /></th>
                    <th className="p-2 text-right">IV</th>
                    <th className="p-2 text-right">Vol</th>
                    <th className="p-2 text-right">OI</th>
                    <th className="p-2 cursor-pointer" onClick={() => togglePSort("context")}>context<SortIcon active={pSort.key==="context"} dir={pSort.dir} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrints.map((p, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="p-2 whitespace-nowrap">{new Date(p.time).toISOString().replace("T", " ").slice(0, 19)}</td>
                      <td className="p-2">{p.ticker.replace("O:", "")}</td>
                      <td className={`p-2 ${p.type === "call" ? "text-bull" : "text-bear"}`}>{p.type}</td>
                      <td className="p-2">{p.strike}</td>
                      <td className="p-2 text-right">{p.price?.toFixed(2)}</td>
                      <td className="p-2 text-right">{p.size?.toLocaleString()}</td>
                      <td className="p-2 text-right">${(p.premium/1000).toFixed(0)}K</td>
                      <td className="p-2 text-right">{p.iv != null ? `${(p.iv * 100).toFixed(1)}%` : "—"}</td>
                      <td className="p-2 text-right">{p.day_volume != null ? p.day_volume.toLocaleString() : "—"}</td>
                      <td className="p-2 text-right">{p.open_interest != null ? p.open_interest.toLocaleString() : "—"}</td>
                      <td className={`p-2 ${p.context === "at ask" ? "text-bull" : p.context === "at bid" ? "text-bear" : "text-muted-foreground"}`}>{p.context}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sweeps.length > 0 && (
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
                <div className="text-sm font-semibold">Sweep 候选 <span className="text-xs text-muted-foreground ml-2">{filteredSweeps.length} / {sweeps.length}</span></div>
                <button className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setSf({ contract: "", legsMin: "", premiumMin: "" })}>清除筛选</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                <Input placeholder="合约" value={sf.contract} onChange={e => setSf({ ...sf, contract: e.target.value })} className="h-7 text-xs font-mono" />
                <Input placeholder="腿数 ≥" value={sf.legsMin} onChange={e => setSf({ ...sf, legsMin: e.target.value })} className="h-7 text-xs font-mono" />
                <Input placeholder="premium ≥ $" value={sf.premiumMin} onChange={e => setSf({ ...sf, premiumMin: e.target.value })} className="h-7 text-xs font-mono" />
              </div>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs font-mono">
                  <thead className="text-muted-foreground sticky top-0 bg-card">
                    <tr className="text-left select-none">
                      <th className="p-2 cursor-pointer" onClick={() => toggleSSort("start")}>起始<SortIcon active={sSort.key==="start"} dir={sSort.dir} /></th>
                      <th className="p-2 cursor-pointer" onClick={() => toggleSSort("ticker")}>合约<SortIcon active={sSort.key==="ticker"} dir={sSort.dir} /></th>
                      <th className="p-2 text-right cursor-pointer" onClick={() => toggleSSort("legs")}>腿数<SortIcon active={sSort.key==="legs"} dir={sSort.dir} /></th>
                      <th className="p-2 text-right cursor-pointer" onClick={() => toggleSSort("totalSize")}>size<SortIcon active={sSort.key==="totalSize"} dir={sSort.dir} /></th>
                      <th className="p-2 text-right cursor-pointer" onClick={() => toggleSSort("totalPremium")}>premium<SortIcon active={sSort.key==="totalPremium"} dir={sSort.dir} /></th>
                      <th className="p-2 text-right cursor-pointer" onClick={() => toggleSSort("price")}>price<SortIcon active={sSort.key==="price"} dir={sSort.dir} /></th>
                      <th className="p-2 text-right">IV</th>
                      <th className="p-2 text-right">Vol</th>
                      <th className="p-2 text-right">OI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSweeps.map((s, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="p-2">{new Date(s.start).toISOString().replace("T", " ").slice(0, 19)}</td>
                        <td className="p-2">{s.ticker.replace("O:", "")}</td>
                        <td className="p-2 text-right">{s.legs}</td>
                        <td className="p-2 text-right">{s.totalSize.toLocaleString()}</td>
                        <td className="p-2 text-right">${(s.totalPremium/1000).toFixed(0)}K</td>
                        <td className="p-2 text-right">{s.price?.toFixed(2)}</td>
                        <td className="p-2 text-right">{s.iv != null ? `${(s.iv * 100).toFixed(1)}%` : "—"}</td>
                        <td className="p-2 text-right">{s.day_volume != null ? s.day_volume.toLocaleString() : "—"}</td>
                        <td className="p-2 text-right">{s.open_interest != null ? s.open_interest.toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <OptionPricer externalTicker={ticker} externalSpot={spot} />
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