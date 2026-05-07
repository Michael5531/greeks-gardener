import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export type GlossaryKey =
  | "delta" | "gamma" | "theta" | "vega" | "iv" | "oi" | "volume"
  | "gex" | "zeroGamma" | "dte" | "atm" | "itm" | "otm"
  | "spread" | "straddle" | "strangle" | "ironCondor" | "leap"
  | "sweep" | "premium" | "breakeven";

export default function HelpPopover({ term, className }: { term: GlossaryKey; className?: string }) {
  const t = useT();
  const entry = (t.glossary as any)[term];
  if (!entry) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors align-middle ml-1", className)}
          aria-label={`help ${term}`}
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 z-50" align="start">
        <div className="text-sm font-semibold mb-1">{entry.name}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.text}</p>
      </PopoverContent>
    </Popover>
  );
}