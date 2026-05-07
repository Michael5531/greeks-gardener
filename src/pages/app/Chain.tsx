import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TickerSearch from "@/components/TickerSearch";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtPct } from "@/lib/optionUtils";

export default function Chain() {
  const [params, setParams] = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const [exp, setExp] = useState<string | undefined>();
  const { data, loading, error, expirations } = useOptionsChain(ticker || null);

  useEffect(() => { if (!exp && expirations.length) setExp(expirations[0]); }, [expirations, exp]);

  const filtered = useMemo(() => exp ? data.filter(d => d.details?.expiration_date === exp) : data, [data, exp]);
  const calls = filtered.filter(d => d.details?.contract_type === "call").sort((a,b) => a.details.strike_price - b.details.strike_price);
  const puts = filtered.filter(d => d.details?.contract_type === "put").sort((a,b) => a.details.strike_price - b.details.strike_price);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">期权链</h1>
          <p className="text-sm text-muted-foreground">{ticker || "搜索一个标的开始"}</p>
        </div>
        <div className="w-72"><TickerSearch onSelect={t => setParams({ ticker: t.ticker })} /></div>
      </div>

      {ticker && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">到期日</span>
          <Select value={exp} onValueChange={setExp}>
            <SelectTrigger className="w-44 font-mono"><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{expirations.map(e => <SelectItem key={e} value={e} className="font-mono">{e}</SelectItem>)}</SelectContent>
          </Select>
          {loading && <span className="text-xs text-muted-foreground">加载中…</span>}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChainTable title="Calls" rows={calls} accent="bull" />
        <ChainTable title="Puts" rows={puts} accent="bear" />
      </div>
    </div>
  );
}

function ChainTable({ title, rows, accent }: { title: string; rows: any[]; accent: "bull" | "bear" }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <div className={`px-4 py-2 text-sm font-semibold border-b border-border ${accent === "bull" ? "text-bull" : "text-bear"}`}>{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted-foreground bg-secondary/30">
            <tr>
              <th className="text-right px-2 py-1.5">Strike</th>
              <th className="text-right px-2 py-1.5">Bid/Ask</th>
              <th className="text-right px-2 py-1.5">IV</th>
              <th className="text-right px-2 py-1.5">Δ</th>
              <th className="text-right px-2 py-1.5">Γ</th>
              <th className="text-right px-2 py-1.5">Θ</th>
              <th className="text-right px-2 py-1.5">OI</th>
              <th className="text-right px-2 py-1.5">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">无数据</td></tr>}
            {rows.map((r) => (
              <tr key={r.details.ticker} className="border-t border-border/50 hover:bg-secondary/30">
                <td className="text-right px-2 py-1">{fmt(r.details.strike_price)}</td>
                <td className="text-right px-2 py-1">{fmt(r.last_quote?.bid)}/{fmt(r.last_quote?.ask)}</td>
                <td className="text-right px-2 py-1">{fmtPct(r.implied_volatility)}</td>
                <td className="text-right px-2 py-1">{fmt(r.greeks?.delta, 3)}</td>
                <td className="text-right px-2 py-1">{fmt(r.greeks?.gamma, 4)}</td>
                <td className="text-right px-2 py-1">{fmt(r.greeks?.theta, 3)}</td>
                <td className="text-right px-2 py-1">{r.open_interest ?? "—"}</td>
                <td className="text-right px-2 py-1">{r.day?.volume ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}