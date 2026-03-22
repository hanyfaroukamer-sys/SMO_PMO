import { useState } from "react";
import {
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmaAdminUsers,
  useUpdateSpmaUserRole,
  type SpmaAdminUser,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, ShieldCheck, Settings, Users, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type UserRole = "admin" | "project-manager" | "approver";

const ROLES: { value: UserRole; label: string; description: string; color: string }[] = [
  { value: "admin", label: "Admin", description: "Full edit access", color: "bg-primary text-primary-foreground border-primary" },
  { value: "project-manager", label: "Project Manager", description: "Update progress & reports", color: "bg-blue-500 text-white border-blue-500" },
  { value: "approver", label: "Approver", description: "Approve milestones", color: "bg-amber-500 text-white border-amber-500" },
];

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function UserRoleRow({ user, saving, onRoleChange }: {
  user: SpmaAdminUser;
  saving: boolean;
  onRoleChange: (userId: string, role: UserRole) => void;
}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
  const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || "?";
  const currentRole = (user.role ?? "project-manager") as UserRole;

  return (
    <div className="py-4 border-b border-border/40 last:border-b-0">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
      </div>
      <div className="flex gap-2 flex-wrap">
        {ROLES.map((role) => {
          const isActive = currentRole === role.value;
          return (
            <button
              key={role.value}
              onClick={() => !isActive && onRoleChange(user.id, role.value)}
              disabled={saving}
              className={[
                "flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all min-w-[100px]",
                isActive
                  ? role.color + " shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              ].join(" ")}
            >
              <span className="text-xs font-bold">{role.label}</span>
              <span className={["text-[10px]", isActive ? "opacity-80" : "opacity-60"].join(" ")}>{role.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Admin() {
  const isAdmin = useIsAdmin();
  const { data: configData, isLoading: configLoading } = useGetSpmoConfig();
  const { data: usersData, isLoading: usersLoading } = useGetSpmaAdminUsers();
  const updateConfig = useUpdateSpmoConfig();
  const updateRole = useUpdateSpmaUserRole();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [weeklyResetDay, setWeeklyResetDay] = useState<number | null>(null);
  const [savingUsers, setSavingUsers] = useState<Set<string>>(new Set());

  const effectiveResetDay = weeklyResetDay ?? configData?.weeklyResetDay ?? 3;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to view this page.</p>
      </div>
    );
  }

  async function handleResetDayChange(day: number) {
    setWeeklyResetDay(day);
    try {
      await updateConfig.mutateAsync({ data: { weeklyResetDay: day } });
      qc.invalidateQueries({ queryKey: ["/api/spmo/config"] });
      toast({ title: "Setting saved", description: `Weekly report resets every ${DAY_NAMES[day]}.` });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not update weekly reset day." });
      setWeeklyResetDay(null);
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    setSavingUsers((s) => new Set(s).add(userId));
    try {
      await updateRole.mutateAsync({ userId, data: { role } });
      qc.invalidateQueries({ queryKey: ["/api/spmo/admin/users"] });
      const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role;
      toast({ title: "Role updated", description: `Role changed to ${roleLabel}. User must re-login for the change to take effect.` });
    } catch {
      toast({ variant: "destructive", title: "Update failed", description: "Could not change user role." });
    } finally {
      setSavingUsers((s) => { const n = new Set(s); n.delete(userId); return n; });
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <PageHeader title="Admin Settings" description="Manage users, roles, and programme configuration." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Programme Configuration */}
        <SectionCard title="Programme Configuration" icon={Settings}>
          {configLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Weekly Report Reset Day</label>
                <p className="text-xs text-muted-foreground mb-3">
                  Each project's weekly report resets at the start of this day every week.
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {DAY_NAMES.map((day, idx) => (
                    <button
                      key={day}
                      onClick={() => handleResetDayChange(idx)}
                      disabled={updateConfig.isPending}
                      className={[
                        "flex flex-col items-center py-2 px-1 rounded-lg border text-[11px] font-semibold transition-all",
                        effectiveResetDay === idx
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      ].join(" ")}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Current: <span className="font-semibold text-foreground">{DAY_NAMES[effectiveResetDay]}</span>
                </p>
              </div>

              <div className="pt-3 border-t border-border/50 space-y-2">
                <label className="block text-sm font-medium">Risk Thresholds</label>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="bg-warning/5 border border-warning/20 rounded-lg p-2">
                    <div className="font-bold text-warning text-sm">{configData?.projectAtRiskThreshold ?? 50}%</div>
                    <div className="text-muted-foreground">Project At Risk</div>
                  </div>
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                    <div className="font-bold text-destructive text-sm">{configData?.projectDelayedThreshold ?? 25}%</div>
                    <div className="text-muted-foreground">Project Delayed</div>
                  </div>
                  <div className="bg-warning/5 border border-warning/20 rounded-lg p-2">
                    <div className="font-bold text-warning text-sm">{configData?.milestoneAtRiskThreshold ?? 50}%</div>
                    <div className="text-muted-foreground">Milestone At Risk</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Edit thresholds in the programme settings.</p>
              </div>
            </div>
          )}
        </SectionCard>

        {/* User Management */}
        <SectionCard title="User Management" icon={Users}>
          {usersLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <div>
              {(!usersData?.users || usersData.users.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">No users found. Users appear here after their first login.</p>
              ) : (
                usersData.users.map((user) => (
                  <UserRoleRow
                    key={user.id}
                    user={user}
                    saving={savingUsers.has(user.id)}
                    onRoleChange={handleRoleChange}
                  />
                ))
              )}
              <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 shrink-0" />
                  <span>Role changes take effect after the user logs out and back in.</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Admin</span> — full access.{" "}
                  <span className="font-semibold text-foreground">Project Manager</span> — progress, evidence & reports.{" "}
                  <span className="font-semibold text-foreground">Approver</span> — approve milestones.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
