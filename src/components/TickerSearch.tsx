import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Star, Check } from "lucide-react";
import { searchTickers } from "@/lib/polygon";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function TickerSearch({ onSelect }: { onSelect: (t: { ticker: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<{ ticker: string }[]>([]);
  const [staged, setStaged] = useState<{ ticker: string; name: string } | null>(null);
  const t = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("watchlist").select("ticker").order("created_at", { ascending: false });
      if (data) setWatchlist(data);
    })();
  }, []);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (!q.trim()) { setResults([]); return; }
    t.current = window.setTimeout(async () => {
      try { setResults(await searchTickers(q)); setOpen(true); }
      catch { /* ignore */ }
    }, 300);
  }, [q]);

  const showWatchlist = open && !q.trim() && watchlist.length > 0;

  function stage(item: { ticker: string; name: string }) {
    setStaged(item);
    setQ(item.ticker);
    setOpen(false);
  }
  function confirm() {
    const tk = (staged?.ticker || q).trim().toUpperCase();
    if (!tk) return;
    onSelect({ ticker: tk, name: staged?.name ?? "" });
    setStaged(null);
    setQ("");
    setOpen(false);
  }

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-9 font-mono"
          placeholder="搜索美股代码后按 Enter 或点击 ✓ 确认"
          value={q}
          onChange={e => { setQ(e.target.value.toUpperCase()); setStaged(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirm(); } }}
        />
        {staged && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">待确认</span>
        )}
      </div>
      <Button type="button" size="icon" variant="secondary" onMouseDown={e => { e.preventDefault(); confirm(); }} title="确认 underlying">
        <Check className="h-4 w-4" />
      </Button>
      {showWatchlist && (
        <div className="absolute z-20 mt-1 top-full left-0 right-12 max-h-72 overflow-auto rounded-md border border-border bg-popover elevated">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60 flex items-center gap-1.5">
            <Star className="h-3 w-3" /> 自选
          </div>
          {watchlist.map(r => (
            <button
              key={r.ticker}
              className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-3"
              onMouseDown={() => stage({ ticker: r.ticker, name: "" })}
            >
              <Star className="h-3 w-3 text-primary" />
              <span className="font-mono font-semibold">{r.ticker}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && results.length > 0 && (
        <div className="absolute z-20 mt-1 top-full left-0 right-12 max-h-72 overflow-auto rounded-md border border-border bg-popover elevated">
          {results.map(r => (
            <button
              key={r.ticker}
              className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-3"
              onMouseDown={() => stage({ ticker: r.ticker, name: r.name })}
            >
              <span className="font-mono font-semibold w-16">{r.ticker}</span>
              <span className="text-sm text-muted-foreground truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}