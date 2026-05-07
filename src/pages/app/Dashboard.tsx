import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TickerSearch from "@/components/TickerSearch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { getSnapshot } from "@/lib/polygon";
import { Link } from "react-router-dom";

type WL = { id: string; ticker: string };

export default function Dashboard() {
  const [items, setItems] = useState<WL[]>([]);
  const [snaps, setSnaps] = useState<Record<string, any>>({});

  async function load() {
    const { data, error } = await supabase.from("watchlist").select("id, ticker").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    items.forEach(async (it) => {
      if (snaps[it.ticker]) return;
      try {
        const s = await getSnapshot(it.ticker);
        setSnaps(prev => ({ ...prev, [it.ticker]: s }));
      } catch { /* ignore */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function add(ticker: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("watchlist").insert({ ticker, user_id: user.id });
    if (error) return toast.error(error.message);
    toast.success(`${ticker} 已加入自选`);
    load();
  }
  async function remove(id: string) {
    await supabase.from("watchlist").delete().eq("id", id);
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">概览</h1>
        <p className="text-sm text-muted-foreground">管理自选标的，快速跳转到期权链与 Greeks 分析。</p>
      </div>

      <div className="max-w-xl">
        <TickerSearch onSelect={t => add(t.ticker)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.length === 0 && (
          <div className="col-span-full p-8 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
            自选为空，搜索股票添加。
          </div>
        )}
        {items.map(it => {
          const s = snaps[it.ticker];
          const day = s?.day; const prev = s?.prevDay;
          const price = day?.c ?? prev?.c;
          const chg = s?.todaysChange ?? 0;
          const chgPct = s?.todaysChangePerc ?? 0;
          const up = chg >= 0;
          return (
            <div key={it.id} className="rounded-lg border border-border bg-card/50 p-4 group hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-bold text-lg">{it.ticker}</div>
                  <div className="text-xs text-muted-foreground">{s?.day?.v ? `Vol ${(s.day.v/1e6).toFixed(1)}M` : "—"}</div>
                </div>
                <button onClick={() => remove(it.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="font-mono text-2xl">{price ? `$${price.toFixed(2)}` : "—"}</div>
                {price && (
                  <div className={`text-xs font-mono flex items-center gap-1 ${up ? "text-bull" : "text-bear"}`}>
                    {up ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
                    {chg.toFixed(2)} ({chgPct.toFixed(2)}%)
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/app/chain?ticker=${it.ticker}`}><Button size="sm" variant="secondary">期权链</Button></Link>
                <Link to={`/app/greeks?ticker=${it.ticker}`}><Button size="sm" variant="ghost">3D Greeks</Button></Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}