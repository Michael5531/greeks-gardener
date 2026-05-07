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
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-border bg-card/40 backdrop-blur flex flex-col">
        <div className="px-5 py-5 border-b border-border">
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
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(n => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-secondary text-foreground border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate font-mono">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2"
            onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="h-4 w-4" /> {t.nav.logout}
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <MarketStatusBar />
        <Outlet />
        <GlobalAIChat />
      </main>
    </div>
  );
}