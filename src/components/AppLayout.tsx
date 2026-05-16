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
import ThemeToggle from "./ThemeToggle";
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
          "border-r border-border bg-background",
          "transition-[width] duration-200 ease-out shrink-0",
          collapsed ? "md:w-[72px]" : "md:w-[260px]",
        )}
      >
        {/* Brand */}
        <div className={cn("px-5 py-6 border-b border-border", collapsed && "px-3")}>
          <Link
            to="/"
            className={cn(
              "group flex items-baseline gap-2 transition-opacity hover:opacity-70",
              collapsed && "justify-center",
            )}
            title={t.brand.backHome}
          >
            {collapsed ? (
              <span className="font-serif-display italic text-2xl text-primary">O</span>
            ) : (
              <>
                <span className="font-serif-display italic text-[28px] leading-none text-foreground">
                  Opti<span className="text-primary">·x</span>
                </span>
                <span className="ml-auto editorial-eyebrow">№01</span>
              </>
            )}
          </Link>
          {!collapsed && (
            <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
              The Options Quarterly
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5">
          {groups.map((g, gi) => (
            <div key={g.label} className="mb-6">
              {!collapsed && (
                <div className="px-5 pb-3 flex items-baseline gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                    0{gi + 1}
                  </span>
                  <span className="font-serif-display italic text-base text-foreground">
                    {g.label}
                  </span>
                  <span className="flex-1 border-b border-border" />
                </div>
              )}
              <div className={cn("space-y-0", collapsed ? "px-2" : "px-3")}>
                {g.items.map((n, ni) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    title={collapsed ? n.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group/nav relative flex items-center gap-3 px-2 py-2 text-[13px] transition-colors",
                        collapsed && "justify-center",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {!collapsed && (
                          <span className={cn(
                            "font-mono text-[10px] tabular-nums w-5",
                            isActive ? "text-primary" : "text-muted-foreground/50",
                          )}>
                            {String(ni + 1).padStart(2, "0")}
                          </span>
                        )}
                        <n.icon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-primary")} />
                        {!collapsed && (
                          <span className={cn(
                            "truncate font-serif-display text-[17px]",
                            isActive && "italic",
                          )}>
                            {n.label}
                          </span>
                        )}
                        {!collapsed && isActive && (
                          <span className="ml-auto text-primary text-base font-serif-display">→</span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: collapse + user */}
        <div className="border-t border-border p-3 space-y-2">
          <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "")}>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              "flex-1 flex items-center gap-2 px-2 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors",
              collapsed && "justify-center",
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <ThemeToggle />
          </div>
          {!collapsed && user?.email && (
            <div className="px-2 pt-1 text-[10px] text-muted-foreground truncate font-mono">{user.email}</div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full gap-2 font-mono text-[11px] uppercase tracking-[0.2em] h-8",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={async () => { await signOut(); navigate("/auth"); }}
            title={collapsed ? t.nav.logout : undefined}
          >
            <LogOut className="h-3.5 w-3.5" />
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
