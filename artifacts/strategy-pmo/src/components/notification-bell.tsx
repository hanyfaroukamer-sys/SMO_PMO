import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Bell, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [, navigate] = useLocation();
  const panelRef = useRef<HTMLDivElement>(null); // kept for potential future use

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/spmo/notifications", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch { /* ignore */ }
  };

  // Poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch("/api/spmo/notifications/read-all", { method: "POST", credentials: "include" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await fetch(`/api/spmo/notifications/${n.id}/read`, { method: "POST", credentials: "include" });
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  const typeColors: Record<string, string> = {
    comment: "bg-blue-500",
    approval: "bg-amber-500",
    assignment: "bg-green-500",
    mention: "bg-violet-500",
    alert: "bg-red-500",
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-sidebar-accent/60 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div
            className="absolute top-14 right-4 w-80 sm:w-96 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-bold">Notifications</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-border/40 last:border-0 transition-colors ${n.read ? "opacity-60" : "bg-primary/5 hover:bg-primary/10"}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? "bg-muted-foreground/30" : typeColors[n.type] ?? "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">{n.title}</div>
                      {n.body && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
