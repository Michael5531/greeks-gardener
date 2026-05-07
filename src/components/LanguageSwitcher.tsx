import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded border border-border overflow-hidden text-[10px] font-mono">
      {(["zh", "en"] as const).map(l => (
        <button key={l} onClick={() => setLang(l)}
          className={cn("px-2 h-5 transition-colors", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {l === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}