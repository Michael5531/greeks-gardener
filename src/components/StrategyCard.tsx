import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import ChartSizer from "@/components/charts/ChartSizer";
import { getStrategy } from "@/lib/strategies";
import { useComputePayoff } from "@/hooks/useComputePayoff";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtPct } from "@/lib/optionUtils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { dteFor } from "@/components/OptionLegsBuilder";
import { bsPrice } from "@/lib/blackScholes";

export default function StrategyCard({
  strategyId, ticker, dte, iv, onBacktest,
}: { strategyId: string; ticker: string; dte: number; iv: number; onBacktest?: () => void }) {
  const def = getStrategy(strategyId);
  const { quote } = useLiveQuote(ticker || null, 8000);
  const spot = quote?.price ?? 100;
  const firstLeg = useMemo(() => (def.legs(spot)?.[0]) ?? { type: "call" as const, side: "long" as const, strikeOffset: 0 }, [def, spot]);
  const { data: chain, expirations } = useOptionsChain(ticker || null);

  // 冻结网格使用的 spot：仅当价格相对上次冻结值偏移 >1.5% 时才重算 payoff，
  // 这样实时报价（每 8~15s 跳动）只更新参考线，不会触发整张图重渲染。
  const frozenSpotRef = useRef<number>(spot);
  const gridSpot = useMemo(() => {
    const f = frozenSpotRef.current;
    if (!f || Math.abs(spot - f) / f > 0.015) frozenSpotRef.current = spot;
    return frozenSpotRef.current;
  }, [spot]);

  const { data: po } = useComputePayoff(strategyId, gridSpot, iv, dte);
  const legs = po?.legs ?? [];
  const baseGrid = po?.grid ?? [];
  const baseBreakevens = po?.breakevens ?? [];
  const baseNetDebit = po?.netDebit ?? 0;

  // 买入合约 (实际成交) — 用于覆写理论 BS 入场价，重算 PnL。
  const [entryDate, setEntryDate] = useState<string>("");
  const [entryPremium, setEntryPremium] = useState<string>(""); // 每股
  const [marketPremium, setMarketPremium] = useState<string>(""); // 当前市场每股价

  // 已购买合约的选择（从期权链中）
  const [pickedExp, setPickedExp] = useState<string>("");
  const [pickedStrike, setPickedStrike] = useState<string>("");

  const strikesByExp = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const c of chain) {
      const e = c.details?.expiration_date, k = c.details?.strike_price, t = c.details?.contract_type;
      if (!e || k == null || t !== firstLeg.type) continue;
      if (!m.has(e)) m.set(e, []);
      const arr = m.get(e)!;
      if (!arr.includes(k)) arr.push(k);
    }
    for (const a of m.values()) a.sort((x, y) => x - y);
    return m;
  }, [chain, firstLeg.type]);

  const pickedContract = useMemo(() => {
    if (!pickedExp || !pickedStrike) return null;
    return chain.find(c =>
      c.details?.expiration_date === pickedExp &&
      c.details?.strike_price === +pickedStrike &&
      c.details?.contract_type === firstLeg.type
    ) ?? null;
  }, [chain, pickedExp, pickedStrike, firstLeg.type]);

  // 链上 mid（可能是上一交易日收盘价，盘前/夜盘后会过时）
  const staleMid = pickedContract?.last_quote
    ? (pickedContract.last_quote.bid + pickedContract.last_quote.ask) / 2
    : null;

  // 用 BS 在"当前实时 spot"下重新定价：
  //   IV 优先用链上 implied_volatility，否则用上层传入的 iv 假设
  //   T = picked 到期日距离今天的天数 / 365
  // 这能把"夜盘 spot 已涨到 230 但链 mid 还停留在昨日收盘"的情况修正过来。
  const bsLivePrice = useMemo(() => {
    if (!pickedContract || !pickedExp || !pickedStrike) return null;
    const sigma = pickedContract.implied_volatility && pickedContract.implied_volatility > 0
      ? pickedContract.implied_volatility
      : iv;
    const T = dteFor(pickedExp) / 365;
    if (!(sigma > 0) || !(T > 0) || !(spot > 0)) return null;
    return bsPrice(spot, +pickedStrike, T, 0.045, sigma, firstLeg.type);
  }, [pickedContract, pickedExp, pickedStrike, spot, iv, firstLeg.type]);

  // 选中合约后，自动把 BS 实时估值填入"当前市价"（优先 BS-live，兜底链上 mid）
  useEffect(() => {
    if (marketPremium !== "") return;
    const v = bsLivePrice ?? staleMid;
    if (v != null && Number.isFinite(v) && v > 0) setMarketPremium(v.toFixed(2));
  }, [bsLivePrice, staleMid]); // eslint-disable-line

  // Δ = 实际净 debit - 理论净 debit (按每股, 同 baseNetDebit 口径)
  const hasOverride = entryPremium !== "" && Number.isFinite(+entryPremium);
  const actualNetDebit = hasOverride ? +entryPremium : baseNetDebit;
  const shift = (actualNetDebit - baseNetDebit) * 100; // 多头入场价升高 ⇒ PnL 下移

  // today 曲线再叠加一个市场价偏移：理论 BS 在当前 spot 的 today 值 vs 实际市场价的差。
  // 这样用户填入"当前期权市价"后，曲线在 spot 处会等于真实未实现 PnL。
  const hasMarket = marketPremium !== "" && Number.isFinite(+marketPremium);
  const theoryTodayAtSpot = (() => {
    if (!baseGrid.length) return 0;
    let nearest = baseGrid[0];
    for (const g of baseGrid) if (Math.abs(g.price - spot) < Math.abs(nearest.price - spot)) nearest = g;
    return nearest.today;
  })();
  // 理论 today 在 spot 处对应的"每股期权值" ≈ baseNetDebit + theoryTodayAtSpot/100
  const theoryMarkAtSpot = baseNetDebit + theoryTodayAtSpot / 100;
  const todayMarketShift = hasMarket ? (+marketPremium - theoryMarkAtSpot) * 100 : 0;

  const grid = (hasOverride || hasMarket)
    ? baseGrid.map(g => ({
        price: g.price,
        expiry: +(g.expiry - shift).toFixed(2),
        today: +(g.today - shift + todayMarketShift).toFixed(2),
      }))
    : baseGrid;
  const breakevens = hasOverride
    ? (() => {
        const out: number[] = [];
        for (let i = 1; i < grid.length; i++) {
          const a = grid[i - 1], b = grid[i];
          if ((a.expiry <= 0 && b.expiry >= 0) || (a.expiry >= 0 && b.expiry <= 0)) {
            const denom = b.expiry - a.expiry || 1;
            out.push(+(a.price + (b.price - a.price) * (-a.expiry / denom)).toFixed(2));
          }
        }
        return out;
      })()
    : baseBreakevens;
  const maxProfit = grid.length ? Math.max(...grid.map(g => g.expiry)) : 0;
  const maxLoss = grid.length ? Math.min(...grid.map(g => g.expiry)) : 0;
  const netDebit = actualNetDebit;

  // 当前未实现 PnL（每张） = (现价 - 入场价) * 100
  const unrealizedPerContract = hasMarket && hasOverride
    ? (+marketPremium - +entryPremium) * 100
    : hasMarket
      ? (+marketPremium - baseNetDebit) * 100
      : null;

  const [hist, setHist] = useState<{ winRate: number | null; avgRet: number | null; n: number }>({ winRate: null, avgRet: null, n: 0 });
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("backtests")
        .select("metrics, params")
        .eq("ticker", ticker.toUpperCase())
        .order("created_at", { ascending: false })
        .limit(50);
      const matched = (data ?? []).filter((b: any) => b.params?.strategy_type === strategyId);
      if (!matched.length) { setHist({ winRate: null, avgRet: null, n: 0 }); return; }
      const wr = matched.reduce((s: number, b: any) => s + (b.metrics?.win_rate ?? 0), 0) / matched.length;
      const ar = matched.reduce((s: number, b: any) => s + (b.metrics?.total_return ?? 0), 0) / matched.length;
      setHist({ winRate: wr, avgRet: ar, n: matched.length });
    })();
  }, [strategyId, ticker]);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-base font-semibold">{def.name}
            {!def.engineSupported && <span className="ml-2 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">仅 Payoff（暂不支持引擎回测）</span>}
          </div>
          <div className="text-xs text-muted-foreground">{def.description}</div>
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          {ticker || "—"} · spot ${fmt(spot)} · IV {fmt(iv * 100)}% · DTE {dte}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Stat label="Max Loss" value={`$${fmt(maxLoss)}`} positive={false} />
        <Stat label="Max Profit" value={maxProfit > 1e6 ? "∞" : `$${fmt(maxProfit)}`} positive={true} />
        <Stat label={netDebit >= 0 ? "Net Debit" : "Net Credit"} value={`$${fmt(Math.abs(netDebit) * 100)}`} />
        <Stat label="Breakeven" value={breakevens.length ? breakevens.map(b => `$${fmt(b)}`).join(" / ") : "—"} mono />
        <Stat label="Win Rate（历史）" value={hist.winRate != null ? fmtPct(hist.winRate) : "—"} />
        <Stat label={`Win Fill (n=${hist.n})`} value={hist.avgRet != null ? fmtPct(hist.avgRet) : "—"} positive={hist.avgRet != null && hist.avgRet > 0} />
      </div>

      <div className="text-[11px] text-muted-foreground font-mono space-x-3">
        <span>规则：MaxLoss={def.maxLossText}</span>
        <span>· MaxProfit={def.maxProfitText}</span>
        <span>· BE={def.breakevenText}</span>
      </div>

      <div className="text-[11px] font-mono">
        <span className="text-muted-foreground">Legs：</span>
        {legs.map((l, i) => (
          <span key={i} className={`mr-3 ${l.side === "long" ? "text-bull" : "text-bear"}`}>
            {l.side === "long" ? "+" : "-"}{l.qty} {l.type.toUpperCase()} @ {l.strike} (${fmt(l.entryPrice)})
          </span>
        ))}
      </div>

      {/* 实际买入合约 — 覆写理论 BS 入场价，重算到期/今日 PnL 曲线 */}
      <div className="rounded-md border border-border/60 bg-background/30 p-3 grid md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-4 text-[11px] text-muted-foreground -mb-1">
          实际买入合约（可选）：填入"买入价"后用实际成交价重算到期 PnL；填入"当前市价"后今日 PnL 曲线在 spot 处对齐真实未实现盈亏。
        </div>
        <div className="md:col-span-4 grid md:grid-cols-3 gap-3 items-end pt-1 pb-1 border-b border-border/40">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">已购买合约 · 到期日</Label>
            <Select value={pickedExp} onValueChange={(v) => { setPickedExp(v); setPickedStrike(""); }}>
              <SelectTrigger className="h-9 text-xs font-mono"><SelectValue placeholder={expirations.length ? "选择到期" : "加载中…"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {expirations.map(e => (
                  <SelectItem key={e} value={e} className="text-xs font-mono">{e} ({dteFor(e)}d)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Strike · {firstLeg.type.toUpperCase()}</Label>
            <Select value={pickedStrike} onValueChange={setPickedStrike} disabled={!pickedExp}>
              <SelectTrigger className="h-9 text-xs font-mono"><SelectValue placeholder={pickedExp ? "选择 strike" : "先选到期"} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(strikesByExp.get(pickedExp) ?? []).map(k => (
                  <SelectItem key={k} value={String(k)} className="text-xs font-mono">{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">合约信息</Label>
            <div className="h-9 flex items-center px-2 rounded-md border border-border/40 bg-background/40 text-[11px] font-mono text-muted-foreground">
              {pickedContract ? (
                <>
                  链 mid ${staleMid != null ? staleMid.toFixed(2) : "—"}
                  <span className="mx-2">·</span>
                  <span className="text-primary">BS 实时 ${bsLivePrice != null ? bsLivePrice.toFixed(2) : "—"}</span>
                  <span className="mx-2">·</span>
                  IV {pickedContract.implied_volatility != null ? `${(pickedContract.implied_volatility * 100).toFixed(1)}%` : "—"}
                </>
              ) : "—"}
            </div>
            {pickedContract && (
              <div className="text-[10px] text-muted-foreground/80 font-mono leading-tight">
                链 mid 可能是上一交易日收盘；BS 实时 = 用当前 spot ${fmt(spot)} 重算
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">买入日期</Label>
          <DatePicker value={entryDate} onChange={setEntryDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            买入价 / 股 · 留空=理论 ${fmt(baseNetDebit)}
          </Label>
          <Input className="font-mono" placeholder={`${fmt(baseNetDebit)}`} value={entryPremium}
            onChange={e => setEntryPremium(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            当前市价 / 股 · 留空=理论 ${fmt(theoryMarkAtSpot)}
          </Label>
          <Input className="font-mono" placeholder={`${fmt(theoryMarkAtSpot)}`} value={marketPremium}
            onChange={e => setMarketPremium(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">未实现 PnL / 张</Label>
          <div className={`font-mono text-sm h-9 flex items-center px-2 rounded-md border border-border/40 bg-background/40 ${
            unrealizedPerContract == null ? "" : unrealizedPerContract > 0 ? "text-bull" : unrealizedPerContract < 0 ? "text-bear" : ""
          }`}>
            {unrealizedPerContract == null ? "—" : `${unrealizedPerContract >= 0 ? "+" : ""}$${fmt(unrealizedPerContract)}`}
          </div>
        </div>
        <div className="md:col-span-4 flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] text-muted-foreground font-mono">
            每张成本 ${fmt(Math.abs(actualNetDebit) * 100)} · 理论 BS Δ {hasOverride ? `${shift >= 0 ? "+" : ""}$${fmt(shift)}/张` : "—"}
          </div>
          {onBacktest && (
            <Button size="sm" variant="outline" onClick={onBacktest} className="text-xs">
              用以上参数回测 →
            </Button>
          )}
        </div>
      </div>

      <div className="h-80">
        <ChartSizer>
          {({ width, height }) => (
          <ComposedChart width={width} height={height} data={grid} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="hsl(var(--grid-line))" />
            <XAxis dataKey="price" tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: any, n: any) => [`$${v}`, n === "expiry" ? "到期 PnL" : "今日 PnL"]} labelFormatter={(l: any) => `Spot $${l}`} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine x={+spot.toFixed(2)} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "spot", fill: "hsl(var(--primary))", fontSize: 10 }} />
            {breakevens.map((b, i) => (
              <ReferenceLine key={i} x={b} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: "BE", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            ))}
            <Line type="monotone" dataKey="expiry" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="到期 PnL" />
            <Line type="monotone" dataKey="today" stroke="hsl(var(--accent))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="今日 PnL" />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
          </ComposedChart>
          )}
        </ChartSizer>
      </div>
    </div>
  );
}

function Stat({ label, value, positive, mono }: { label: string; value: string; positive?: boolean; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono ${mono ? "text-xs" : "text-sm"} ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}