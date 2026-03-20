import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Columns, 
  Target, 
  Briefcase, 
  CheckSquare, 
  LineChart, 
  ShieldAlert, 
  Wallet, 
  BellRing, 
  Activity,
  Menu,
  LogOut,
  User as UserIcon,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Pillars", href: "/pillars", icon: Columns },
  { title: "Initiatives", href: "/initiatives", icon: Target },
  { title: "Projects", href: "/projects", icon: Briefcase },
  { title: "Progress Proof", href: "/progress", icon: CheckSquare },
  { title: "KPIs", href: "/kpis", icon: LineChart },
  { title: "Risk Register", href: "/risks", icon: ShieldAlert },
  { title: "Budget", href: "/budget", icon: Wallet },
  { title: "Alerts", href: "/alerts", icon: BellRing },
  { title: "Activity Log", href: "/activity", icon: Activity },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: authData } = useGetCurrentAuthUser();
  const [collapsed, setCollapsed] = useState(false);
  const user = authData?.user;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 flex flex-col z-20",
          collapsed ? "w-[80px]" : "w-[280px]"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border/50">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
                <Target className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap">StrategyPMO</span>
            </div>
          )}
          {collapsed && (
            <div className="w-full flex justify-center">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <Target className="w-5 h-5 text-primary-foreground" />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1 scrollbar-hide">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-md shadow-black/20" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-1"
                )}
                title={collapsed ? item.title : undefined}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground")} />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border/50 bg-sidebar-accent/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center overflow-hidden shrink-0">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-sidebar-foreground/50" />
              )}
            </div>
            {!collapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold truncate">{user?.firstName} {user?.lastName}</span>
                <span className="text-xs text-sidebar-foreground/60 uppercase tracking-wider">{user?.role || 'User'}</span>
              </div>
            )}
          </div>
          
          <div className={cn("flex", collapsed ? "flex-col gap-2" : "justify-between items-center")}>
            <button 
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4 mx-auto" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
            <a 
              href="/api/logout" 
              className={cn(
                "p-2 rounded-md hover:bg-destructive/20 text-sidebar-foreground/50 hover:text-destructive transition-colors flex items-center justify-center gap-2",
                collapsed && "w-full"
              )}
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && <span className="text-xs font-medium">Sign Out</span>}
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="flex-1 relative z-10 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
