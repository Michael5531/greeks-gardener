import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { searchTickers } from "@/lib/polygon";

export default function TickerSearch({ onSelect }: { onSelect: (t: { ticker: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const t = useRef<number | null>(null);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (!q.trim()) { setResults([]); return; }
    t.current = window.setTimeout(async () => {
      try { setResults(await searchTickers(q)); setOpen(true); }
      catch { /* ignore */ }
    }, 300);
  }, [q]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-9 font-mono"
        placeholder="搜索美股代码 (AAPL, TSLA, SPY…)"
        value={q}
        onChange={e => setQ(e.target.value.toUpperCase())}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 max-h-72 overflow-auto rounded-md border border-border bg-popover elevated">
          {results.map(r => (
            <button
              key={r.ticker}
              className="w-full text-left px-3 py-2 hover:bg-secondary flex items-center gap-3"
              onMouseDown={() => { onSelect({ ticker: r.ticker, name: r.name }); setQ(""); setOpen(false); }}
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