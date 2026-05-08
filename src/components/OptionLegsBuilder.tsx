import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Trash2 } from "lucide-react";
import { useT } from "@/i18n";

export interface UILeg {
  id: string;
  side: "long" | "short";
  type: "call" | "put";
  expiration: string; // YYYY-MM-DD
  strike: number;
  qty: number;
  iv: number;        // decimal
  mid?: number;      // bid/ask mid for display
}

export interface OptionLegsBuilderProps {
  ticker: string;
  spot: number | null;
  chain: any[];        // raw chain snapshot rows
  expirations: string[];
  legs: UILeg[];
  onChange: (legs: UILeg[]) => void;
  defaultIv?: number;
}

const newId = () => Math.random().toString(36).slice(2, 9);

export function dteFor(exp: string) {
  return Math.max(1, Math.round((new Date(exp + "T16:00:00Z").getTime() - Date.now()) / 86400000));
}

function findContract(chain: any[], exp: string, strike: number, type: "call" | "put") {
  return chain.find(c => c.details?.expiration_date === exp && c.details?.strike_price === strike && c.details?.contract_type === type);
}

export default function OptionLegsBuilder({ ticker, spot, chain, expirations, legs, onChange, defaultIv = 0.30 }: OptionLegsBuilderProps) {
  // strikes by expiration
  const strikesByExp = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const c of chain) {
      const e = c.details?.expiration_date, k = c.details?.strike_price;
      if (!e || k == null) continue;
      if (!m.has(e)) m.set(e, []);
      const arr = m.get(e)!;
      if (!arr.includes(k)) arr.push(k);
    }
    for (const a of m.values()) a.sort((x, y) => x - y);
    return m;
  }, [chain]);

  // Initialize one ATM long-call leg if empty and chain ready
  useEffect(() => {
    if (legs.length || !chain.length || !spot || !expirations.length) return;
    const exp = expirations.find(e => dteFor(e) >= 20) ?? expirations[0];
    const strikes = strikesByExp.get(exp) ?? [];
    if (!strikes.length) return;
    const k = strikes.reduce((a, b) => Math.abs(b - spot) < Math.abs(a - spot) ? b : a, strikes[0]);
    const c = findContract(chain, exp, k, "call");
    onChange([{
      id: newId(), side: "long", type: "call", expiration: exp, strike: k, qty: 1,
      iv: c?.implied_volatility ?? defaultIv,
      mid: c?.last_quote ? (c.last_quote.bid + c.last_quote.ask) / 2 : undefined,
    }]);
  }, [chain.length, expirations.length, spot]); // eslint-disable-line

  function update(id: string, patch: Partial<UILeg>) {
    const next = legs.map(l => {
      if (l.id !== id) return l;
      const merged = { ...l, ...patch };
      // refresh iv/mid when expiration/strike/type changes
      if (patch.expiration || patch.strike != null || patch.type) {
        const c = findContract(chain, merged.expiration, merged.strike, merged.type);
        if (c?.implied_volatility) merged.iv = c.implied_volatility;
        if (c?.last_quote) merged.mid = (c.last_quote.bid + c.last_quote.ask) / 2;
      }
      return merged;
    });
    onChange(next);
  }
  function add() {
    const base = legs[legs.length - 1];
    if (!base) return;
    onChange([...legs, { ...base, id: newId(), side: base.side === "long" ? "short" : "long" }]);
  }
  function copy(id: string) {
    const l = legs.find(x => x.id === id); if (!l) return;
    onChange([...legs, { ...l, id: newId() }]);
  }
  function remove(id: string) { onChange(legs.filter(l => l.id !== id)); }

  const tx = useT();
  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{tx.legs.fromChain} {ticker ? `· ${ticker}` : ""}</Label>
        <Button size="sm" variant="outline" onClick={add} disabled={!legs.length} className="h-7 text-[11px]">
          <Plus className="h-3 w-3 mr-1" />{tx.legs.add}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-1 py-1">Side</th>
              <th className="px-1">Type</th>
              <th className="px-1">Expiration (DTE)</th>
              <th className="px-1">Strike</th>
              <th className="px-1 text-right">Qty</th>
              <th className="px-1 text-right">IV</th>
              <th className="px-1 text-right">Mid</th>
              <th className="px-1"></th>
            </tr>
          </thead>
          <tbody>
            {legs.map(l => {
              const strikes = strikesByExp.get(l.expiration) ?? [];
              return (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="px-1 py-1">
                    <Select value={l.side} onValueChange={v => update(l.id, { side: v as any })}>
                      <SelectTrigger className="h-7 text-[11px] w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long" className="text-[11px]">Buy</SelectItem>
                        <SelectItem value="short" className="text-[11px]">Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1">
                    <Select value={l.type} onValueChange={v => update(l.id, { type: v as any })}>
                      <SelectTrigger className="h-7 text-[11px] w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call" className="text-[11px]">Call</SelectItem>
                        <SelectItem value="put" className="text-[11px]">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1">
                    <Select value={l.expiration} onValueChange={v => update(l.id, { expiration: v })}>
                      <SelectTrigger className="h-7 text-[11px] w-40"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {expirations.map(e => <SelectItem key={e} value={e} className="text-[11px]">{e} ({dteFor(e)}d)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1">
                    <Select value={String(l.strike)} onValueChange={v => update(l.id, { strike: +v })}>
                      <SelectTrigger className="h-7 text-[11px] w-24"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {strikes.map(k => <SelectItem key={k} value={String(k)} className="text-[11px]">{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1">
                    <Input type="number" min={1} value={l.qty} onChange={e => update(l.id, { qty: Math.max(1, +e.target.value || 1) })} className="h-7 text-[11px] w-16 text-right" />
                  </td>
                  <td className="px-1 text-right">{(l.iv * 100).toFixed(1)}%</td>
                  <td className="px-1 text-right">{l.mid != null ? `$${l.mid.toFixed(2)}` : "—"}</td>
                  <td className="px-1 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(l.id)}><Copy className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(l.id)} disabled={legs.length <= 1}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              );
            })}
            {!legs.length && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-3">{tx.legs.loading}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}