import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getOptionsChain } from "@/lib/polygon";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { Radar } from "lucide-react";

/* MVP signal rule: for each watchlist ticker, suggest selling a 30-DTE OTM call
   closest to delta 0.30 with the highest IV. */

export default function Signals() {
  const [items, setItems] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  async function load() {
    const { data } = await supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(50);
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: wl } = await supabase.from("watchlist").select("ticker");
      if (!wl?.length) { toast.warning("Watchlist 为空"); return; }

      for (const w of wl) {
        try {
          const chain = await getOptionsChain(w.ticker);
          // pick contracts with greeks + delta near 0.30
          const candidates = chain.filter(c => c.greeks?.delta != null && c.details?.contract_type === "call");
          if (!candidates.length) continue;
          const target = candidates.reduce((best, c) => {
            const score = Math.abs(Math.abs(c.greeks.delta) - 0.30);
            return score < best.score ? { score, c } : best;
          }, { score: 1, c: null as any }).c;
          if (!target) continue;

          const signal = {
            type: "sell_call",
            contract: target.details.ticker,
            strike: target.details.strike_price,
            expiration: target.details.expiration_date,
            delta: target.greeks.delta,
            iv: target.implied_volatility,
            bid: target.last_quote?.bid,
            ask: target.last_quote?.ask,
          };
          await supabase.from("signals").insert({
            user_id: user.id, ticker: w.ticker, strategy_type: "covered_call", signal,
          });
        } catch (e) { console.warn(e); }
      }
      toast.success("扫描完成");
      load();
    } finally { setScanning(false); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">策略信号</h1>
          <p className="text-sm text-muted-foreground">基于规则扫描你的 Watchlist 并生成开仓建议（仅信号，不下单）</p>
        </div>
        <Button onClick={scan} disabled={scanning} className="gap-2"><Radar className="h-4 w-4" />{scanning ? "扫描中…" : "立即扫描"}</Button>
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
              <th className="text-right">Bid/Ask</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">暂无信号，点击"立即扫描"</td></tr>}
            {items.map(s => (
              <tr key={s.id} className="border-t border-border/50 hover:bg-secondary/30">
                <td className="px-3 py-1.5">{s.created_at?.slice(0,16).replace("T"," ")}</td>
                <td className="font-bold">{s.ticker}</td>
                <td>{s.strategy_type}</td>
                <td className="text-muted-foreground">{s.signal?.contract}</td>
                <td className="text-right">{fmt(s.signal?.strike)}</td>
                <td className="text-right">{s.signal?.expiration}</td>
                <td className="text-right">{fmt(s.signal?.delta, 3)}</td>
                <td className="text-right">{fmtPct(s.signal?.iv)}</td>
                <td className="text-right">{fmt(s.signal?.bid)}/{fmt(s.signal?.ask)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}