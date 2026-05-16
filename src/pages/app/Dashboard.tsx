import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TickerSearch from "@/components/TickerSearch";
import { toast } from "sonner";
import { useT } from "@/i18n";
import HeroTicker from "@/components/HeroTicker";
import WatchCard from "@/components/WatchCard";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";

type WL = { id: string; ticker: string };

export default function Dashboard() {
  const [items, setItems] = useState<WL[]>([]);
  const t = useT();
  const [selectedTicker, setSelectedTicker] = useSelectedTicker();

  async function load() {
    const { data, error } = await supabase.from("watchlist").select("id, ticker").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add(ticker: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("watchlist").insert({ ticker, user_id: user.id });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    setSelectedTicker(ticker);
    toast.success(ticker);
    load();
  }
  async function remove(id: string) {
    await supabase.from("watchlist").delete().eq("id", id);
    load();
  }

  return (
    <div className="px-6 md:px-10 py-10 space-y-10 max-w-[1480px]">
      {/* Editorial masthead */}
      <header className="flex items-end justify-between gap-6 border-b border-foreground/80 pb-5">
        <div>
          <div className="editorial-eyebrow mb-3">№01 — Markets · Watchlist</div>
          <h1 className="editorial-title">
            {t.dashboard.title}<span className="text-primary font-serif-display italic">.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl font-serif-display italic text-base">
            {t.dashboard.subtitle}
          </p>
        </div>
        <div className="hidden md:block text-right text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
          <div>Vol. 26 · Issue {new Date().getMonth() + 1}</div>
          <div className="mt-1">{items.length.toString().padStart(2, "0")} Holdings</div>
        </div>
      </header>

      {selectedTicker && (
        <section className="border-y border-border py-6">
          <div className="editorial-eyebrow mb-3">The Lead · Live Quote</div>
          <HeroTicker ticker={selectedTicker} />
        </section>
      )}

      <section className="grid md:grid-cols-12 gap-6 items-end">
        <div className="md:col-span-4">
          <div className="editorial-eyebrow mb-2">Search</div>
          <div className="font-serif-display italic text-xl text-foreground">
            Add a new underlying →
          </div>
        </div>
        <div className="md:col-span-8">
          <TickerSearch current={selectedTicker} onSelect={t => add(t.ticker)} />
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b border-border pb-3 mb-0">
          <div className="flex items-baseline gap-3">
            <span className="editorial-eyebrow">№02</span>
            <h2 className="font-serif-display text-3xl text-foreground">The Watchlist</h2>
          </div>
          <span className="editorial-eyebrow hidden sm:block">{items.length} entries</span>
        </div>

        {items.length === 0 ? (
          <div className="py-20 text-center border-b border-border">
            <p className="font-serif-display italic text-2xl text-muted-foreground">
              {t.dashboard.empty}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 -mx-px">
            {items.map(it => (
              <WatchCard
                key={it.id}
                ticker={it.ticker}
                active={selectedTicker === it.ticker}
                onSelect={() => setSelectedTicker(it.ticker)}
                onRemove={() => remove(it.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}