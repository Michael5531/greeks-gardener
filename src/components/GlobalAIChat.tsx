import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, Loader2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "@/i18n";
import { useSelectedTicker } from "@/hooks/useSelectedTicker";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export default function GlobalAIChat() {
  const { t, lang } = useI18n();
  const loc = useLocation();
  const [ticker] = useSelectedTicker();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    let acc = "";
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: next,
          lang,
          context: { route: loc.pathname, ticker: ticker || null },
        }),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        setMessages(m => [...m, { role: "assistant", content: `⚠️ ${err.error || t.ai.error}` }]);
        return;
      }
      setMessages(m => [...m, { role: "assistant", content: "" }]);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) { acc += c; setMessages(m => { const out = [...m]; out[out.length - 1] = { role: "assistant", content: acc }; return out; }); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally { setLoading(false); }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label={t.ai.title}
          className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full grid place-items-center text-background shadow-lg transition-transform hover:scale-105"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" /> {t.ai.title}
            <span className="ml-auto text-[10px] text-muted-foreground font-mono">{loc.pathname}{ticker ? ` · ${ticker}` : ""}</span>
          </SheetTitle>
        </SheetHeader>
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4 text-sm">
          {messages.length === 0 && (
            <div className="text-xs text-muted-foreground p-4 rounded-md border border-dashed border-border">{t.ai.contextNote}</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}>
                {m.role === "assistant"
                  ? <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:bg-background prose-pre:text-xs prose-headings:mt-3 prose-headings:mb-1 prose-table:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                    </div>
                  : <span className="whitespace-pre-wrap">{m.content}</span>}
              </div>
            </div>
          ))}
          {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {t.ai.thinking}</div>}
        </div>
        <div className="border-t border-border p-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMessages([])} title={t.ai.clear}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t.ai.placeholder}
            className="font-mono text-sm"
          />
          <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="h-9 w-9">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}