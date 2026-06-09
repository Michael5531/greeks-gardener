import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "@/components/TickerSearch";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { getOptionQuotes, getOptionTrades, getOptionsChain } from "@/lib/polygon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import HeatmapCanvas, { type HeatPoint } from "@/components/charts/HeatmapCanvas";
import { Loader2, Play } from "lucide-react";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Convert an ET wall-clock date+time into a JS Date (UTC ms).
// Approximation: ET = UTC-4 in DST. Good enough for session bounds.
function etDateMs(iso: string, h: number, m: number) {
  const [y, mo, d] = iso.split("-").map(Number);
  // Build UTC then shift by +4h to get the ET wall clock moment.
  return Date.UTC(y, (mo ?? 1) - 1, d ?? 1, h + 4, m, 0);
}

export default function OrderbookHistory() {
  const [ticker, setTicker] = useSelectedTicker();
  const { expirations } = useOptionsChain(ticker || null);

  const [exp, setExp] = useState<string>("");
  const [side, setSide] = useState<"call" | "put">("call");
  const [strike, setStrike] = useState<number | null>(null);
  const [strikes, setStrikes] = useState<number[]>([]);
  const userPickedRef = useRef(false);

  // Default to "yesterday" so the regular session is fully closed.
  const [date, setDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
  });

  useEffect(() => { userPickedRef.current = false; }, [ticker, exp, side]);
  useEffect(() => { if (expirations.length && !exp) setExp(expirations[0]); }, [expirations, exp]);

  useEffect(() => {
    if (!ticker || !exp) { setStrikes([]); return; }
    let cancelled = false;
    getOptionsChain(ticker, exp).then(rows => {
      if (cancelled) return;
      const ks = Array.from(new Set(rows.filter(r => r.details?.contract_type === side).map(r => r.details.strike_price))).sort((a, b) => a - b);
      setStrikes(ks);
      setStrike(prev => {
        if (userPickedRef.current && prev != null && ks.includes(prev)) return prev;
        return ks.length ? ks[Math.floor(ks.length / 2)] : null;
      });
    });
    return () => { cancelled = true; };
  }, [ticker, exp, side]);

  const optionTicker = useMemo(() => {
    if (!ticker || !exp || strike == null) return null;
    const [Y, M, D] = exp.split("-");
    const yy = Y.slice(2);
    const cp = side === "call" ? "C" : "P";
    const k = String(Math.round(strike * 1000)).padStart(8, "0");
    return `O:${ticker}${yy}${M}${D}${cp}${k}`;
  }, [ticker, exp, side, strike]);

  const [quotes, setQuotes] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDay() {
    if (!optionTicker) return;
    setLoading(true); setError(null);
    // Session: 09:30 → 16:00 ET on the chosen date.
    const fromMs = etDateMs(date, 9, 30);
    const toMs = etDateMs(date, 16, 0);
    const gte = fromMs * 1_000_000;
    const lte = toMs * 1_000_000;
    try {
      const [q, t] = await Promise.all([
        getOptionQuotes(optionTicker, { gte, lte, limit: 50000, order: "asc" }),
        getOptionTrades(optionTicker, gte, 5000),
      ]);
      // Trim trades to session
      const tInSession = (t ?? []).filter((x: any) => {
        const ns = x.sip_timestamp ?? x.participant_timestamp ?? 0;
        return ns >= gte && ns <= lte;
      });
      setQuotes(q ?? []); setTrades(tInSession);
    } catch (e: any) {
      setError(e.message ?? "load failed");
      setQuotes([]); setTrades([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { setQuotes([]); setTrades([]); setError(null); }, [optionTicker, date]);

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

  // Volume profile (锚定成交量) — bucket by price.
  const profile = useMemo(() => {
    if (!trades.length) return { bins: [] as { price: number; vol: number }[], max: 0, total: 0, vwap: 0, poc: 0 };
    let lo = Infinity, hi = -Infinity, total = 0, pxVol = 0;
    for (const t of trades) { if (t.price < lo) lo = t.price; if (t.price > hi) hi = t.price; total += t.size ?? 0; pxVol += (t.price * (t.size ?? 0)); }
    if (!(hi > lo)) hi = lo + 0.05;
    const NBINS = 32;
    const step = (hi - lo) / NBINS || 0.01;
    const bins = Array.from({ length: NBINS }, (_, i) => ({ price: lo + step * (i + 0.5), vol: 0 }));
    for (const t of trades) {
      const i = Math.min(NBINS - 1, Math.max(0, Math.floor((t.price - lo) / step)));
      bins[i].vol += t.size ?? 0;
    }
    let max = 0, pocPrice = bins[0].price;
    for (const b of bins) if (b.vol > max) { max = b.vol; pocPrice = b.price; }
    return { bins: bins.reverse(), max, total, vwap: total ? pxVol / total : 0, poc: pocPrice };
  }, [trades]);

  const tradeVol = useMemo(() => trades.reduce((a, t) => a + (t.size ?? 0), 0), [trades]);
  const lastQuote = quotes[quotes.length - 1];
  const mid = lastQuote?.bid_price && lastQuote?.ask_price ? (lastQuote.bid_price + lastQuote.ask_price) / 2 : null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">历史盘口</h1>
          <p className="text-sm text-muted-foreground">回放任意交易日的期权 Quotes / Trades 与锚定成交量分布（Volume Profile）</p>
        </div>
        <div className="w-72"><TickerSearch current={ticker} onSelect={t => setTicker(t.ticker)} /></div>
      </div>

      {ticker && (
        <div className="rounded-lg border border-border bg-card/40 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">日期</span>
            <DatePicker value={date} onChange={(v) => v && setDate(v)} max={todayISO()} />
          </div>
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
          <Button onClick={loadDay} disabled={!optionTicker || loading} className="ml-auto h-8 gap-2 font-mono text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            加载该日
          </Button>
        </div>
      )}

      {error && <div className="text-xs font-mono text-bear border border-bear/30 bg-bear/5 p-2 rounded">{error}</div>}

      {optionTicker && (quotes.length > 0 || trades.length > 0) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="合约" value={optionTicker.replace("O:", "")} mono />
          <Stat label="Quotes" value={quotes.length.toLocaleString()} />
          <Stat label="Trades" value={`${trades.length.toLocaleString()} 笔 / ${tradeVol.toLocaleString()} 张`} />
          <Stat label="VWAP" value={profile.vwap ? `$${profile.vwap.toFixed(2)}` : "—"} />
          <Stat label="POC（成交最密价位）" value={profile.poc ? `$${profile.poc.toFixed(2)}` : "—"} tone="bull" />
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="text-sm font-semibold mb-2">Quotes 深度热力图 · {date} <span className="text-xs text-muted-foreground ml-2">绿=bid 红=ask · 颜色越亮 size 越大</span></div>
        {quotes.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground font-mono">
            {loading ? "加载中…" : "选择合约与日期后点击「加载该日」"}
          </div>
        ) : (
          <HeatmapCanvas points={quotePoints} width={1100} height={360} timeBinMs={60_000} priceBin={0.05} colorMode="bidask" refPrice={mid} />
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <div className="text-sm font-semibold mb-2">Trades 成交热力图 · {date}</div>
          {trades.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground font-mono text-center px-6">
              {loading ? "加载中…" : "该合约在所选日期内无成交记录。"}
            </div>
          ) : (
            <HeatmapCanvas points={tradePoints} width={900} height={300} timeBinMs={60_000} priceBin={0.02} colorMode="single" refPrice={mid} />
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4">
          <div className="text-sm font-semibold mb-2">锚定成交量 <span className="text-xs text-muted-foreground ml-1">Volume Profile</span></div>
          {profile.bins.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground font-mono">无数据</div>
          ) : (
            <div className="space-y-[2px]">
              {profile.bins.map((b, i) => {
                const w = profile.max ? (b.vol / profile.max) * 100 : 0;
                const isPoc = Math.abs(b.price - profile.poc) < 1e-9;
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="w-14 text-right tabular-nums text-muted-foreground">${b.price.toFixed(2)}</span>
                    <div className="flex-1 h-3 bg-background/50 relative">
                      <div
                        className={isPoc ? "h-full bg-primary" : "h-full bg-primary/40"}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <span className="w-14 text-right tabular-nums text-muted-foreground">{b.vol.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 text-[10px] font-mono text-muted-foreground">
            POC（Point of Control）= 该日成交量最集中的价位，常被视为多空争夺的「铆钉点」。
          </div>
        </div>
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