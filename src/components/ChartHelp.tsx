import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartHelp({ title, children, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`帮助：${title}`}
          className={cn(
            "inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors align-middle ml-1",
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 z-50 max-h-[70vh] overflow-auto" align="start">
        <div className="text-sm font-semibold mb-2">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}