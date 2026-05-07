import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Boxes, History, Layers, LayoutDashboard, LineChart, LogOut, Radar, TrendingUp } from "lucide-react";
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
        <div className="hidden md:block px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md grid place-items-center" style={{ background: "var(--gradient-primary)" }}>
              <TrendingUp className="h-4 w-4 text-background" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">OPTI-X</div>
              <div className="text-[10px] text-muted-foreground font-mono">OPTIONS · v0.1</div>
            </div>
          </div>
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