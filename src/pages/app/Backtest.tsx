import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { STRATEGIES, getStrategy } from "@/lib/strategies";
import StrategyCard from "@/components/StrategyCard";

export default function Backtest() {
  const [ticker, setTicker] = useState("AAPL");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2024-12-31");
  const [strategy, setStrategy] = useState("covered_call");
  const [dte, setDte] = useState(30);
  const [delta, setDelta] = useState(0.3);
  const [iv, setIv] = useState(0.30);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const def = getStrategy(strategy);

  async function loadHistory() {
    const { data } = await supabase.from("backtests").select("*").order("created_at", { ascending: false }).limit(10);
    setHistory(data ?? []);
  }
  useEffect(() => { loadHistory(); }, []);

  async function run() {
    if (!def.engineSupported) {
      toast.error("此策略暂不支持引擎回测，下方 Payoff 可视化可参考。");
      return;
    }
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("run-backtest", {
      body: {
        ticker: ticker.toUpperCase(), start_date: start, end_date: end,
        strategy_type: strategy, dte: Number(dte), delta_target: Number(delta), iv: Number(iv),
        profit_take: 0.5, stop_loss: 2,
      },
    });
    setRunning(false);
    if (error || (data as any)?.error) return toast.error(error?.message ?? (data as any).error);
    setResult((data as any).backtest);
    toast.success("回测完成");
    loadHistory();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">策略回测</h1>
        <p className="text-sm text-muted-foreground">使用 Polygon 历史数据 + 内置 Black–Scholes 估值器执行策略模拟</p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 grid md:grid-cols-7 gap-3">
        <Field label="标的"><Input className="font-mono" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} /></Field>
        <Field label="开始日期"><DatePicker value={start} onChange={setStart} /></Field>
        <Field label="结束日期"><DatePicker value={end} onChange={setEnd} /></Field>
        <Field label="策略">
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STRATEGIES.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}{!s.engineSupported ? " ·  payoff only" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="DTE"><Input type="number" className="font-mono" value={dte} onChange={e => setDte(+e.target.value)} /></Field>
        <Field label="目标 |Δ|"><Input type="number" step="0.05" className="font-mono" value={delta} onChange={e => setDelta(+e.target.value)} /></Field>
        <Field label="假定 IV"><Input type="number" step="0.05" className="font-mono" value={iv} onChange={e => setIv(+e.target.value)} /></Field>
        <div className="md:col-span-7 flex justify-end">
          <Button onClick={run} disabled={running || !def.engineSupported} className="glow" title={!def.engineSupported ? "此策略暂不支持引擎回测" : ""}>
            {running ? "运行中…" : def.engineSupported ? "运行回测" : "暂不支持回测"}
          </Button>
        </div>
      </div>

      <StrategyCard strategyId={strategy} ticker={ticker} dte={Number(dte)} iv={Number(iv)} />

      {result && <ResultPanel r={result} />}

      <div>
        <div className="text-sm font-semibold mb-2">最近回测</div>
        <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead className="text-muted-foreground bg-secondary/30">
              <tr><th className="text-left px-3 py-2">日期</th><th className="text-left">标的</th><th className="text-left">策略</th><th className="text-right">收益率</th><th className="text-right">Sharpe</th><th className="text-right">回撤</th><th className="text-right">胜率</th><th className="text-right">交易数</th></tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">暂无</td></tr>}
              {history.map((h: any) => (
                <tr key={h.id} className="border-t border-border/50 hover:bg-secondary/30 cursor-pointer" onClick={() => setResult(h)}>
                  <td className="px-3 py-1.5">{h.created_at?.slice(0,10)}</td>
                  <td>{h.ticker}</td>
                  <td>{h.params?.strategy_type}</td>
                  <td className={`text-right ${h.metrics?.total_return >= 0 ? "text-bull" : "text-bear"}`}>{fmtPct(h.metrics?.total_return)}</td>
                  <td className="text-right">{fmt(h.metrics?.sharpe)}</td>
                  <td className="text-right text-bear">{fmtPct(h.metrics?.max_drawdown)}</td>
                  <td className="text-right">{fmtPct(h.metrics?.win_rate)}</td>
                  <td className="text-right">{h.metrics?.trades_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function ResultPanel({ r }: { r: any }) {
  const m = r.metrics ?? {};
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-5 gap-3">
        <Stat label="总收益" value={fmtPct(m.total_return)} positive={m.total_return >= 0} />
        <Stat label="Sharpe" value={fmt(m.sharpe)} positive={m.sharpe >= 0} />
        <Stat label="最大回撤" value={fmtPct(m.max_drawdown)} positive={false} />
        <Stat label="胜率" value={fmtPct(m.win_rate)} />
        <Stat label="交易数" value={String(m.trades_count ?? 0)} />
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={r.equity_curve ?? []}>
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5}/>
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} minTickGap={40}/>
            <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} domain={['auto','auto']}/>
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}/>
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#eq)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-mono mt-0.5 ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}