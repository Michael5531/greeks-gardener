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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
      </div>

      {selectedTicker && <HeroTicker ticker={selectedTicker} />}

      <div className="max-w-xl">
        <TickerSearch onSelect={t => add(t.ticker)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.length === 0 && (
          <div className="col-span-full p-8 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
            {t.dashboard.empty}
          </div>
        )}
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
    </div>
  );
}