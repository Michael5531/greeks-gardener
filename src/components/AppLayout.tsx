import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Activity, BarChart3, Boxes, History, Home, Layers, LayoutDashboard,
  LineChart, LogOut, Radar, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MarketStatusBar from "./MarketStatusBar";
import GlobalAIChat from "./GlobalAIChat";
import { useT } from "@/i18n";

type NavItem = { to: string; label: string; icon: any; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const COLLAPSE_KEY = "optix:sidebar:collapsed";

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const groups: NavGroup[] = [
    {
      label: "Markets",
      items: [
        { to: "/app", label: t.nav.dashboard, icon: LayoutDashboard, end: true },
        { to: "/app/chain", label: t.nav.chain, icon: Boxes },
        { to: "/app/orderbook", label: t.nav.orderbook, icon: Layers },
        { to: "/app/flow", label: t.nav.flow, icon: History },
      ],
    },
    {
      label: "Analytics",
      items: [
        { to: "/app/greeks", label: t.nav.greeks, icon: Activity },
        { to: "/app/gex", label: t.nav.gex, icon: BarChart3 },
      ],
    },
    {
      label: "Strategy",
      items: [
        { to: "/app/backtest", label: t.nav.backtest, icon: LineChart },
        { to: "/app/signals", label: t.nav.signals, icon: Radar },
      ],
    },
  ];

  // Flat list for mobile dock
  const flat: NavItem[] = groups.flatMap(g => g.items);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ---------- Desktop sidebar ---------- */}
      <aside
        className={cn(
          "hidden md:flex md:flex-col md:min-h-screen md:sticky md:top-0",
          "border-r border-border bg-card/40 backdrop-blur supports-[backdrop-filter]:bg-card/30",
          "transition-[width] duration-200 ease-out shrink-0",
          collapsed ? "md:w-[68px]" : "md:w-60",
        )}
      >
        {/* Brand */}
        <div className="px-3 py-4 border-b border-border">
          <Link
            to="/"
            className={cn(
              "group flex items-center gap-3 rounded-lg p-1.5 hover:bg-secondary/60 transition-colors",
              collapsed && "justify-center",
            )}
            title={t.brand.backHome}
          >
            <div className="relative h-9 w-9 shrink-0">
              <div className="absolute inset-0 rounded-lg blur-md opacity-50 group-hover:opacity-90 transition-opacity"
                style={{ background: "var(--gradient-primary)" }} />
              <div className="relative h-9 w-9 rounded-lg border border-border/80 bg-background/80 backdrop-blur grid place-items-center overflow-hidden">
                <div className="absolute inset-0 opacity-30"
                  style={{ background: "linear-gradient(135deg, hsl(165 90% 50% / 0.5), transparent 50%, hsl(280 85% 65% / 0.4))" }} />
                <svg viewBox="0 0 32 32" style={{ height: 18, width: 18 }} className="relative">
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
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-[-0.02em] leading-none text-[14px]">
                  OPTI<span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>·X</span>
                </div>
                <div className="text-[9px] text-muted-foreground font-mono mt-1 tracking-[0.2em]">OPTIONS · v0.1</div>
              </div>
            )}
            {!collapsed && (
              <Home className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              {!collapsed && (
                <div className="px-5 pb-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">
                  {g.label}
                </div>
              )}
              <div className="px-2 space-y-0.5">
                {g.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    title={collapsed ? n.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors",
                        collapsed && "justify-center",
                        isActive
                          ? "bg-secondary/70 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                            style={{ background: "var(--gradient-primary)" }}
                            aria-hidden
                          />
                        )}
                        <n.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                        {!collapsed && <span className="truncate">{n.label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: collapse + user */}
        <div className="border-t border-border p-2 space-y-1">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors",
              collapsed && "justify-center",
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && user?.email && (
            <div className="px-2.5 pt-1 text-[10px] text-muted-foreground truncate font-mono">{user.email}</div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full gap-2", collapsed ? "justify-center px-0" : "justify-start")}
            onClick={async () => { await signOut(); navigate("/auth"); }}
            title={collapsed ? t.nav.logout : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && t.nav.logout}
          </Button>
        </div>
      </aside>

      {/* ---------- Mobile bottom dock ---------- */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/90 backdrop-blur"
        aria-label="Mobile nav"
      >
        <div className="flex gap-1 px-2 py-2 overflow-x-auto">
          {flat.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn(
                "shrink-0 flex flex-col items-center gap-1 min-w-[4.5rem] px-2 py-1.5 rounded-md text-[10px] transition-colors",
                isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              <n.icon className="h-4 w-4" />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ---------- Main ---------- */}
      <main className="flex-1 min-w-0 overflow-x-hidden pb-24 md:pb-0">
        <MarketStatusBar />
        <Outlet />
        <GlobalAIChat />
      </main>
    </div>
  );
}
