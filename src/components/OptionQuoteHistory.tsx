import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import { getOptionQuotes } from "@/lib/polygon";
import { fmt } from "@/lib/optionUtils";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToNs(iso: string, endOfDay = false): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return dt.getTime() * 1_000_000;
}

export interface OptionQuoteHistoryProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  optionTicker: string | null;
  label?: string; // e.g. "AAPL 240621 C 200"
}

export default function OptionQuoteHistory({ open, onOpenChange, optionTicker, label }: OptionQuoteHistoryProps) {
  const [date, setDate] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);

  async function load() {
    if (!optionTicker) return;
    setLoading(true); setError(null);
    try {
      const data = await getOptionQuotes(optionTicker, {
        gte: isoToNs(date, false),
        lte: isoToNs(date, true),
        limit: 50000,
        order: "asc",
      });
      setQuotes(data);
    } catch (e: any) {
      setError(e?.message ?? "加载失败");
      setQuotes([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open && optionTicker) load(); /* eslint-disable-next-line */ }, [open, optionTicker, date]);

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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            历史 Bid / Ask · <span className="text-primary">{label ?? optionTicker}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">日期</span>
          <DatePicker value={date} onChange={setDate} />
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "刷新"}
          </Button>
          {stats && (
            <span className="ml-auto text-[11px] font-mono text-muted-foreground">
              {stats.points} ticks · bid {fmt(stats.bidLow)}–{fmt(stats.bidHigh)} · ask {fmt(stats.askLow)}–{fmt(stats.askHigh)}
              {stats.spreadAvg != null && <> · spread≈{fmt(stats.spreadAvg, 3)}</>}
            </span>
          )}
        </div>

        <div className="h-[420px] mt-2 rounded-md border border-border bg-card/40 p-2">
          {error && <div className="p-4 text-xs text-destructive">{error}</div>}
          {!error && !loading && chartData.length === 0 && (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">该日无报价数据</div>
          )}
          {!error && chartData.length > 0 && (
            <ChartSizer>
              {({ width, height }) => (
              <AreaChart width={width} height={height} data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                  labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                  formatter={(v: any) => (typeof v === "number" ? v.toFixed(3) : v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ask" stroke="hsl(var(--bear))" fill="url(#askFill)" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="bid" stroke="hsl(var(--bull))" fill="url(#bidFill)" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="mid" stroke="hsl(var(--primary))" fill="none" dot={false} isAnimationActive={false} />
              </AreaChart>
              )}
            </ChartSizer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}