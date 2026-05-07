import { createContext, useContext, useEffect, useMemo, useState } from "react";
import zh, { type Dict } from "./zh";
import en from "./en";

export type Lang = "zh" | "en";
const dicts: Record<Lang, Dict> = { zh, en };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };
const I18nContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("optix.lang") as Lang) || "zh");
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => { localStorage.setItem("optix.lang", l); setLangState(l); };
  const value = useMemo(() => ({ lang, setLang, t: dicts[lang] }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}
export function useT() { return useI18n().t; }