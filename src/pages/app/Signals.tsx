import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getOptionsChain } from "@/lib/polygon";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { Radar } from "lucide-react";

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
  const [items, setItems] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const { data } = await supabase.from("signals").select("*").order("created_at", { ascending: false }).limit(50);
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function dteOf(exp: string) {
    return Math.round((new Date(exp).getTime() - Date.now()) / 86400000);
  }

  async function scan() {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: wl } = await supabase.from("watchlist").select("ticker");
      if (!wl?.length) { toast.warning("Watchlist 为空"); return; }

      const inserts: any[] = [];
      for (const w of wl) {
        try {
          const chain = await getOptionsChain(w.ticker);
          const valid = chain.filter(c => c.greeks?.delta != null && c.details?.expiration_date);
          if (!valid.length) continue;
          const calls = valid.filter(c => c.details.contract_type === "call");
          const puts = valid.filter(c => c.details.contract_type === "put");

          // Helper: pick contract closest to target |delta| within DTE window
          const pick = (arr: any[], targetDelta: number, dteMin: number, dteMax: number) => {
            const pool = arr.filter(c => {
              const d = dteOf(c.details.expiration_date);
              return d >= dteMin && d <= dteMax;
            });
            if (!pool.length) return null;
            return pool.reduce((b, c) => {
              const s = Math.abs(Math.abs(c.greeks.delta) - targetDelta);
              return s < b.s ? { s, c } : b;
            }, { s: 1, c: null as any }).c;
          };

          const toSig = (c: any) => ({
            contract: c.details.ticker,
            strike: c.details.strike_price,
            expiration: c.details.expiration_date,
            delta: c.greeks.delta,
            iv: c.implied_volatility,
            bid: c.last_quote?.bid,
            ask: c.last_quote?.ask,
          });

          // 1) Covered Call: sell ~30Δ call, 20-45 DTE
          const cc = pick(calls, 0.30, 20, 45);
          if (cc) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "covered_call", signal: { type: "sell_call", ...toSig(cc), note: "卖出 30Δ Call 收权利金" } });

          // 2) Cash-Secured Put: sell ~30Δ put, 20-45 DTE
          const csp = pick(puts, 0.30, 20, 45);
          if (csp) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "cash_secured_put", signal: { type: "sell_put", ...toSig(csp), note: "卖出 30Δ Put 等待入场" } });

          // 3) Long Call: buy ~50-60Δ call, 30-60 DTE (directional bullish)
          const lc = pick(calls, 0.55, 30, 60);
          if (lc) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "long_call", signal: { type: "buy_call", ...toSig(lc), note: "看涨方向性买入" } });

          // 4) Long Put / hedge: buy ~30Δ put, 30-60 DTE
          const lp = pick(puts, 0.30, 30, 60);
          if (lp) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "long_put", signal: { type: "buy_put", ...toSig(lp), note: "下行保护 / 做空" } });

          // 5) Bull Call Spread: long ~50Δ + short ~25Δ same expiration
          const longLeg = pick(calls, 0.50, 25, 55);
          if (longLeg) {
            const expCalls = calls.filter(c => c.details.expiration_date === longLeg.details.expiration_date && c.details.strike_price > longLeg.details.strike_price);
            const shortLeg = expCalls.reduce((b, c) => {
              const s = Math.abs(Math.abs(c.greeks.delta) - 0.25);
              return s < b.s ? { s, c } : b;
            }, { s: 1, c: null as any }).c;
            if (shortLeg) {
              inserts.push({
                user_id: user.id, ticker: w.ticker, strategy_type: "bull_call_spread",
                signal: {
                  type: "debit_spread",
                  contract: `${longLeg.details.strike_price}/${shortLeg.details.strike_price} Call`,
                  strike: longLeg.details.strike_price,
                  expiration: longLeg.details.expiration_date,
                  delta: longLeg.greeks.delta - shortLeg.greeks.delta,
                  iv: longLeg.implied_volatility,
                  bid: (longLeg.last_quote?.bid ?? 0) - (shortLeg.last_quote?.ask ?? 0),
                  ask: (longLeg.last_quote?.ask ?? 0) - (shortLeg.last_quote?.bid ?? 0),
                  note: `买 ${longLeg.details.strike_price}C / 卖 ${shortLeg.details.strike_price}C`,
                },
              });
            }
          }

          // 6) Bear Put Spread: long ~50Δ put + short ~25Δ put
          const longPut = pick(puts, 0.50, 25, 55);
          if (longPut) {
            const expPuts = puts.filter(c => c.details.expiration_date === longPut.details.expiration_date && c.details.strike_price < longPut.details.strike_price);
            const shortPut = expPuts.reduce((b, c) => {
              const s = Math.abs(Math.abs(c.greeks.delta) - 0.25);
              return s < b.s ? { s, c } : b;
            }, { s: 1, c: null as any }).c;
            if (shortPut) {
              inserts.push({
                user_id: user.id, ticker: w.ticker, strategy_type: "bear_put_spread",
                signal: {
                  type: "debit_spread",
                  contract: `${longPut.details.strike_price}/${shortPut.details.strike_price} Put`,
                  strike: longPut.details.strike_price,
                  expiration: longPut.details.expiration_date,
                  delta: longPut.greeks.delta - shortPut.greeks.delta,
                  iv: longPut.implied_volatility,
                  bid: (longPut.last_quote?.bid ?? 0) - (shortPut.last_quote?.ask ?? 0),
                  ask: (longPut.last_quote?.ask ?? 0) - (shortPut.last_quote?.bid ?? 0),
                  note: `买 ${longPut.details.strike_price}P / 卖 ${shortPut.details.strike_price}P`,
                },
              });
            }
          }

          // 7) Iron Condor: short ~20Δ put + short ~20Δ call (same expiration)
          const shortC = pick(calls, 0.20, 25, 55);
          const shortP = pick(puts, 0.20, 25, 55);
          if (shortC && shortP && shortC.details.expiration_date === shortP.details.expiration_date) {
            inserts.push({
              user_id: user.id, ticker: w.ticker, strategy_type: "iron_condor",
              signal: {
                type: "credit_condor",
                contract: `${shortP.details.strike_price}P / ${shortC.details.strike_price}C`,
                strike: (shortP.details.strike_price + shortC.details.strike_price) / 2,
                expiration: shortC.details.expiration_date,
                delta: shortC.greeks.delta + shortP.greeks.delta,
                iv: (shortC.implied_volatility + shortP.implied_volatility) / 2,
                bid: (shortP.last_quote?.bid ?? 0) + (shortC.last_quote?.bid ?? 0),
                ask: (shortP.last_quote?.ask ?? 0) + (shortC.last_quote?.ask ?? 0),
                note: "中性区间 · 卖双边收权利金",
              },
            });
          }
        } catch (e) { console.warn(e); }
      }
      if (inserts.length) {
        // chunk insert to avoid payload limits
        for (let i = 0; i < inserts.length; i += 50) {
          await supabase.from("signals").insert(inserts.slice(i, i + 50));
        }
      }
      toast.success("扫描完成");
      load();
    } finally { setScanning(false); }
  }

  const strategies = useMemo(() => Array.from(new Set(items.map(i => i.strategy_type))), [items]);
  const filtered = filter === "all" ? items : items.filter(i => i.strategy_type === filter);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">策略信号</h1>
          <p className="text-sm text-muted-foreground">基于规则扫描你的 Watchlist 并生成开仓建议（仅信号，不下单）</p>
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
              <th className="text-right">Bid/Ask</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">暂无信号，点击"立即扫描"</td></tr>}
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
                <td className="text-right">{fmt(s.signal?.bid)}/{fmt(s.signal?.ask)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}