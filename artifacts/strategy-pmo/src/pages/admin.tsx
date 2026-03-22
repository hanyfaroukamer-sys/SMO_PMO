import { useState } from "react";
import {
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmaAdminUsers,
  useUpdateSpmaUserRole,
  type SpmaAdminUser,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, ShieldCheck, Settings, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function UserRoleRow({ user, onRoleChange }: { user: SpmaAdminUser; onRoleChange: (userId: string, role: "admin" | "project-manager") => void }) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
  const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{displayName}</div>
        {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
      </div>
      <select
        value={user.role ?? "project-manager"}
        onChange={(e) => onRoleChange(user.id, e.target.value as "admin" | "project-manager")}
        className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
      >
        <option value="admin">Admin</option>
        <option value="project-manager">Project Manager</option>
      </select>
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

  async function handleRoleChange(userId: string, role: "admin" | "project-manager") {
    try {
      await updateRole.mutateAsync({ userId, data: { role } });
      qc.invalidateQueries({ queryKey: ["/api/spmo/admin/users"] });
      toast({ title: "Role updated", description: `User role changed to ${role}.` });
    } catch {
      toast({ variant: "destructive", title: "Update failed", description: "Could not change user role." });
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
                <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>
              ) : (
                <div>
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground pb-2 border-b border-border/50 mb-1">
                    <span>User</span>
                    <span>Role</span>
                  </div>
                  {usersData.users.map((user) => (
                    <UserRoleRow key={user.id} user={user} onRoleChange={handleRoleChange} />
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                <span className="font-semibold text-foreground">Admin</span> — full edit access to all data.{" "}
                <span className="font-semibold text-foreground">Project Manager</span> — can update progress, upload evidence, submit milestones, and write weekly reports.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
