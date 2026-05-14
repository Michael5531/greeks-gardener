import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "@/components/TickerSearch";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtPct } from "@/lib/optionUtils";
import OptionQuoteHistory from "@/components/OptionQuoteHistory";
import HelpPopover from "@/components/HelpPopover";

export default function Chain() {
  const [ticker, setTicker] = useSelectedTicker();
  const [exp, setExp] = useState<string | undefined>();
  const { data, loading, error, expirations } = useOptionsChain(ticker || null, exp);
  const [histOpen, setHistOpen] = useState(false);
  const [histContract, setHistContract] = useState<{ ticker: string; label: string } | null>(null);
  const openHistory = (r: any) => {
    const cp = r.details?.contract_type === "call" ? "C" : "P";
    setHistContract({
      ticker: r.details.ticker,
      label: `${ticker} ${r.details.expiration_date} ${cp} ${r.details.strike_price}`,
    });
    setHistOpen(true);
  };

  useEffect(() => {
    if (expirations.length && (!exp || !expirations.includes(exp))) setExp(expirations[0]);
  }, [expirations, exp]);

  const filtered = useMemo(() => exp ? data.filter(d => d.details?.expiration_date === exp) : data, [data, exp]);
  const calls = filtered.filter(d => d.details?.contract_type === "call").sort((a,b) => a.details.strike_price - b.details.strike_price);
  const puts = filtered.filter(d => d.details?.contract_type === "put").sort((a,b) => a.details.strike_price - b.details.strike_price);

  const spot = useMemo(() => {
    for (const d of data) {
      const p = d.underlying_asset?.price;
      if (typeof p === "number" && p > 0) return p;
    }
    return null;
  }, [data]);

  // Synced scroll between Calls / Puts
  const callsRef = useRef<HTMLDivElement>(null);
  const putsRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const onScroll = (src: "c" | "p") => (e: React.UIEvent<HTMLDivElement>) => {
    if (syncing.current) return;
    const top = (e.target as HTMLDivElement).scrollTop;
    syncing.current = true;
    const other = src === "c" ? putsRef.current : callsRef.current;
    if (other) other.scrollTop = top;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  // Scroll to ATM when data/spot changes
  useEffect(() => {
    if (!spot || !calls.length) return;
    let atmIdx = 0, best = Infinity;
    calls.forEach((r, i) => {
      const d = Math.abs(r.details.strike_price - spot);
      if (d < best) { best = d; atmIdx = i; }
    });
    requestAnimationFrame(() => {
      [callsRef.current, putsRef.current].forEach(el => {
        if (!el) return;
        const row = el.querySelector<HTMLTableRowElement>(`tbody tr[data-idx="${atmIdx}"]`);
        if (row) el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2;
      });
    });
  }, [spot, calls.length, puts.length, exp]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">期权链</h1>
          <p className="text-sm text-muted-foreground">
            {ticker || "搜索一个标的开始"}
            {spot != null && <span className="ml-2 font-mono text-primary">${fmt(spot)}</span>}
          </p>
        </div>
        <div className="w-72"><TickerSearch current={ticker} onSelect={t => setTicker(t.ticker)} /></div>
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
        <ChainTable title="Calls" rows={calls} accent="bull" spot={spot} scrollRef={callsRef} onScroll={onScroll("c")} onRowClick={openHistory} />
        <ChainTable title="Puts" rows={puts} accent="bear" spot={spot} scrollRef={putsRef} onScroll={onScroll("p")} onRowClick={openHistory} />
      </div>
      <OptionQuoteHistory
        open={histOpen}
        onOpenChange={setHistOpen}
        optionTicker={histContract?.ticker ?? null}
        label={histContract?.label}
      />
    </div>
  );
}

function ChainTable({ title, rows, accent, spot, scrollRef, onScroll, onRowClick }: {
  title: string; rows: any[]; accent: "bull" | "bear"; spot: number | null;
  scrollRef: React.RefObject<HTMLDivElement>; onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onRowClick?: (row: any) => void;
}) {
  // index of strike just at/above spot — we'll render the spot line above this row
  let spotIdx = -1;
  if (spot != null) {
    spotIdx = rows.findIndex(r => r.details.strike_price >= spot);
    if (spotIdx === -1) spotIdx = rows.length;
  }
  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <div className={`px-4 py-2 text-sm font-semibold border-b border-border ${accent === "bull" ? "text-bull" : "text-bear"}`}>{title}</div>
      <div ref={scrollRef} onScroll={onScroll} className="overflow-auto max-h-[640px]">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted-foreground bg-secondary sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr>
              <th className="text-right px-2 py-1.5">Strike</th>
              <th className="text-right px-2 py-1.5">Bid/Ask</th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">IV<HelpPopover term="iv" /></span></th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">Δ<HelpPopover term="delta" /></span></th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">Γ<HelpPopover term="gamma" /></span></th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">Θ<HelpPopover term="theta" /></span></th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">OI<HelpPopover term="oi" /></span></th>
              <th className="text-right px-2 py-1.5"><span className="inline-flex items-center justify-end">Vol<HelpPopover term="volume" /></span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">无数据</td></tr>}
            {rows.map((r, i) => (
              <tr
                key={r.details.ticker}
                data-idx={i}
                onClick={() => onRowClick?.(r)}
                title="点击查看历史 Bid/Ask"
                className={`border-t border-border/50 hover:bg-secondary/40 cursor-pointer ${
                  i === spotIdx ? "border-t-2 border-t-primary" : ""
                }`}
              >
                <td className="text-right px-2 py-1">
                  {i === spotIdx && spot != null && (
                    <span className="mr-1 text-[10px] text-primary">${fmt(spot)}</span>
                  )}
                  {fmt(r.details.strike_price)}
                </td>
                <td className="text-right px-2 py-1">
                  {fmt(r.last_quote?.bid ?? r.last_quote?.bid_price ?? r.last_trade?.price)}
                  /
                  {fmt(r.last_quote?.ask ?? r.last_quote?.ask_price ?? r.last_trade?.price)}
                </td>
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