import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetCurrentAuthUser, useGetSpmoMyTaskCount } from "@workspace/api-client-react";

const navItems = [
  { title: "Dashboard",        href: "/",             icon: LayoutDashboard, adminOnly: false, hidden: false },
  { title: "My Tasks",         href: "/my-tasks",     icon: ClipboardList,    adminOnly: false, hidden: false, badge: true },
  { title: "Strategy Map",     href: "/strategy-map", icon: Network,          adminOnly: false, hidden: true  },
  { title: "Pillars",          href: "/pillars",      icon: Layers,           adminOnly: true,  hidden: false },
  { title: "Initiatives",      href: "/initiatives",  icon: Flag,             adminOnly: true,  hidden: false },
  { title: "Projects",         href: "/projects",     icon: Briefcase,        adminOnly: false, hidden: false },
  { title: "Progress Proof",   href: "/progress",     icon: CheckSquare,      adminOnly: true,  hidden: false },
  { title: "KPIs",             href: "/kpis",         icon: LineChart,        adminOnly: false, hidden: false },
  { title: "Op. KPIs",         href: "/op-kpis",      icon: Activity,         adminOnly: false, hidden: false },
  { title: "Budget",           href: "/budget",       icon: Wallet,           adminOnly: true,  hidden: false },
  { title: "Procurement",      href: "/procurement",  icon: ShoppingCart,     adminOnly: true,  hidden: false },
  { title: "Departments",      href: "/departments",  icon: Building2,        adminOnly: false, hidden: false },
  { title: "Risks",            href: "/risks",        icon: ShieldAlert,      adminOnly: false, hidden: false },
  { title: "Documents",        href: "/documents",    icon: FolderOpen,       adminOnly: false, hidden: false },
  { title: "Dependencies",     href: "/dependencies", icon: GitMerge,         adminOnly: false, hidden: false },
  { title: "Alerts",           href: "/alerts",       icon: BellRing,         adminOnly: true,  hidden: false },
  { title: "Activity Log",     href: "/activity",     icon: ScrollText,       adminOnly: true,  hidden: false },
  { title: "Import Strategy",  href: "/import",       icon: Upload,           adminOnly: true,  hidden: false },
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
  const user = authData?.user;
  const myTasksBadge = taskCount?.total ?? 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar — 210px expanded, 52px collapsed */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex flex-col z-20 shrink-0",
          collapsed ? "w-[52px]" : "w-[210px]"
        )}
      >
        {/* Logo header */}
        <div className="h-16 flex items-center px-3 border-b border-sidebar-border/30 bg-gradient-to-b from-sidebar/0 to-black/5">
          <Logo collapsed={collapsed} />
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-1.5 space-y-0.5 scrollbar-hide">
          {navItems.filter((item) => !item.hidden && (!item.adminOnly || user?.role === "admin")).map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const badge = (item as { badge?: boolean }).badge && myTasksBadge > 0 ? myTasksBadge : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg transition-all duration-200 group text-[13px] font-medium",
                  collapsed ? "justify-center p-2.5" : isActive ? "py-2 pr-2.5 pl-2 border-l-2 border-primary" : "px-2.5 py-2",
                  isActive
                    ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/60 text-white"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                title={collapsed ? item.title : undefined}
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
                  {badge > 0 && collapsed && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                {!collapsed && <span className="truncate leading-none flex-1">{item.title}</span>}
                {!collapsed && badge > 0 && (
                  <span className="ml-auto min-w-[18px] h-4.5 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
          {user?.role === "admin" && (() => {
            const isActive = location === "/admin";
            return (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg transition-all duration-200 group text-[13px] font-medium",
                  collapsed ? "justify-center p-2.5" : isActive ? "py-2 pr-2.5 pl-2 border-l-2 border-primary" : "px-2.5 py-2",
                  isActive
                    ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/60 text-white"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                title={collapsed ? "Admin" : undefined}
              >
                <ShieldCheck
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive
                      ? "text-white"
                      : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground"
                  )}
                />
                {!collapsed && <span className="truncate leading-none">Admin</span>}
              </Link>
            );
          })()}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border/40 p-2 space-y-1.5">
          {!collapsed && (
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

          <div className={cn("flex gap-1", collapsed ? "flex-col" : "items-center")}>
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
            <a
              href="/api/logout"
              className={cn(
                "p-2 rounded-lg hover:bg-destructive/20 text-sidebar-foreground/40 hover:text-destructive transition-colors flex items-center justify-center gap-1.5",
                !collapsed && "flex-1"
              )}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span className="text-xs font-medium leading-none">Sign Out</span>}
            </a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">
        <div className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
