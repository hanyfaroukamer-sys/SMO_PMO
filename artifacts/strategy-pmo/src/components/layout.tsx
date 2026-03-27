import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { CommandPalette, SearchTrigger } from "@/components/command-palette";
import {
  LayoutDashboard,
  Network,
  Briefcase,
  CheckSquare,
  LineChart,
  Activity,
  Wallet,
  ShoppingCart,
  ShieldAlert,
  BellRing,
  ScrollText,
  LogOut,
  User as UserIcon,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  ShieldCheck,
  Upload,
  GitMerge,
  Layers,
  Flag,
  FolderOpen,
  ClipboardList,
  FolderKanban,
  Stethoscope,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetCurrentAuthUser, useGetSpmoMyTaskCount } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Project Manager items (everyone sees these) ──
const pmNavItems = [
  { title: "Dashboard",        href: "/",             icon: LayoutDashboard, badge: false },
  { title: "My Tasks",         href: "/my-tasks",     icon: ClipboardList,   badge: true },
  { title: "My Projects",      href: "/my-projects",  icon: FolderKanban,    badge: false },
  { title: "Projects",         href: "/projects",     icon: Briefcase,       badge: false },
  { title: "KPIs",             href: "/kpis",         icon: LineChart,       badge: false },
  { title: "Risks",            href: "/risks",        icon: ShieldAlert,     badge: false },
  { title: "Documents",        href: "/documents",    icon: FolderOpen,      badge: false },
];

// ── PMO Administration items (admin only) ──
const adminNavItems = [
  { title: "Strategy Map",        href: "/strategy-map", icon: Network,      badge: false },
  { title: "Pillars & Initiatives", href: "/pillars",    icon: Layers,       badge: false },
  { title: "Financials",          href: "/budget",       icon: Wallet,       badge: false },
  { title: "Departments",         href: "/departments",  icon: Building2,    badge: false },
  { title: "Dependencies",        href: "/dependencies", icon: GitMerge,     badge: false },
  { title: "Progress Proof",      href: "/progress",     icon: CheckSquare,  badge: false },
  { title: "Monitoring",          href: "/alerts",       icon: BellRing,     badge: false },
  { title: "Import Data",         href: "/import",       icon: Upload,       badge: false },
  { title: "Diagnostics",         href: "/admin/diagnostics", icon: Stethoscope, badge: false },
];

// Legacy compat — build flat list for rendering logic
const navItems = [
  ...pmNavItems.map((i) => ({ ...i, adminOnly: false, hidden: false })),
  ...adminNavItems.map((i) => ({ ...i, adminOnly: true, hidden: false })),
];

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-display font-black text-white text-sm shadow-lg ring-1 ring-white/10"
        style={{ background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)" }}
      >
        S
      </div>
      {!collapsed && (
        <span className="font-display font-bold text-[15px] tracking-tight whitespace-nowrap text-sidebar-foreground">
          StrategyPMO
        </span>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: authData } = useGetCurrentAuthUser();
  const { data: taskCount } = useGetSpmoMyTaskCount();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const user = authData?.user;
  const myTasksBadge = taskCount?.total ?? 0;

  const sidebarContent = (
    <>
      {/* Logo header */}
      <div className="h-16 flex items-center px-3 border-b border-sidebar-border/30 bg-gradient-to-b from-sidebar/0 to-black/5">
        <Logo collapsed={collapsed && !isMobile} />
      </div>

      {/* Search trigger */}
      <div className="px-1.5 pt-3 pb-1">
        <SearchTrigger collapsed={collapsed && !isMobile} />
      </div>

      {/* Nav items */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto py-1 px-1.5 space-y-0.5 scrollbar-hide">
        {navItems.filter((item) => !item.hidden && (!item.adminOnly || user?.role === "admin")).map((item, idx, arr) => {
          const showDivider = idx > 0 && item.adminOnly && !arr[idx - 1].adminOnly;
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          const badge = (item as { badge?: boolean }).badge && myTasksBadge > 0 ? myTasksBadge : 0;
          return (
            <div key={item.href}>
            {showDivider && (
              <div className="pt-3 pb-1.5 px-2.5">
                {(isMobile || !collapsed) ? (
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-sidebar-border/40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/30">Administration</span>
                    <div className="h-px flex-1 bg-sidebar-border/40" />
                  </div>
                ) : (
                  <div className="h-px bg-sidebar-border/40 mx-1" />
                )}
              </div>
            )}
            <Link
              href={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg transition-all duration-200 group text-[13px] font-medium",
                !isMobile && collapsed ? "justify-center p-2.5" : isActive ? "py-2 pr-2.5 pl-2 border-l-2 border-primary" : "px-2.5 py-2",
                isActive
                  ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/60 text-white"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
              title={!isMobile && collapsed ? item.title : undefined}
            >
              <div className="relative shrink-0">
                <item.icon
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isActive
                      ? "text-white"
                      : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground"
                  )}
                />
                {badge > 0 && !isMobile && collapsed && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              {(isMobile || !collapsed) && <span className="truncate leading-none flex-1">{item.title}</span>}
              {(isMobile || !collapsed) && badge > 0 && (
                <span className="ml-auto min-w-[18px] h-4.5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
            </div>
          );
        })}
        {user?.role === "admin" && (() => {
          const isActive = location === "/admin";
          return (
            <Link
              href="/admin"
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg transition-all duration-200 group text-[13px] font-medium",
                !isMobile && collapsed ? "justify-center p-2.5" : isActive ? "py-2 pr-2.5 pl-2 border-l-2 border-primary" : "px-2.5 py-2",
                isActive
                  ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/60 text-white"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
              title={!isMobile && collapsed ? "Admin" : undefined}
            >
              <ShieldCheck
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive
                    ? "text-white"
                    : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground"
                )}
              />
              {(isMobile || !collapsed) && <span className="truncate leading-none">Admin</span>}
            </Link>
          );
        })()}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border/40 p-2 space-y-1.5">
        {(isMobile || !collapsed) && (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-sidebar-border/60">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-4 h-4 text-sidebar-foreground/50" />
              )}
            </div>
            <div className="flex flex-col overflow-hidden flex-1 min-w-0">
              <span className="text-xs font-semibold truncate leading-tight text-sidebar-foreground">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-sidebar-foreground/40 uppercase tracking-wider mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success/60" />
                {user?.role || "User"}
              </span>
            </div>
          </div>
        )}

        <div className={cn("flex gap-1", !isMobile && collapsed ? "flex-col" : "items-center")}>
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg hover:bg-white/10 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="w-3.5 h-3.5 mx-auto" />
              ) : (
                <ChevronsLeft className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <a
            href="/api/logout"
            className={cn(
              "p-2 rounded-lg hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-colors flex items-center justify-center gap-1.5",
              (isMobile || !collapsed) && "flex-1"
            )}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {(isMobile || !collapsed) && <span className="text-xs font-medium leading-none">Sign Out</span>}
          </a>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile top bar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-14 z-30 bg-sidebar border-b border-sidebar-border flex items-center px-3 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo collapsed={false} />
        </div>
      )}

      {/* Mobile overlay sidebar */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[260px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col animate-in slide-in-from-left duration-200">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop sidebar — 210px expanded, 52px collapsed */}
      {!isMobile && (
        <aside
          className={cn(
            "bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex flex-col z-20 shrink-0",
            collapsed ? "w-[52px]" : "w-[210px]"
          )}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main content */}
      <main className={cn("flex-1 flex flex-col min-w-0 bg-background overflow-y-auto", isMobile && "pt-14")}>
        <div className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Global search palette */}
      <CommandPalette />
    </div>
  );
}
