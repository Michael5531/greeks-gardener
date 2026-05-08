import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Boxes, History, Home, Layers, LayoutDashboard, LineChart, LogOut, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import MarketStatusBar from "./MarketStatusBar";
import GlobalAIChat from "./GlobalAIChat";
import { useT } from "@/i18n";

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const nav = [
    { to: "/app", label: t.nav.dashboard, icon: LayoutDashboard, end: true },
    { to: "/app/chain", label: t.nav.chain, icon: Boxes },
    { to: "/app/greeks", label: t.nav.greeks, icon: Activity },
    { to: "/app/gex", label: t.nav.gex, icon: BarChart3 },
    { to: "/app/orderbook", label: t.nav.orderbook, icon: Layers },
    { to: "/app/flow", label: t.nav.flow, icon: History },
    { to: "/app/backtest", label: t.nav.backtest, icon: LineChart },
    { to: "/app/signals", label: t.nav.signals, icon: Radar },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 md:min-h-screen border-t md:border-t-0 md:border-r border-border bg-card/80 md:bg-card/40 backdrop-blur flex md:flex-col fixed md:sticky bottom-0 md:top-0 left-0 right-0 md:right-auto z-50 md:z-auto">
        <div className="hidden md:block px-4 py-4 border-b border-border">
          <Link to="/" className="group flex items-center gap-3 rounded-lg p-1.5 -m-1.5 hover:bg-secondary/60 transition-colors" title={t.brand.backHome}>
            <div className="relative h-9 w-9 shrink-0">
              <div className="absolute inset-0 rounded-lg blur-md opacity-50 group-hover:opacity-90 transition-opacity"
                style={{ background: "var(--gradient-primary)" }} />
              <div className="relative h-9 w-9 rounded-lg border border-border/80 bg-background/80 backdrop-blur grid place-items-center overflow-hidden">
                <div className="absolute inset-0 opacity-30"
                  style={{ background: "linear-gradient(135deg, hsl(165 90% 50% / 0.5), transparent 50%, hsl(280 85% 65% / 0.4))" }} />
                <svg viewBox="0 0 32 32" className="relative h-4.5 w-4.5" style={{ height: 18, width: 18 }}>
                  <defs>
                    <linearGradient id="al-stroke" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="hsl(165 90% 55%)" />
                      <stop offset="100%" stopColor="hsl(280 85% 70%)" />
                    </linearGradient>
                  </defs>
                  <path d="M3 26 L13 14 L19 20 L29 6" fill="none" stroke="url(#al-stroke)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="13" cy="14" r="1.6" fill="hsl(165 90% 55%)" />
                  <circle cx="19" cy="20" r="1.6" fill="hsl(280 85% 70%)" />
                </svg>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold tracking-[-0.02em] leading-none text-[14px]">
                OPTI<span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>·X</span>
              </div>
              <div className="text-[9px] text-muted-foreground font-mono mt-1 tracking-[0.2em]">OPTIONS · v0.1</div>
            </div>
            <Home className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
        <nav className="flex-1 p-2 md:p-3 flex md:block gap-1 md:space-y-1 overflow-x-auto md:overflow-visible">
          {nav.map(n => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn(
                "flex shrink-0 flex-col md:flex-row items-center gap-1 md:gap-2 min-w-[4.5rem] md:min-w-0 px-2 md:px-3 py-2 rounded-md text-[10px] md:text-sm transition-colors",
                isActive
                  ? "bg-secondary text-foreground md:border-l-2 md:border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden md:block p-3 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate font-mono">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2"
            onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="h-4 w-4" /> {t.nav.logout}
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden pb-20 md:pb-0">
        <MarketStatusBar />
        <Outlet />
        <GlobalAIChat />
      </main>
    </div>
  );
}