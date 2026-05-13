import { useEffect, useMemo, useRef, useState } from "react";
import TickerSearch from "@/components/TickerSearch";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { useOptionsChain } from "@/hooks/useOptionsChain";
import { fmt } from "@/lib/optionUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import DTEStackedChart, { buildExpColors } from "@/components/charts/DTEStackedChart";
import { useLiveQuote } from "@/hooks/useLiveQuote";
import { useComputeGEX } from "@/hooks/useComputeGEX";
import { useComputeIVSurface } from "@/hooks/useComputeIVSurface";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function AIMarkdown({ text }: { text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none max-h-[600px] overflow-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export default function GEX() {
  const [ticker, setTicker] = useSelectedTicker();
  const { expirations, loading: expLoading } = useOptionsChain(ticker || null);
  const [selectedExps, setSelectedExps] = useState<string[]>([]);
  useEffect(() => { setSelectedExps([]); }, [ticker]);
  const [metric, setMetric] = useState<"oi" | "gex">("gex");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { quote } = useLiveQuote(ticker || null, 4000);

  const pickClosestExp = (days: number, list: string[]): string | undefined => {
    if (!list.length) return undefined;
    const target = new Date(); target.setDate(target.getDate() + days);
    const t = target.getTime();
    let best = list[0]; let bestDiff = Math.abs(new Date(best).getTime() - t);
    for (const e of list) {
      const d = Math.abs(new Date(e).getTime() - t);
      if (d < bestDiff) { bestDiff = d; best = e; }
    }
    return best;
  };

  useEffect(() => {
    if (!expirations.length) { setSelectedExps([]); return; }
    const defaults = [7, 14, 21].map(d => pickClosestExp(d, expirations)).filter((x): x is string => !!x);
    setSelectedExps(Array.from(new Set(defaults)));
  }, [expirations]);

  // Backend computations
  const { data: gex, loading: gexLoading } = useComputeGEX(ticker, selectedExps);
  const { data: ivs, loading: ivsLoading } = useComputeIVSurface(
    metric === "oi" ? ticker : null, // OI pivot only needed for "oi" metric
    selectedExps,
  );
  const loading = expLoading || gexLoading || (metric === "oi" && ivsLoading);

  const spot = quote?.price ?? gex?.spot ?? null;
  const expColors = useMemo(() => buildExpColors(selectedExps), [selectedExps]);

  const strikePivot = metric === "gex" ? (gex?.rows ?? []) : (ivs?.strikePivotOI ?? []);
  const expPivot = metric === "gex"
    ? (gex?.expRows ?? [])
    : (ivs?.byExp ?? []).map((r: any) => ({
        exp: r.exp,
        [`${r.exp}__c`]: r.callOI,
        [`${r.exp}__p`]: -r.putOI,
      }));
  const totalGEX = gex?.total ?? 0;
  const zeroGamma = gex?.flip ?? null;
  const totalContracts = gex?.contractCount ?? 0;
  const totalOI = gex?.totalOI ?? 0;

  // Build "rows" payload for AI: net GEX per strike (sum across selected expirations)
  const rowsForAI = useMemo(() => {
    return strikePivot.map((r: any) => {
      let callGex = 0, putGex = 0;
      for (const k of Object.keys(r)) {
        if (k.endsWith("__c")) callGex += Number(r[k]) || 0;
        else if (k.endsWith("__p")) putGex += Number(r[k]) || 0; // already negative-signed
      }
      return { strike: r.strike, callGex, putGex, net: callGex + putGex };
    });
  }, [strikePivot]);

  async function runAIAnalysis() {
    if (!ticker || !strikePivot.length || !spot) {
      toast.error("请先加载数据");
      return;
    }
    setAiText("");
    setAiLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-gex`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      body: JSON.stringify({ ticker, spot, expirations: selectedExps, totalGEX, zeroGamma, rows: rowsForAI }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        toast.error(err.error || "AI 分析失败");
        setAiLoading(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) setAiText(prev => prev + c);
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GEX 分析</h1>
          <p className="text-sm text-muted-foreground">Gamma Exposure 按行权价分布 · 识别 Pin 点与 Zero Gamma Level</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="gex" className="text-xs font-mono">Net GEX</TabsTrigger>
              <TabsTrigger value="oi" className="text-xs font-mono">OI</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="w-72"><TickerSearch onSelect={t => setTicker(t.ticker)} /></div>
        </div>
      </div>

      {ticker && expirations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">到期日:</span>
          {selectedExps.map(e => (
            <Badge key={e} variant="secondary" className="font-mono gap-1 pr-1" style={{ borderLeft: `3px solid ${expColors[e]}` }}>
              {e}
              <button onClick={() => setSelectedExps(prev => prev.filter(x => x !== e))} className="hover:bg-muted rounded p-0.5" aria-label={`移除 ${e}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-mono"><Plus className="h-3 w-3 mr-1" /> 添加</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 max-h-80 overflow-auto">
              <div className="space-y-1">
                {expirations.map(e => {
                  const checked = selectedExps.includes(e);
                  return (
                    <label key={e} className="flex items-center gap-2 text-sm font-mono px-2 py-1 rounded hover:bg-muted cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={(c) => setSelectedExps(prev => c ? Array.from(new Set([...prev, e])).sort() : prev.filter(x => x !== e))} />
                      {e}
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => {
              const defaults = [7, 14, 21].map(d => pickClosestExp(d, expirations)).filter((x): x is string => !!x);
              setSelectedExps(Array.from(new Set(defaults)));
            }}>重置默认</Button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Spot" value={spot ? `$${fmt(spot)}` : "—"} />
        <Stat label="Total Net GEX" value={Number.isFinite(totalGEX) ? fmt(totalGEX / 1e6, 2) + "M" : "—"} positive={totalGEX >= 0} />
        <Stat label="Zero Gamma" value={zeroGamma ? `$${fmt(zeroGamma)}` : "—"} />
        <Stat label="合约数" value={`${totalContracts}`} />
        <Stat label="总 OI" value={totalOI >= 1e6 ? `${(totalOI/1e6).toFixed(2)}M` : totalOI >= 1e3 ? `${(totalOI/1e3).toFixed(1)}K` : `${totalOI}`} />
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold">{metric === "gex" ? "Net GEX" : "未平仓量 OI"} · 按行权价</h3>
          <span className="text-[11px] text-muted-foreground">Call 在上 / Put 在下 · 不同到期日颜色区分</span>
        </div>
        <div className="h-[640px]">
        {loading && <div className="text-xs text-muted-foreground font-mono">加载中…</div>}
        {!ticker && <div className="grid place-items-center h-full text-muted-foreground">请先搜索标的</div>}
        {ticker && strikePivot.length > 0 && (
          <DTEStackedChart
            data={strikePivot}
            xKey="strike"
            exps={[...selectedExps].sort()}
            colors={expColors}
            refX={spot}
            refLines={zeroGamma ? [{ x: zeroGamma, label: `Zero γ ${zeroGamma.toFixed(0)}`, color: "hsl(var(--accent))" }] : undefined}
          />
        )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold">{metric === "gex" ? "Net GEX" : "OI"} · 按到期日</h2>
            <p className="text-xs text-muted-foreground">每个到期日 Call 在上 / Put 在下，颜色与上图一致</p>
          </div>
        </div>
        <div className="h-[420px]">
          {expPivot.length > 0 ? (
            <DTEStackedChart data={expPivot} xKey="exp" exps={[...selectedExps].sort()} colors={expColors} />
          ) : (
            <div className="grid place-items-center h-full text-xs text-muted-foreground">暂无数据</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              AI GEX 解读 + 期权策略
            </h2>
            <p className="text-xs text-muted-foreground">基于当前 GEX 结构推荐所有主流期权组合</p>
          </div>
          <Button onClick={runAIAnalysis} disabled={aiLoading || !strikePivot.length} size="sm">
            {aiLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />分析中</> : "运行 AI 分析"}
          </Button>
        </div>
        {aiText ? (
          <AIMarkdown text={aiText} />
        ) : (
          <div className="text-xs text-muted-foreground py-8 text-center">
            {strikePivot.length ? "点击右上角运行 AI 分析" : "请先选择标的并加载数据"}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-mono mt-1 ${positive === undefined ? "" : positive ? "text-bull" : "text-bear"}`}>{value}</div>
    </div>
  );
}