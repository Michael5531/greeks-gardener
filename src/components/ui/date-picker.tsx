import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  value?: string; // ISO yyyy-MM-dd
  onChange?: (iso: string) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

function parseISO(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className, align = "start" }: DatePickerProps) {
  const date = parseISO(value);
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-8 justify-start text-left font-mono text-xs px-2 gap-2", !date && "text-muted-foreground", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
          {date ? format(date, "yyyy-MM-dd") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50" align={align}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) { onChange?.(toISO(d)); setOpen(false); } }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}