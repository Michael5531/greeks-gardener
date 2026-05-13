import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { Radar } from "lucide-react";
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

export default function Signals() {
  const t = useT();
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.signalsExt.title}</h1>
          <p className="text-sm text-muted-foreground">{t.signalsExt.sub}</p>
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">暂无信号，点击"立即扫描"</td></tr>}
            {filtered.map(s => (
              <tr key={s.id} className="border-t border-border/50 hover:bg-secondary/30">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}