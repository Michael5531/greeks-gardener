import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { Radar, Sparkles, LineChart, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";

/* Multi-strategy scanner. For each watchlist ticker we evaluate a set of rule-based
   setups and emit one signal per matching strategy. */

const STRATEGY_LABELS: Record<string, string> = {
  covered_call: "Covered Call",
  cash_secured_put: "Cash-Secured Put",
  long_call: "Long Call",
  long_put: "Long Put / Hedge",
  bull_call_spread: "Bull Call Spread",
  bear_put_spread: "Bear Put Spread",
  iron_condor: "Iron Condor",
};

function directionOf(strategy: string): "long" | "short" | "neutral" {
  if (["long_call", "bull_call_spread", "covered_call", "cash_secured_put"].includes(strategy)) return "long";
  if (["long_put", "bear_put_spread"].includes(strategy)) return "short";
  return "neutral";
}
function daysUntil(date?: string): number {
  if (!date) return 14;
  const ms = Date.parse(date + "T00:00:00Z") - Date.now();
  return Math.max(1, Math.round(ms / 86_400_000));
}

export default function Signals() {
  const t = useT();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const { data } = await supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(50);
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-signals", { body: {} });
      if (error || (data as any)?.error) {
        toast.error(error?.message ?? (data as any).error ?? "扫描失败");
        return;
      }
      const inserted = (data as any)?.inserted ?? 0;
      if (inserted === 0 && (data as any)?.count === 0) toast.warning("Watchlist 为空");
      else toast.success(`扫描完成 · ${inserted} 个信号`);
      load();
    } finally { setScanning(false); }
  }

  const strategies = useMemo(() => Array.from(new Set(items.map(i => i.strategy_type))), [items]);
  const filtered = filter === "all" ? items : items.filter(i => i.strategy_type === filter);

  function goAnalyze(s: any) {
    const dir = directionOf(s.strategy_type);
    const strike = Number(s.signal?.strike);
    const spot = Number(s.signal?.spot ?? strike);
    const target = dir === "neutral"
      ? spot
      : dir === "long"
        ? Math.max(strike, spot) * 1.05
        : Math.min(strike, spot) * 0.95;
    const days = daysUntil(s.signal?.expiration);
    const qs = new URLSearchParams({
      ticker: s.ticker,
      direction: dir,
      target: target.toFixed(2),
      days: String(days),
    });
    navigate(`/app/trade-builder?${qs.toString()}`);
  }
  function goBacktest(s: any) {
    navigate(`/app/backtest?ticker=${encodeURIComponent(s.ticker)}`);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.signalsExt.title}</h1>
          <p className="text-sm text-muted-foreground">{t.signalsExt.sub} · 点击任意一行查看未来分析与回测</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 text-xs bg-background border border-border rounded px-2">
            <option value="all">全部策略</option>
            {strategies.map(s => <option key={s} value={s}>{STRATEGY_LABELS[s] ?? s}</option>)}
          </select>
          <Button onClick={scan} disabled={scanning} className="gap-2"><Radar className="h-4 w-4" />{scanning ? "扫描中…" : "立即扫描"}</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted-foreground bg-secondary/30">
            <tr>
              <th className="text-left px-3 py-2">时间</th>
              <th className="text-left">标的</th>
              <th className="text-left">策略</th>
              <th className="text-left">合约</th>
              <th className="text-right">Strike</th>
              <th className="text-right">到期</th>
              <th className="text-right">Δ</th>
              <th className="text-right">IV</th>
              <th className="text-right">Vol</th>
              <th className="text-right">OI</th>
              <th className="text-right">Bid/Ask</th>
              <th className="text-right px-3">动作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">暂无信号，点击"立即扫描"</td></tr>}
            {filtered.map(s => (
              <tr
                key={s.id}
                className="border-t border-border/50 hover:bg-secondary/40 cursor-pointer group"
                onClick={() => goAnalyze(s)}
                title="点击查看分析与回测"
              >
                <td className="px-3 py-1.5">{s.created_at?.slice(0,16).replace("T"," ")}</td>
                <td className="font-bold">{s.ticker}</td>
                <td>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    s.strategy_type.includes("call") || s.strategy_type === "bull_call_spread" ? "bg-bull/15 text-bull" :
                    s.strategy_type.includes("put") || s.strategy_type === "bear_put_spread" ? "bg-bear/15 text-bear" :
                    "bg-primary/15 text-primary"
                  }`}>{STRATEGY_LABELS[s.strategy_type] ?? s.strategy_type}</span>
                </td>
                <td className="text-muted-foreground">{s.signal?.contract}</td>
                <td className="text-right">{fmt(s.signal?.strike)}</td>
                <td className="text-right">{s.signal?.expiration}</td>
                <td className="text-right">{fmt(s.signal?.delta, 3)}</td>
                <td className="text-right">{fmtPct(s.signal?.iv)}</td>
                <td className="text-right">{s.signal?.volume != null ? Number(s.signal.volume).toLocaleString() : "—"}</td>
                <td className="text-right">{s.signal?.oi != null ? Number(s.signal.oi).toLocaleString() : "—"}</td>
                <td className="text-right">{fmt(s.signal?.bid)}/{fmt(s.signal?.ask)}</td>
                <td className="text-right px-3 py-1.5">
                  <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => goAnalyze(s)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors text-[10px]"
                      title="去 Trade Builder 看未来 EV / POP / 退出计划"
                    >
                      <Sparkles className="h-3 w-3" />分析
                    </button>
                    <button
                      onClick={() => goBacktest(s)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors text-[10px]"
                      title="跳转到回测页面"
                    >
                      <LineChart className="h-3 w-3" />回测
                    </button>
                    <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}