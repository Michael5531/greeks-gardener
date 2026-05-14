import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "@/components/TickerSearch";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { getOptionQuotes, getOptionTrades, getOptionsChain, getOptionSnapshotSingle } from "@/lib/polygon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import HeatmapCanvas, { type HeatPoint } from "@/components/charts/HeatmapCanvas";
import { useInterval } from "@/hooks/useInterval";
import { computeSessionET, useLiveQuote } from "@/hooks/useLiveQuote";

export default function Orderbook() {
  const [ticker, setTicker] = useSelectedTicker();
  const { expirations } = useOptionsChain(ticker || null);
  const { quote } = useLiveQuote(ticker || null, 5000);

  const [exp, setExp] = useState<string>("");
  const [side, setSide] = useState<"call" | "put">("call");
  const [strike, setStrike] = useState<number | null>(null);
  const [strikes, setStrikes] = useState<number[]>([]);
  const [windowMin, setWindowMin] = useState(15);
  // Tracks whether the user has manually picked a strike for the current
  // (ticker, exp, side) tuple. Once true, we stop auto-snapping to ATM on
  // every live-quote refresh — that was causing the strike to "jump" while
  // the user was inspecting a contract.
  const userPickedRef = useRef(false);

  // Reset the manual-pick flag whenever the underlying selection context
  // changes (new ticker / expiration / side). The next chain load is then
  // free to auto-snap to ATM once.
  useEffect(() => { userPickedRef.current = false; }, [ticker, exp, side]);

  // Auto-pick expiration: nearest in future
  useEffect(() => {
    if (expirations.length && !exp) setExp(expirations[0]);
  }, [expirations, exp]);

  // Load contracts for selected expiration to get the strike list.
  // IMPORTANT: do NOT depend on `quote?.price` — the live quote refreshes
  // every few seconds and would otherwise re-run this effect and snap the
  // user back to ATM, making the page unusable.
  useEffect(() => {
    if (!ticker || !exp) { setStrikes([]); return; }
    let cancelled = false;
    getOptionsChain(ticker, exp).then(rows => {
      if (cancelled) return;
      const ks = Array.from(new Set(rows.filter(r => r.details?.contract_type === side).map(r => r.details.strike_price))).sort((a, b) => a - b);
      setStrikes(ks);
      if (!ks.length) { setStrike(null); return; }
      // Keep the user's choice if still valid for this chain.
      setStrike(prev => {
        if (userPickedRef.current && prev != null && ks.includes(prev)) return prev;
        const ref = quote?.price;
        if (ref != null) {
          let best = ks[0], d = Math.abs(ks[0] - ref);
          for (const k of ks) { const dd = Math.abs(k - ref); if (dd < d) { d = dd; best = k; } }
          return best;
        }
        return ks[Math.floor(ks.length / 2)];
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, exp, side]);

  const optionTicker = useMemo(() => {
    if (!ticker || !exp || strike == null) return null;
    // OCC: O:UNDERYYMMDD[C|P]00000000 (strike * 1000, 8 digits)
    const [Y, M, D] = exp.split("-");
    const yy = Y.slice(2);
    const cp = side === "call" ? "C" : "P";
    const k = String(Math.round(strike * 1000)).padStart(8, "0");
    return `O:${ticker}${yy}${M}${D}${cp}${k}`;
  }, [ticker, exp, side, strike]);

  const [quotes, setQuotes] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const lastErrRef = useRef<string | null>(null);

  const session = computeSessionET();
  const live = session === "regular" || session === "pre" || session === "after";

  const fetchData = async () => {
    if (!optionTicker) return;
    setLoading(true);
    const since = Date.now() - windowMin * 60_000;
    const sinceNs = since * 1_000_000;
    try {
      const [q, t, s] = await Promise.all([
        getOptionQuotes(optionTicker, { gte: sinceNs, limit: 5000, order: "desc" }),
        getOptionTrades(optionTicker, sinceNs, 5000),
        getOptionSnapshotSingle(ticker!, optionTicker).catch(() => null),
      ]);
      setQuotes(q); setTrades(t); setSnap(s); lastErrRef.current = null;
    } catch (e: any) { lastErrRef.current = e.message; }
    finally { setLoading(false); }
  };

  useEffect(() => { setQuotes([]); setTrades([]); setSnap(null); }, [optionTicker]);
  useInterval(fetchData, live ? 4000 : 30000, { enabled: !!optionTicker });

  const quotePoints: HeatPoint[] = useMemo(() => {
    const pts: HeatPoint[] = [];
    for (const q of quotes) {
      const t = (q.sip_timestamp ?? q.participant_timestamp ?? 0) / 1_000_000;
      if (q.bid_price) pts.push({ time: t, price: q.bid_price, weight: q.bid_size ?? 1, side: "bid" });
      if (q.ask_price) pts.push({ time: t, price: q.ask_price, weight: q.ask_size ?? 1, side: "ask" });
    }
    return pts;
  }, [quotes]);

  const tradePoints: HeatPoint[] = useMemo(() => trades.map(t => ({
    time: (t.sip_timestamp ?? t.participant_timestamp ?? 0) / 1_000_000,
    price: t.price, weight: t.size ?? 1, side: "trade" as const,
  })), [trades]);

  const lastQuote = quotes[0];
  const mid = lastQuote?.bid_price && lastQuote?.ask_price ? (lastQuote.bid_price + lastQuote.ask_price) / 2 : null;
  const spread = lastQuote?.bid_price && lastQuote?.ask_price ? lastQuote.ask_price - lastQuote.bid_price : null;
  const tradeVol = useMemo(() => trades.reduce((a, t) => a + (t.size ?? 0), 0), [trades]);
  const tradePxRange = useMemo(() => {
    if (!trades.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const t of trades) { if (t.price < lo) lo = t.price; if (t.price > hi) hi = t.price; }
    return { lo, hi };
  }, [trades]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">实时盘口</h1>
          <p className="text-sm text-muted-foreground">期权 Quotes & Trades 深度热力图 · 仅在交易时段实时更新</p>
        </div>
        <div className="w-72"><TickerSearch current={ticker} onSelect={t => setTicker(t.ticker)} /></div>
      </div>

      {ticker && (
        <div className="rounded-lg border border-border bg-card/40 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">到期</span>
            <Select value={exp} onValueChange={setExp}>
              <SelectTrigger className="w-40 h-8 font-mono text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{expirations.map(e => <SelectItem key={e} value={e} className="font-mono text-xs">{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Tabs value={side} onValueChange={(v) => setSide(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="call" className="text-xs font-mono">Call</TabsTrigger>
              <TabsTrigger value="put" className="text-xs font-mono">Put</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Strike</span>
            <Select value={strike?.toString() ?? ""} onValueChange={(v) => { userPickedRef.current = true; setStrike(parseFloat(v)); }}>
              <SelectTrigger className="w-32 h-8 font-mono text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent className="max-h-80">{strikes.map(k => <SelectItem key={k} value={k.toString()} className="font-mono text-xs">{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground font-mono w-24">窗口 {windowMin}m</span>
            <div className="w-40"><Slider min={1} max={60} step={1} value={[windowMin]} onValueChange={(v) => setWindowMin(v[0])} /></div>
          </div>
        </div>
      )}

      {optionTicker && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="合约" value={optionTicker.replace("O:", "")} mono />
          <Stat label="Bid" value={lastQuote?.bid_price ? `$${lastQuote.bid_price.toFixed(2)} × ${lastQuote.bid_size}` : "—"} tone="bull" />
          <Stat label="Ask" value={lastQuote?.ask_price ? `$${lastQuote.ask_price.toFixed(2)} × ${lastQuote.ask_size}` : "—"} tone="bear" />
          <Stat label="Mid / Spread" value={mid != null ? `$${mid.toFixed(2)} / ${spread!.toFixed(2)}` : "—"} />
          <Stat label="样本" value={`${quotes.length} Q / ${trades.length} T`} />
        </div>
      )}

      {!live && optionTicker && (
        <div className="text-xs text-muted-foreground font-mono">当前为 {session === "closed" ? "休市" : "非常规"} 时段，实时数据可能稀疏。</div>
      )}

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="text-sm font-semibold mb-2">Quotes 深度热力图 <span className="text-xs text-muted-foreground ml-2">绿=bid 红=ask · 颜色越亮 size 越大</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
          <HeatmapCanvas points={quotePoints} width={900} height={360} timeBinMs={Math.max(1000, windowMin * 60_000 / 220)} priceBin={0.05} colorMode="bidask" refPrice={mid} title={loading ? "loading…" : undefined} />
          <GreeksPanel snap={snap} quotes={quotes} trades={trades} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="text-sm font-semibold mb-2 flex flex-wrap items-baseline gap-x-3">
          <span>Trades 成交热力图</span>
          <span className="text-xs text-muted-foreground">颜色越亮 成交量越大 · 悬停看详情</span>
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {trades.length.toLocaleString()} 笔 · 共 {tradeVol.toLocaleString()} 张
            {tradePxRange && ` · 价区 $${tradePxRange.lo.toFixed(2)}–$${tradePxRange.hi.toFixed(2)}`}
          </span>
        </div>
        {trades.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground font-mono text-center px-6">
            该合约在所选 {windowMin} 分钟窗口内无成交。<br />
            期权单一行权价的成交频率远低于报价更新 —— 可尝试拉长窗口、切换更近 ATM 的行权价,或选更活跃的标的(SPY / QQQ / NVDA)。
          </div>
        ) : (
          <HeatmapCanvas
            points={tradePoints}
            width={1100}
            height={300}
            timeBinMs={Math.max(1000, windowMin * 60_000 / 220)}
            priceBin={0.02}
            colorMode="single"
            refPrice={mid}
          />
        )}
      </div>
    </div>
  );
}

function GreeksPanel({ snap, quotes, trades }: { snap: any; quotes: any[]; trades: any[] }) {
  const g = snap?.greeks ?? {};
  const iv = snap?.implied_volatility;
  const oi = snap?.open_interest;
  const day = snap?.day ?? {};
  // Aggregate bid/ask pressure across the window
  let bidSum = 0, askSum = 0;
  for (const q of quotes) { bidSum += q.bid_size ?? 0; askSum += q.ask_size ?? 0; }
  const totalSide = bidSum + askSum || 1;
  const bidPct = (bidSum / totalSide) * 100;
  const tradeVol = trades.reduce((a, t) => a + (t.size ?? 0), 0);
  const Row = ({ k, v, tone }: { k: string; v: any; tone?: string }) => (
    <div className="flex justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-muted-foreground">{k}</span>
      <span className={`text-xs font-mono ${tone ?? ""}`}>{v}</span>
    </div>
  );
  const f = (x: any, d = 4) => (typeof x === "number" && isFinite(x) ? x.toFixed(d) : "—");
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-xs font-semibold mb-2">希腊字母 / 实时</div>
      <Row k="Δ Delta" v={f(g.delta, 4)} />
      <Row k="Γ Gamma" v={f(g.gamma, 5)} />
      <Row k="Θ Theta" v={f(g.theta, 4)} />
      <Row k="ν Vega" v={f(g.vega, 4)} />
      <Row k="IV" v={iv != null ? `${(iv * 100).toFixed(2)}%` : "—"} />
      <Row k="OI" v={oi != null ? oi.toLocaleString() : "—"} />
      <Row k="日成交量" v={day?.volume != null ? day.volume.toLocaleString() : "—"} />
      <div className="mt-2 pt-2 border-t border-border/60">
        <div className="text-[11px] text-muted-foreground mb-1">窗口内压力</div>
        <Row k="Bid 总量" v={bidSum.toLocaleString()} tone="text-bull" />
        <Row k="Ask 总量" v={askSum.toLocaleString()} tone="text-bear" />
        <Row k="买卖比" v={`${bidPct.toFixed(0)}% / ${(100 - bidPct).toFixed(0)}%`} />
        <Row k="成交量合计" v={tradeVol.toLocaleString()} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone, mono }: { label: string; value: string; tone?: "bull" | "bear"; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base mt-0.5 ${mono ? "font-mono text-xs" : "font-mono"} ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}