import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import { getOptionQuotes, callPolygon } from "@/lib/polygon";
import { fmt } from "@/lib/optionUtils";
import { bsImpliedVol, bsGreeks, type OptType } from "@/lib/blackScholes";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToNs(iso: string, endOfDay = false): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return dt.getTime() * 1_000_000;
}

type HistoryRange = "1y" | "3y" | "5y" | "max";

function historyStartISO(range: HistoryRange) {
  if (range === "max") return "2005-01-01";
  const years = range === "5y" ? 5 : range === "3y" ? 3 : 1;
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const HISTORY_LABEL: Record<HistoryRange, string> = {
  "1y": "过去 1 年",
  "3y": "过去 3 年",
  "5y": "过去 5 年",
  max: "最长可用",
};

export interface OptionQuoteHistoryProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  optionTicker: string | null;
  label?: string;
  /** Underlying ticker, e.g. "SNDK" — required for IV/Greeks + underlying chart. */
  underlying?: string;
  strike?: number;
  /** ISO yyyy-mm-dd */
  expiration?: string;
  type?: OptType;
}

export default function OptionQuoteHistory({
  open, onOpenChange, optionTicker, label, underlying, strike, expiration, type,
}: OptionQuoteHistoryProps) {
  const [date, setDate] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [spotMin, setSpotMin] = useState<any[]>([]);   // intraday 1-min underlying bars
  const [optDaily, setOptDaily] = useState<any[]>([]); // daily option OHLC
  const [spotDaily, setSpotDaily] = useState<any[]>([]); // daily underlying bars
  const [tab, setTab] = useState("intraday");
  const [historyRange, setHistoryRange] = useState<HistoryRange>("max");
  const [historySource, setHistorySource] = useState<string>("aggs");

  async function loadIntraday() {
    if (!optionTicker) return;
    setLoading(true); setError(null);
    try {
      if (underlying) {
        const r = await callPolygon<{ quotes?: any[]; underlying_minutes?: any[]; fallback?: boolean; messages?: string[] }>("option-intraday-pair", {
          option_ticker: optionTicker, underlying, date,
          gte: isoToNs(date, false), lte: isoToNs(date, true),
          limit: 50000,
        });
        const qs = r.quotes ?? [];
        const um = r.underlying_minutes ?? [];
        setQuotes(qs);
        setSpotMin(um);
        // Only treat as a hard error if the option quotes themselves failed.
        // If only the underlying 1-min aggregates are missing (plan limits / off-hours),
        // keep the bid/ask chart visible and just log the warning.
        if (qs.length === 0 && r.messages?.length) {
          setError(r.messages.join("；"));
        } else if (r.messages?.length) {
          console.warn("[OptionQuoteHistory] underlying minutes warning", r.messages);
        }
      } else {
        const q = await getOptionQuotes(optionTicker, {
          gte: isoToNs(date, false), lte: isoToNs(date, true),
          limit: 50000, order: "asc",
        });
        setQuotes(q); setSpotMin([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "加载失败"); setQuotes([]); setSpotMin([]);
    } finally { setLoading(false); }
  }

  async function loadHistory() {
    if (!optionTicker || !underlying) {
      console.warn("[OptionQuoteHistory] loadHistory skipped", { optionTicker, underlying });
      return;
    }
    try {
      const today = todayISO();
      const from = historyStartISO(historyRange);
      const r = await callPolygon<{ option?: any[]; underlying?: any[]; option_source?: string; fallback?: boolean; messages?: string[] }>("option-history-pair", {
        option_ticker: optionTicker, underlying, from, to: today,
      });
      setOptDaily(r.option ?? []);
      setSpotDaily(r.underlying ?? []);
      setHistorySource(r.option_source ?? "aggs");
      if (r.fallback && r.messages?.length) console.warn("[OptionQuoteHistory] partial history fallback", r.messages);
    } catch (e) {
      console.warn("[OptionQuoteHistory] loadHistory error", e);
      setOptDaily([]); setSpotDaily([]);
      setHistorySource("aggs");
    }
  }

  useEffect(() => {
    if (!open || !optionTicker) return;
    loadIntraday();
    /* eslint-disable-next-line */
  }, [open, optionTicker, date, underlying]);

  useEffect(() => {
    if (!open || !optionTicker || !underlying) return;
    loadHistory();
    /* eslint-disable-next-line */
  }, [open, optionTicker, underlying, historyRange]);

  // Down-sample to ~600 points by binning timestamps for snappy charting.
  const chartData = useMemo(() => {
    if (!quotes.length) return [];
    const targetPts = 600;
    const step = Math.max(1, Math.floor(quotes.length / targetPts));
    const out: any[] = [];
    for (let i = 0; i < quotes.length; i += step) {
      const slice = quotes.slice(i, i + step);
      let bidSum = 0, askSum = 0, bidN = 0, askN = 0;
      for (const q of slice) {
        const b = q.bid_price ?? q.bid; const a = q.ask_price ?? q.ask;
        if (typeof b === "number" && b > 0) { bidSum += b; bidN++; }
        if (typeof a === "number" && a > 0) { askSum += a; askN++; }
      }
      const ts = (slice[Math.floor(slice.length / 2)].sip_timestamp ?? slice[0].sip_timestamp) / 1_000_000;
      out.push({
        t: ts,
        bid: bidN ? bidSum / bidN : null,
        ask: askN ? askSum / askN : null,
        mid: bidN && askN ? (bidSum / bidN + askSum / askN) / 2 : null,
      });
    }
    return out;
  }, [quotes]);

  // Look up spot at a timestamp from 1-min bars (carry-forward).
  const spotAt = useMemo(() => {
    // Prefer 1-min bars on the chosen day; fall back to most recent daily close
    // so IV/Greeks still render when intraday minute aggregates are unavailable
    // (off-hours, free tier, or missing minute data for the symbol).
    const fallback = spotDaily.length ? spotDaily[spotDaily.length - 1].c : null;
    if (!spotMin.length) {
      return (_: number) => fallback;
    }
    const arr = spotMin.map(b => ({ t: b.t, c: b.c })).sort((a, b) => a.t - b.t);
    return (ts: number) => {
      let lo = 0, hi = arr.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].t <= ts) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return idx >= 0 ? arr[idx].c : (arr[0]?.c ?? fallback);
    };
  }, [spotMin, spotDaily]);

  // Per-tick implied vol + greeks for the chosen day.
  const greeksIntra = useMemo(() => {
    if (!chartData.length || !strike || !expiration || !type) return [];
    const expMs = new Date(expiration + "T16:00:00").getTime();
    const out: any[] = [];
    for (const p of chartData) {
      if (p.mid == null) continue;
      const S = spotAt(p.t); if (!S) continue;
      const T = Math.max((expMs - p.t) / (365 * 24 * 3600 * 1000), 1 / 365 / 24);
      const iv = bsImpliedVol(p.mid, S, strike, T, 0.045, type);
      if (iv == null) continue;
      const g = bsGreeks(S, strike, T, 0.045, iv, type);
      out.push({ t: p.t, iv: iv * 100, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, spot: S });
    }
    return out;
  }, [chartData, spotAt, strike, expiration, type]);

  // Daily option K-line + per-day implied IV using close.
  const optKline = useMemo(() => {
    if (!optDaily.length) return [];
    const spotByDay = new Map<string, number>();
    for (const b of spotDaily) {
      const d = new Date(b.t).toISOString().slice(0, 10);
      spotByDay.set(d, b.c);
    }
    const expMs = expiration ? new Date(expiration + "T16:00:00").getTime() : null;
    return optDaily.map(b => {
      const day = new Date(b.t).toISOString().slice(0, 10);
      const S = spotByDay.get(day);
      let iv: number | null = null;
      if (S && strike && type && expMs && b.c > 0) {
        const T = Math.max((expMs - b.t) / (365 * 24 * 3600 * 1000), 1 / 365);
        const v = bsImpliedVol(b.c, S, strike, T, 0.045, type);
        iv = v == null ? null : v * 100;
      }
      return {
        t: b.t, day,
        o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
        range: [b.l, b.h] as [number, number],
        iv, spot: S ?? null,
      };
    });
  }, [optDaily, spotDaily, strike, expiration, type]);

  const spotKline = useMemo(() => spotDaily.map(b => ({
    t: b.t, o: b.o, h: b.h, l: b.l, c: b.c,
    range: [b.l, b.h] as [number, number],
  })), [spotDaily]);

  const optYDomain = useMemo<[number, number] | undefined>(() => {
    if (!optKline.length) return undefined;
    let lo = Infinity, hi = -Infinity;
    for (const d of optKline) { if (d.l < lo) lo = d.l; if (d.h > hi) hi = d.h; }
    const pad = (hi - lo) * 0.08 || 1;
    return [Math.max(0, lo - pad), hi + pad];
  }, [optKline]);

  const spotYDomain = useMemo<[number, number] | undefined>(() => {
    if (!spotKline.length) return undefined;
    let lo = Infinity, hi = -Infinity;
    for (const d of spotKline) { if (d.l < lo) lo = d.l; if (d.h > hi) hi = d.h; }
    if (strike != null) { if (strike < lo) lo = strike; if (strike > hi) hi = strike; }
    const pad = (hi - lo) * 0.06 || 1;
    return [Math.max(0, lo - pad), hi + pad];
  }, [spotKline, strike]);

  const stats = useMemo(() => {
    const bids = chartData.map(d => d.bid).filter((v): v is number => v != null);
    const asks = chartData.map(d => d.ask).filter((v): v is number => v != null);
    if (!bids.length) return null;
    return {
      bidLow: Math.min(...bids), bidHigh: Math.max(...bids),
      askLow: Math.min(...asks), askHigh: Math.max(...asks),
      spreadAvg: bids.length === asks.length
        ? bids.reduce((s, b, i) => s + (asks[i] - b), 0) / bids.length : null,
      points: quotes.length,
    };
  }, [chartData, quotes.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            历史 Bid / Ask · <span className="text-primary">{label ?? optionTicker}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">日内日期</span>
          <DatePicker value={date} onChange={setDate} />
          <span className="text-xs text-muted-foreground">历史范围</span>
          <Select value={historyRange} onValueChange={(v) => setHistoryRange(v as HistoryRange)}>
            <SelectTrigger className="h-8 w-28 text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1y">1 年</SelectItem>
              <SelectItem value="3y">3 年</SelectItem>
              <SelectItem value="5y">5 年</SelectItem>
              <SelectItem value="max">最长</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => { loadIntraday(); loadHistory(); }} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "刷新"}
          </Button>
          {stats && (
            <span className="ml-auto text-[11px] font-mono text-muted-foreground">
              {stats.points} ticks · bid {fmt(stats.bidLow)}–{fmt(stats.bidHigh)} · ask {fmt(stats.askLow)}–{fmt(stats.askHigh)}
              {stats.spreadAvg != null && <> · spread≈{fmt(stats.spreadAvg, 3)}</>}
            </span>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList>
            <TabsTrigger value="intraday">日内 Bid/Ask + IV/Greeks</TabsTrigger>
            <TabsTrigger value="history">历史 K线 + 标的</TabsTrigger>
            <TabsTrigger value="explain">希腊字母影响</TabsTrigger>
          </TabsList>

          <TabsContent value="intraday" className="space-y-3">
            <ChartCard title="Bid / Ask / Mid（当日）" height={300}>
              {error && <div className="p-4 text-xs text-destructive">{error}</div>}
              {!error && !loading && chartData.length === 0 && (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">该日无报价数据</div>
              )}
              {!error && chartData.length > 0 && (
                <ChartSizer>{({ width, height }) => (
                  <AreaChart width={width} height={height} data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                    <defs>
                      <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--bear))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--bear))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--bull))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--bull))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
                      tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontFamily: "JetBrains Mono" }}
                      stroke="hsl(var(--muted-foreground))" tickMargin={8} minTickGap={80} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontFamily: "JetBrains Mono" }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                      formatter={(v: any) => (typeof v === "number" ? v.toFixed(3) : v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="ask" stroke="hsl(var(--bear))" fill="url(#askFill)" dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="bid" stroke="hsl(var(--bull))" fill="url(#bidFill)" dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="mid" stroke="hsl(var(--primary))" fill="none" dot={false} isAnimationActive={false} />
                  </AreaChart>
                )}</ChartSizer>
              )}
            </ChartCard>

            <ChartCard title="IV 隐含波动率（%）— 由 mid 反解" height={200}>
              {greeksIntra.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground text-center px-4">
                  {!underlying || !strike || !expiration || !type
                    ? "缺少合约元数据"
                    : chartData.length === 0
                      ? "该日无报价，无法反解 IV"
                      : "无法获取标的同期价格（分钟与日线均为空），无法计算 IV/Greeks"}
                </div>
              ) : (
                <ChartSizer>{({ width, height }) => (
                  <LineChart width={width} height={height} data={greeksIntra} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
                      tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      minTickGap={80} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${v.toFixed(0)}%`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                      formatter={(v: any) => `${(v as number).toFixed(2)}%`} />
                    <Line type="monotone" dataKey="iv" stroke="hsl(var(--primary))" dot={false} isAnimationActive={false} />
                  </LineChart>
                )}</ChartSizer>
              )}
            </ChartCard>

            <ChartCard title="希腊字母（Δ / Γ×100 / Vega / Θ）" height={220}>
              {greeksIntra.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">无数据</div>
              ) : (
                <ChartSizer>{({ width, height }) => (
                  <LineChart width={width} height={height}
                    data={greeksIntra.map(g => ({ ...g, gamma100: g.gamma * 100 }))}
                    margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
                      tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      minTickGap={80} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                      formatter={(v: any) => (typeof v === "number" ? v.toFixed(4) : v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="delta" name="Δ" stroke="hsl(var(--bull))" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="gamma100" name="Γ×100" stroke="hsl(var(--primary))" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="vega" name="Vega" stroke="hsl(var(--bear))" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="theta" name="Θ" stroke="hsl(var(--muted-foreground))" dot={false} isAnimationActive={false} />
                  </LineChart>
                )}</ChartSizer>
              )}
            </ChartCard>
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <ChartCard title={`期权日 K 线（${HISTORY_LABEL[historyRange]}，按合约上市日期显示）`} height={280}>
              {optKline.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground text-center px-4">
                  暂无历史 K 线；部分新上市或远月合约本身可能只有很短交易历史
                </div>
              ) : (
                <ChartSizer>{({ width, height }) => (
                  <ComposedChart width={width} height={height} data={optKline} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="category"
                      tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      minTickGap={40} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      domain={optYDomain ?? ["auto", "auto"]} width={50} tickFormatter={(v) => v.toFixed(2)} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toISOString().slice(0, 10)}
                      formatter={(v: any, name: string) => {
                        if (name === "range" && Array.isArray(v)) return [`${v[0].toFixed(2)} – ${v[1].toFixed(2)}`, "L–H"];
                        return typeof v === "number" ? v.toFixed(3) : v;
                      }} />
                    <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
                  </ComposedChart>
                )}</ChartSizer>
              )}
            </ChartCard>

            <ChartCard title={`标的 ${underlying ?? ""} 同期走势（${HISTORY_LABEL[historyRange]}）`} height={220}>
              {spotKline.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">暂无数据</div>
              ) : (
                <ChartSizer>{({ width, height }) => (
                  <ComposedChart width={width} height={height} data={spotKline} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="category"
                      tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      minTickGap={40} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      domain={spotYDomain ?? ["auto", "auto"]} width={50} tickFormatter={(v) => v.toFixed(0)} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toISOString().slice(0, 10)}
                      formatter={(v: any, name: string) => {
                        if (name === "range" && Array.isArray(v)) return [`${v[0].toFixed(2)} – ${v[1].toFixed(2)}`, "L–H"];
                        return typeof v === "number" ? v.toFixed(2) : v;
                      }} />
                    {strike != null && <ReferenceLine y={strike} stroke="hsl(var(--primary))" strokeDasharray="4 4"
                      label={{ value: `K=${strike}`, fill: "hsl(var(--primary))", fontSize: 10, position: "insideTopRight" }} />}
                    <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
                  </ComposedChart>
                )}</ChartSizer>
              )}
            </ChartCard>

            <ChartCard title="历史 IV（基于每日收盘反解，%）" height={180}>
              {optKline.filter(d => d.iv != null).length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">无 IV 数据</div>
              ) : (
                <ChartSizer>{({ width, height }) => (
                  <LineChart width={width} height={height} data={optKline} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeOpacity={0.1} />
                    <XAxis dataKey="t" type="category"
                      tickFormatter={(t) => new Date(t).toISOString().slice(5, 10)}
                      tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      minTickGap={40} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${v.toFixed(0)}%`} width={50} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                      labelFormatter={(t) => new Date(t as number).toISOString().slice(0, 10)}
                      formatter={(v: any) => v == null ? "—" : `${(v as number).toFixed(2)}%`} />
                    <Line type="monotone" dataKey="iv" stroke="hsl(var(--primary))" dot={false} isAnimationActive={false} connectNulls />
                  </LineChart>
                )}</ChartSizer>
              )}
            </ChartCard>
          </TabsContent>

          <TabsContent value="explain" className="space-y-2 text-xs leading-relaxed">
            <ExplainRow letter="Δ Delta" desc="标的每变动 1 美元，期权价格变动多少。Call Δ∈(0,1)，Put Δ∈(-1,0)。可粗略理解为「等效股票仓位」与「ITM 概率」。深 ITM 趋近 ±1，深 OTM 趋近 0。" />
            <ExplainRow letter="Γ Gamma" desc="Δ 对标的的导数。Γ 越大，Δ 变化越快、方向暴露越不稳定。ATM 与临近到期时 Γ 最大；做市商净空 Γ 时容易触发 Gamma Squeeze。" />
            <ExplainRow letter="Θ Theta" desc="时间衰减。每过一天因时间损失的权利金，多头通常为负。临近到期 ATM 期权 Θ 急剧增大，是「卖方收割期」。" />
            <ExplainRow letter="ν Vega" desc="IV 每升 1%，期权价格变动多少。长期、ATM 期权 Vega 最大。买入跨式/宽跨等于做多 Vega，财报前后 IV Crush 会让多头吃大亏。" />
            <ExplainRow letter="IV" desc="市场对未来年化波动率的隐含定价。IV 上升 → 同样的价格变动需要更大的预期波动；IV Rank/Percentile 用于判断当前 IV 在历史分位上的高低。" />
            <p className="text-muted-foreground pt-2">
              如何在图中读出影响：① IV 抬升时 Bid/Ask 同步走高（Vega 推升）。② 标的快速上涨时 Δ 抬升、Γ 让 Δ 加速 → Call 价值非线性放大。
              ③ 同样的标的价格、IV 不变，临近到期时 Mid 仍下行，就是 Θ 在吃肉。
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ChartCard({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card/40">
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border/60">{title}</div>
      <div className="p-2" style={{ height }}>{children}</div>
    </div>
  );
}

/** Custom candlestick shape used by recharts <Bar dataKey="range" />. */
function Candle(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || typeof payload.o !== "number") return null;
  const { o, h, l, c } = payload;
  if (h === l) {
    const cx = x + width / 2;
    return <line x1={cx - width * 0.35} x2={cx + width * 0.35} y1={y} y2={y}
      stroke="hsl(var(--muted-foreground))" strokeWidth={1} />;
  }
  const isBull = c >= o;
  const color = isBull ? "hsl(var(--bull))" : "hsl(var(--bear))";
  const top = Math.max(o, c);
  const bot = Math.min(o, c);
  const bodyTop = y + ((h - top) / (h - l)) * height;
  const bodyBot = y + ((h - bot) / (h - l)) * height;
  const bodyH = Math.max(1, bodyBot - bodyTop);
  const cx = x + width / 2;
  const bodyW = Math.max(2, Math.min(10, width * 0.7));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
}

function ExplainRow({ letter, desc }: { letter: string; desc: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-border/60 bg-card/40 p-2">
      <div className="font-mono text-primary w-20 shrink-0">{letter}</div>
      <div className="text-foreground/90">{desc}</div>
    </div>
  );
}