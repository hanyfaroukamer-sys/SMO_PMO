import { useState } from "react";
import {
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmaAdminUsers,
  useUpdateSpmaUserRole,
  type SpmaAdminUser,
  customFetch,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, ShieldCheck, Settings, Users, RefreshCw, Lock, KeyRound, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  useProjectAccessGrants,
  useGrantProjectAccess,
  useRevokeProjectAccess,
  type ProjectAccessGrant,
} from "@/hooks/use-project-access";

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

// ─── Project Access Panel ───────────────────────────────────────────────────

type SimpleProject = { id: number; name: string; projectCode: string | null };

function ProjectAccessPanel({ users }: { users: SpmaAdminUser[] }) {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [showProjectList, setShowProjectList] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projectsData } = useQuery<{ projects: SimpleProject[] }>({
    queryKey: ["/api/spmo/projects"],
    queryFn: () => customFetch("/api/spmo/projects"),
    staleTime: 60_000,
  });

  const { data: grantsData, isLoading: grantsLoading } = useProjectAccessGrants(selectedProjectId);
  const grantMutation = useGrantProjectAccess();
  const revokeMutation = useRevokeProjectAccess();

  const projects = projectsData?.projects ?? [];
  const filteredProjects = projectSearch
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        (p.projectCode ?? "").toLowerCase().includes(projectSearch.toLowerCase())
      )
    : projects;

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Only project managers can be granted project-level access (admins always have access)
  const pmUsers = users.filter((u) => u.role === "project-manager");

  async function handleGrant() {
    if (!selectedProjectId || !grantUserId) return;
    const user = users.find((u) => u.id === grantUserId);
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || grantUserId;
    try {
      await grantMutation.mutateAsync({
        projectId: selectedProjectId,
        userId: grantUserId,
        userName,
        userEmail: user?.email ?? undefined,
      });
      setGrantUserId("");
      toast({ title: "Access granted", description: `${userName} can now edit this project.` });
    } catch {
      toast({ variant: "destructive", title: "Failed", description: "Could not grant access." });
    }
  }

  async function handleRevoke(grant: ProjectAccessGrant) {
    if (!selectedProjectId) return;
    try {
      await revokeMutation.mutateAsync({ projectId: selectedProjectId, userId: grant.userId });
      toast({ title: "Access revoked", description: `${grant.userName ?? grant.userId} no longer has edit access.` });
    } catch {
      toast({ variant: "destructive", title: "Failed", description: "Could not revoke access." });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Grant project managers the ability to edit a specific project. Admins always have full access and do not appear here.
      </p>

      {/* Project Selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Select Project</label>
        <div className="relative">
          <button
            onClick={() => setShowProjectList((s) => !s)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-sm hover:border-primary/50 transition-colors"
          >
            <span className={selectedProject ? "font-medium" : "text-muted-foreground"}>
              {selectedProject ? `[${selectedProject.projectCode ?? "—"}] ${selectedProject.name}` : "Choose a project…"}
            </span>
            {showProjectList ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          </button>

          {showProjectList && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-background shadow-lg overflow-hidden">
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  placeholder="Search projects…"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-border bg-secondary/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-border/40">
                {filteredProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No projects found</p>
                ) : (
                  filteredProjects.slice(0, 50).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProjectId(p.id); setShowProjectList(false); setProjectSearch(""); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">{p.projectCode ?? "—"}</span>
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedProject && (
        <>
          {/* Current Grants */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Current Access Grants</div>
            {grantsLoading ? (
              <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
            ) : !grantsData?.grants || grantsData.grants.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-3">
                No users have been granted project-level access. Only admins can edit this project.
              </p>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                {grantsData.grants.map((grant) => (
                  <div key={grant.id} className="flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-secondary/20 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                      {(grant.userName ?? grant.userId)[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{grant.userName ?? grant.userId}</div>
                      {grant.userEmail && <div className="text-xs text-muted-foreground truncate">{grant.userEmail}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground hidden sm:block">
                      by {grant.grantedByName ?? grant.grantedById}
                    </div>
                    <button
                      onClick={() => handleRevoke(grant)}
                      disabled={revokeMutation.isPending}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                      title="Revoke access"
                    >
                      {revokeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grant New Access */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="text-sm font-medium">Grant Edit Access</div>
            {pmUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No project managers have registered. Assign users the Project Manager role first.</p>
            ) : (
              <div className="flex gap-2 items-center">
                <select
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select user…</option>
                  {pmUsers.map((u) => {
                    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
                    const alreadyGranted = grantsData?.grants?.some((g) => g.userId === u.id);
                    return (
                      <option key={u.id} value={u.id} disabled={alreadyGranted}>
                        {name}{alreadyGranted ? " (already granted)" : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  onClick={handleGrant}
                  disabled={!grantUserId || grantMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:-translate-y-0.5 transition-all shrink-0"
                >
                  {grantMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Grant
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Admin Page ────────────────────────────────────────────────────────

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
  const [phaseWeights, setPhaseWeights] = useState<{ planning: number; tendering: number; execution: number; closure: number } | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);

  const effectiveResetDay = weeklyResetDay ?? configData?.weeklyResetDay ?? 3;
  const pw = phaseWeights ?? {
    planning: configData?.defaultPlanningWeight ?? 5,
    tendering: configData?.defaultTenderingWeight ?? 5,
    execution: configData?.defaultExecutionWeight ?? 85,
    closure: configData?.defaultClosureWeight ?? 5,
  };
  const pwTotal = pw.planning + pw.tendering + pw.execution + pw.closure;
  const pwValid = Math.abs(pwTotal - 100) < 0.01;

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

  async function handleSavePhaseDefaults() {
    if (!pwValid) {
      toast({ variant: "destructive", title: "Validation error", description: "All four weights must sum to exactly 100%." });
      return;
    }
    setSavingPhase(true);
    try {
      await updateConfig.mutateAsync({
        data: {
          defaultPlanningWeight: pw.planning,
          defaultTenderingWeight: pw.tendering,
          defaultExecutionWeight: pw.execution,
          defaultClosureWeight: pw.closure,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/spmo/programme-config"] });
      setPhaseWeights(null);
      toast({ title: "Phase gate defaults saved", description: "New projects will use these weights." });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not update phase gate defaults." });
    } finally {
      setSavingPhase(false);
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

      {/* Phase Gate Defaults */}
      <SectionCard title="Phase Gate Default Weights" icon={Lock}>
        {configLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These weights are applied to the 4 mandatory phase gates when a new project is created. Changes affect new projects only — existing projects are not retroactively updated.
            </p>
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Phase Gate</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase w-28">Weight (%)</th>
                    <th className="px-4 py-2 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {[
                    { key: "planning" as const, label: "Planning & Requirements", locked: true },
                    { key: "tendering" as const, label: "Tendering & Procurement", locked: true },
                    { key: "execution" as const, label: "Execution & Delivery (default)", locked: false },
                    { key: "closure" as const, label: "Closure & Handover", locked: true },
                  ].map(({ key, label, locked }) => (
                    <tr key={key} className="hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {locked && <Lock className="w-3 h-3 text-blue-500 shrink-0" />}
                          <span className={locked ? "font-medium" : "text-muted-foreground"}>{label}</span>
                          {locked && <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 font-semibold">PHASE GATE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={pw[key]}
                          onChange={(e) => setPhaseWeights({ ...pw, [key]: Number(e.target.value) })}
                          className="w-20 text-right text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ml-auto block"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right">%</td>
                    </tr>
                  ))}
                  <tr className={`font-bold ${pwValid ? "bg-green-50" : "bg-red-50"}`}>
                    <td className="px-4 py-2 text-sm">Total</td>
                    <td className="px-4 py-2 text-right text-sm">{pwTotal.toFixed(1)}</td>
                    <td className="px-4 py-2 text-xs text-right">{pwValid ? "✓ 100%" : <span className="text-red-600">Must = 100%</span>}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">Changes only affect newly created projects.</p>
              <button
                onClick={handleSavePhaseDefaults}
                disabled={savingPhase || !pwValid}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 hover:-translate-y-0.5 transition-transform"
              >
                {savingPhase ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Defaults
              </button>
            </div>
          </div>
        )}
      </SectionCard>

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

      {/* Project Access Control */}
      <SectionCard title="Project-Level Access Control" icon={KeyRound}>
        {usersLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <ProjectAccessPanel users={usersData?.users ?? []} />
        )}
      </SectionCard>
    </div>
  );
}
