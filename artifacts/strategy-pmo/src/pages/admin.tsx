import { useState } from "react";
import {
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmaAdminUsers,
  useGetCurrentAuthUser,
  useUpdateSpmaUserRole,
  type SpmaAdminUser,
  customFetch,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import {
  Loader2, ShieldCheck, Settings, Users, RefreshCw, Lock,
  KeyRound, Plus, Trash2, ChevronDown, ChevronUp, Check, X, Search, Eye,
  Bell, Send, Mail,
} from "lucide-react";
import { inputClass } from "@/components/modal";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  useProjectAccessGrants,
  useGrantProjectAccess,
  useUpdateProjectPermissions,
  useRevokeProjectAccess,
  PERMISSION_LABELS,
  DEFAULT_PERMISSIONS,
  type ProjectAccessGrant,
  type ProjectPermissions,
} from "@/hooks/use-project-access";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type UserRole = "admin" | "project-manager" | "approver";

const ROLES: { value: UserRole; label: string; description: string; color: string }[] = [
  { value: "admin", label: "Admin", description: "Full edit access", color: "bg-primary text-primary-foreground border-primary" },
  { value: "project-manager", label: "Project Manager", description: "Update progress & reports", color: "bg-blue-500 text-white border-blue-500" },
  { value: "approver", label: "Approver", description: "Approve milestones", color: "bg-amber-500 text-white border-amber-500" },
];

const PERM_KEYS = Object.keys(PERMISSION_LABELS) as (keyof ProjectPermissions)[];

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

function UserRoleRow({ user, saving, onRoleChange, currentUserId }: {
  user: SpmaAdminUser;
  saving: boolean;
  onRoleChange: (userId: string, role: UserRole) => void;
  currentUserId?: string;
}) {
  const isSelf = user.id === currentUserId;
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
              onClick={() => !isActive && !isSelf && onRoleChange(user.id, role.value)}
              disabled={saving || (isSelf && role.value !== currentRole)}
              title={isSelf && role.value !== currentRole ? "You cannot change your own role" : undefined}
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

// ─── Permission Toggle ──────────────────────────────────────────────────────

function PermToggle({
  enabled, onChange, saving,
}: { enabled: boolean; onChange: (v: boolean) => void; saving?: boolean }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      disabled={saving}
      className={[
        "w-8 h-5 rounded-full transition-all relative shrink-0",
        enabled ? "bg-primary" : "bg-muted-foreground/30",
        saving ? "opacity-50" : "",
      ].join(" ")}
      aria-pressed={enabled}
    >
      <span
        className={[
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all",
          enabled ? "left-3.5" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Grant Row with expandable permission grid ─────────────────────────────

function GrantRow({
  grant, projectId,
}: { grant: ProjectAccessGrant; projectId: number }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [localPerms, setLocalPerms] = useState<ProjectPermissions>({
    canEditDetails:          grant.canEditDetails,
    canManageMilestones:     grant.canManageMilestones,
    canSubmitReports:        grant.canSubmitReports,
    canManageRisks:          grant.canManageRisks,
    canManageBudget:         grant.canManageBudget,
    canManageDocuments:      grant.canManageDocuments,
    canManageActions:        grant.canManageActions,
    canManageRaci:           grant.canManageRaci,
    canSubmitChangeRequests: grant.canSubmitChangeRequests,
  });
  const [savingPerm, setSavingPerm] = useState<string | null>(null);

  const updatePerms = useUpdateProjectPermissions();
  const revoke = useRevokeProjectAccess();

  const activeCount = Object.values(localPerms).filter(Boolean).length;

  async function handleToggle(key: keyof ProjectPermissions) {
    const newVal = !localPerms[key];
    const next = { ...localPerms, [key]: newVal };
    setLocalPerms(next);
    setSavingPerm(key);
    try {
      await updatePerms.mutateAsync({ projectId, userId: grant.userId, permissions: { [key]: newVal } });
    } catch {
      setLocalPerms(localPerms); // revert
      toast({ variant: "destructive", title: "Failed", description: "Could not update permission." });
    } finally {
      setSavingPerm(null);
    }
  }

  async function handleRevoke() {
    try {
      await revoke.mutateAsync({ projectId, userId: grant.userId });
      toast({ title: "Access revoked", description: `${grant.userName ?? grant.userId} has been removed.` });
    } catch {
      toast({ variant: "destructive", title: "Failed", description: "Could not revoke access." });
    }
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden mb-2 last:mb-0">
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-secondary/10 transition-colors">
        <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
          {(grant.userName ?? grant.userId)[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{grant.userName ?? grant.userId}</div>
          <div className="text-xs text-muted-foreground">
            {activeCount === PERM_KEYS.length ? "All permissions" : `${activeCount} of ${PERM_KEYS.length} permissions`}
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Hide</> : <><ChevronDown className="w-3.5 h-3.5" />Permissions</>}
        </button>
        <button
          onClick={handleRevoke}
          disabled={revoke.isPending}
          className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors shrink-0"
          title="Revoke all access"
        >
          {revoke.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Permission grid */}
      {expanded && (
        <div className="border-t border-border bg-secondary/10 px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PERM_KEYS.map((key) => {
            const { label, description } = PERMISSION_LABELS[key];
            const enabled = localPerms[key];
            return (
              <div
                key={key}
                className={[
                  "flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors",
                  enabled ? "bg-background border-primary/20" : "bg-muted/30 border-border/50",
                ].join(" ")}
              >
                <div className="flex-1 min-w-0">
                  <div className={["text-xs font-semibold", enabled ? "" : "text-muted-foreground"].join(" ")}>{label}</div>
                  <div className="text-[10px] text-muted-foreground/80 leading-tight">{description}</div>
                </div>
                <PermToggle
                  enabled={enabled}
                  onChange={() => handleToggle(key)}
                  saving={savingPerm === key}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Project Access Panel ───────────────────────────────────────────────────

type SimpleProject = { id: number; name: string; projectCode: string | null };

function ProjectAccessPanel({ users }: { users: SpmaAdminUser[] }) {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [grantUserId, setGrantUserId] = useState("");
  const [newPerms, setNewPerms] = useState<ProjectPermissions>({ ...DEFAULT_PERMISSIONS });
  const [showPermConfig, setShowPermConfig] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projectsData, isLoading: projectsLoading } = useQuery<{ projects: SimpleProject[] }>({
    queryKey: ["/api/spmo/projects"],
    queryFn: () => customFetch("/api/spmo/projects"),
    staleTime: 60_000,
  });

  const { data: grantsData, isLoading: grantsLoading } = useProjectAccessGrants(selectedProjectId);
  const grantMutation = useGrantProjectAccess();

  const projects = projectsData?.projects ?? [];
  const filteredProjects = projectSearch
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        (p.projectCode ?? "").toLowerCase().includes(projectSearch.toLowerCase())
      )
    : projects;

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
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
        permissions: newPerms,
      });
      setGrantUserId("");
      setNewPerms({ ...DEFAULT_PERMISSIONS });
      setShowPermConfig(false);
      toast({ title: "Access granted", description: `${userName} can now access this project.` });
    } catch {
      toast({ variant: "destructive", title: "Failed", description: "Could not grant access." });
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Grant project managers access to specific projects and control exactly what they can do. Admins always have full access.
      </p>

      {/* Two-column layout: project picker on left, details on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

        {/* ── Left: inline project search + list ── */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Select Project</div>
          <input
            type="text"
            placeholder="Search by name or code…"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          />
          <div className="border border-border rounded-xl overflow-hidden">
            {projectsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
            ) : filteredProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No projects match your search.</p>
            ) : (
              <div className="divide-y divide-border/40 overflow-y-auto" style={{ maxHeight: "340px" }}>
                {filteredProjects.map((p) => {
                  const isSelected = p.id === selectedProjectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={[
                        "w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2",
                        isSelected
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "hover:bg-secondary/40 border-l-2 border-transparent",
                      ].join(" ")}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-14 truncate">
                        {p.projectCode ?? "—"}
                      </span>
                      <span className={["text-sm truncate", isSelected ? "font-semibold text-primary" : ""].join(" ")}>
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{filteredProjects.length} of {projects.length} projects</p>
        </div>

        {/* ── Right: grants + grant form ── */}
        <div className="space-y-4">
          {!selectedProject ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-xl border border-dashed border-border text-center px-6 py-10 text-muted-foreground">
              <KeyRound className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm font-medium">Select a project on the left</p>
              <p className="text-xs mt-1 opacity-70">You can then view and manage who has access to it.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{selectedProject.name}</div>
                  <div className="text-xs text-muted-foreground">{selectedProject.projectCode ?? "No code"}</div>
                </div>
              </div>

              {/* Current Grants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Access Grants</div>
                  {grantsData?.grants && grantsData.grants.length > 0 && (
                    <div className="text-xs text-muted-foreground">{grantsData.grants.length} user{grantsData.grants.length !== 1 ? "s" : ""}</div>
                  )}
                </div>
                {grantsLoading ? (
                  <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
                ) : !grantsData?.grants || grantsData.grants.length === 0 ? (
                  <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-3">
                    No users have been granted access. Only admins can edit this project.
                  </p>
                ) : (
                  <div>
                    {grantsData.grants.map((grant) => (
                      <GrantRow key={grant.id} grant={grant} projectId={selectedProject.id} />
                    ))}
                  </div>
                )}
              </div>

              {/* Grant New Access */}
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="text-sm font-semibold">Grant Access to a User</div>
                {pmUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No project managers have registered. Assign the Project Manager role first.</p>
                ) : (
                  <div className="space-y-3">
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
                        onClick={() => setShowPermConfig((s) => !s)}
                        disabled={!grantUserId}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-40 transition-colors shrink-0"
                      >
                        {showPermConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Permissions
                      </button>
                    </div>

                    {showPermConfig && grantUserId && (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <div className="px-3 py-2 bg-secondary/30 border-b border-border flex items-center justify-between">
                          <span className="text-xs font-semibold">Permissions for new grant</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setNewPerms(Object.fromEntries(PERM_KEYS.map((k) => [k, true])) as ProjectPermissions)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />All
                            </button>
                            <button
                              onClick={() => setNewPerms(Object.fromEntries(PERM_KEYS.map((k) => [k, false])) as ProjectPermissions)}
                              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />None
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border">
                          {PERM_KEYS.map((key) => {
                            const { label, description } = PERMISSION_LABELS[key];
                            const enabled = newPerms[key];
                            return (
                              <label
                                key={key}
                                className={[
                                  "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                                  enabled ? "bg-primary/5" : "bg-background",
                                ].join(" ")}
                              >
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={(e) => setNewPerms({ ...newPerms, [key]: e.target.checked })}
                                  className="w-3.5 h-3.5 rounded border-border accent-primary shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold truncate">{label}</div>
                                  <div className="text-[10px] text-muted-foreground leading-tight">{description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleGrant}
                      disabled={!grantUserId || grantMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:-translate-y-0.5 transition-all"
                    >
                      {grantMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Grant Access
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── User Access Overview ────────────────────────────────────────────────────

interface UserAccessData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  ownedProjects: { id: number; name: string; projectCode: string | null }[];
  accessGrants: {
    projectId: number; projectName: string; projectCode: string | null;
    canEditDetails: boolean; canManageMilestones: boolean; canSubmitReports: boolean;
    canManageRisks: boolean; canManageBudget: boolean; canManageDocuments: boolean;
    canManageActions: boolean; canManageRaci: boolean; canSubmitChangeRequests: boolean;
  }[];
}

const PERM_SHORT_LABELS: Record<string, string> = {
  canEditDetails: "Edit",
  canManageMilestones: "Milestones",
  canSubmitReports: "Reports",
  canManageRisks: "Risks",
  canManageBudget: "Budget",
  canManageDocuments: "Documents",
  canManageActions: "Actions",
  canManageRaci: "RACI",
  canSubmitChangeRequests: "Changes",
};

function UserAccessOverview() {
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ users: UserAccessData[] }>({
    queryKey: ["/api/spmo/admin/users-access"],
    queryFn: () => customFetch("/api/spmo/admin/users-access"),
    staleTime: 30_000,
  });

  const users = data?.users ?? [];
  const filtered = search
    ? users.filter((u) => {
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return name.includes(search.toLowerCase()) || (u.email ?? "").toLowerCase().includes(search.toLowerCase());
      })
    : users;

  const roleBadge = (role: string | null) => {
    const r = role ?? "project-manager";
    const cls = r === "admin" ? "bg-primary/10 text-primary border-primary/30"
      : r === "approver" ? "bg-violet-50 text-violet-700 border-violet-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{r.replace("-", " ")}</span>;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        View all registered users, their roles, owned projects, and per-project permissions at a glance.
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name or email…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No users found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => {
            const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id;
            const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || "?";
            const isExpanded = expandedUser === user.id;
            const totalProjects = user.ownedProjects.length + user.accessGrants.length;
            const isAdmin = user.role === "admin";

            return (
              <div key={user.id} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{displayName}</span>
                      {roleBadge(user.role)}
                    </div>
                    {user.email && <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {isAdmin ? "Full access" : totalProjects > 0 ? `${totalProjects} project${totalProjects > 1 ? "s" : ""}` : "No projects"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-muted/10 space-y-3 animate-in slide-in-from-top-1 duration-150">
                    {isAdmin ? (
                      <p className="text-xs text-muted-foreground italic">Admins have full access to all projects and features.</p>
                    ) : (
                      <>
                        {/* Owned projects */}
                        {user.ownedProjects.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Owner of ({user.ownedProjects.length})</div>
                            <div className="flex flex-wrap gap-1.5">
                              {user.ownedProjects.map((p) => (
                                <span key={p.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 font-medium">
                                  {p.projectCode && <span className="font-mono text-[10px] opacity-70">{p.projectCode}</span>}
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Access grants with permissions */}
                        {user.accessGrants.length > 0 ? (
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Explicit access grants ({user.accessGrants.length})</div>
                            <div className="space-y-2">
                              {user.accessGrants.map((g) => {
                                const activePerms = Object.entries(PERM_SHORT_LABELS).filter(([key]) => (g as Record<string, boolean>)[key]);
                                const deniedPerms = Object.entries(PERM_SHORT_LABELS).filter(([key]) => !(g as Record<string, boolean>)[key]);
                                return (
                                  <div key={g.projectId} className="rounded-lg border border-border bg-background p-2.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="font-mono text-[10px] text-muted-foreground">{g.projectCode ?? "—"}</span>
                                      <span className="text-xs font-semibold">{g.projectName}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {activePerms.map(([, label]) => (
                                        <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium flex items-center gap-0.5">
                                          <Check className="w-2.5 h-2.5" /> {label}
                                        </span>
                                      ))}
                                      {deniedPerms.map(([, label]) => (
                                        <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 border border-red-200 font-medium flex items-center gap-0.5 opacity-60">
                                          <X className="w-2.5 h-2.5" /> {label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : user.ownedProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            No explicit access grants. As a {user.role ?? "project-manager"}, this user has default access to all projects unless restricted.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Email & Notifications Panel ─────────────────────────────────────────────

function EmailNotificationsPanel({ config, users }: { config: Record<string, unknown> | undefined; users: SpmaAdminUser[] }) {
  const { toast } = useToast();
  const updateConfig = useUpdateSpmoConfig();
  const qc = useQueryClient();

  const [riskAlertThreshold, setRiskAlertThreshold] = useState(config?.riskAlertThreshold as number ?? 9);
  const [reminderDaysAhead, setReminderDaysAhead] = useState(config?.reminderDaysAhead as number ?? 3);
  const [weeklyDeadlineHour, setWeeklyDeadlineHour] = useState(config?.weeklyReportDeadlineHour as number ?? 15);
  const [projectAtRiskThreshold, setProjectAtRiskThreshold] = useState(config?.projectAtRiskThreshold as number ?? 5);
  const [projectDelayedThreshold, setProjectDelayedThreshold] = useState(config?.projectDelayedThreshold as number ?? 10);
  const [milestoneAtRiskThreshold, setMilestoneAtRiskThreshold] = useState(config?.milestoneAtRiskThreshold as number ?? 5);
  const [weeklyReportCc, setWeeklyReportCc] = useState(config?.weeklyReportCcEmails as string ?? "");
  const [savingConfig, setSavingConfig] = useState(false);
  const [sendingTask, setSendingTask] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);
  const [lastTaskResult, setLastTaskResult] = useState<{ sent: number; reminders?: { to: string; toName: string; subject: string; totalItems: number }[] } | null>(null);
  const [lastWeeklyResult, setLastWeeklyResult] = useState<{ sent: number; reminders?: { to: string; toName: string; subject: string; totalItems: number }[] } | null>(null);

  const pmUsers = users.filter((u) => u.role === "project-manager");

  async function saveNotificationConfig() {
    setSavingConfig(true);
    try {
      await updateConfig.mutateAsync({
        data: {
          riskAlertThreshold,
          reminderDaysAhead,
          weeklyReportDeadlineHour: weeklyDeadlineHour,
          weeklyReportCcEmails: weeklyReportCc || null,
          projectAtRiskThreshold,
          projectDelayedThreshold,
          milestoneAtRiskThreshold,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/spmo/config"] });
      toast({ title: "Settings saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save" });
    } finally {
      setSavingConfig(false);
    }
  }

  async function sendTaskReminders() {
    setSendingTask(true);
    setLastTaskResult(null);
    try {
      const res = await fetch("/api/spmo/admin/send-reminders", { method: "POST", credentials: "include" });
      const data = await res.json();
      setLastTaskResult({ sent: data.sent ?? 0, reminders: data.reminders });
      toast({ title: `${data.sent} task reminder${data.sent !== 1 ? "s" : ""} generated` });
    } catch {
      toast({ variant: "destructive", title: "Failed" });
    } finally {
      setSendingTask(false);
    }
  }

  async function sendWeeklyReminders() {
    setSendingWeekly(true);
    setLastWeeklyResult(null);
    try {
      const res = await fetch("/api/spmo/admin/send-weekly-report-reminders", { method: "POST", credentials: "include" });
      const data = await res.json();
      setLastWeeklyResult({ sent: data.sent ?? 0, reminders: data.reminders });
      toast({ title: `${data.sent} weekly report reminder${data.sent !== 1 ? "s" : ""} generated` });
    } catch {
      toast({ variant: "destructive", title: "Failed" });
    } finally {
      setSendingWeekly(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Health Thresholds ── */}
      <div>
        <div className="text-sm font-semibold mb-1">Health Status Thresholds</div>
        <p className="text-xs text-muted-foreground mb-3">Configure when projects and milestones are flagged as at-risk or delayed.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Project At Risk %</label>
            <input type="number" min={1} max={50} className={inputClass} value={projectAtRiskThreshold} onChange={(e) => setProjectAtRiskThreshold(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Progress lag vs planned that triggers "at risk"</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Project Delayed %</label>
            <input type="number" min={1} max={50} className={inputClass} value={projectDelayedThreshold} onChange={(e) => setProjectDelayedThreshold(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Progress lag that triggers "delayed"</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Milestone At Risk %</label>
            <input type="number" min={1} max={50} className={inputClass} value={milestoneAtRiskThreshold} onChange={(e) => setMilestoneAtRiskThreshold(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Same threshold for individual milestones</p>
          </div>
        </div>
      </div>

      {/* ── Notification Thresholds ── */}
      <div>
        <div className="text-sm font-semibold mb-1">Notification Triggers</div>
        <p className="text-xs text-muted-foreground mb-3">Configure when email reminders are sent to project managers.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Risk Alert Score</label>
            <input type="number" min={1} max={20} className={inputClass} value={riskAlertThreshold} onChange={(e) => setRiskAlertThreshold(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Risks with score ≥ this appear in PM tasks</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Task Reminder Days</label>
            <input type="number" min={1} max={14} className={inputClass} value={reminderDaysAhead} onChange={(e) => setReminderDaysAhead(Number(e.target.value))} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Days before milestone deadline to send reminder</p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Weekly Report Deadline</label>
            <select className={inputClass} value={weeklyDeadlineHour} onChange={(e) => setWeeklyDeadlineHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00{i === 15 ? " (default)" : ""}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-0.5">Hour by which weekly report must be submitted</p>
          </div>
        </div>
      </div>

      {/* ── CC Recipients ── */}
      <div>
        <div className="text-sm font-semibold mb-1">CC Recipients for Overdue Reports</div>
        <p className="text-xs text-muted-foreground mb-3">
          When a project manager misses their weekly report deadline, who should be CC'd? Enter comma-separated emails.
        </p>
        <input className={inputClass} value={weeklyReportCc} onChange={(e) => setWeeklyReportCc(e.target.value)}
          placeholder="director@example.gov, pmo-lead@example.gov" />
        {weeklyReportCc && weeklyReportCc.split(",").some((e) => e.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) && (
          <p className="text-[10px] text-destructive mt-0.5">One or more email addresses appear invalid</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          These recipients will be CC'd on all overdue weekly report emails. Each PM only receives reminders for their specific missing reports.
        </p>
      </div>

      {/* ── Save ── */}
      <button onClick={saveNotificationConfig} disabled={savingConfig}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-all">
        {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
        Save All Settings
      </button>

      {/* ── Send Buttons ── */}
      <div className="pt-4 border-t border-border">
        <div className="text-sm font-semibold mb-1">Send Reminders Now</div>
        <p className="text-xs text-muted-foreground mb-3">
          Preview and trigger email reminders. Each PM only receives items specific to their projects.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={sendTaskReminders} disabled={sendingTask}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted/50 disabled:opacity-50 transition-colors">
            {sendingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-primary" />}
            Send Task Reminders
            <span className="text-[10px] text-muted-foreground">({reminderDaysAhead}d ahead of deadlines)</span>
          </button>
          <button onClick={sendWeeklyReminders} disabled={sendingWeekly}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors">
            {sendingWeekly ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send Weekly Report Overdue
            <span className="text-[10px] text-amber-600">(deadline {String(weeklyDeadlineHour).padStart(2, "0")}:00)</span>
          </button>
        </div>

        {/* Task reminder results */}
        {lastTaskResult !== null && (
          <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="text-sm font-semibold">{lastTaskResult.sent} task reminder{lastTaskResult.sent !== 1 ? "s" : ""} generated</div>
            {lastTaskResult.sent === 0 && <p className="text-xs text-muted-foreground">All PMs are up to date — no reminders needed.</p>}
            {lastTaskResult.reminders?.map((r, i) => (
              <div key={i} className="text-xs flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                <span className="font-semibold">{r.toName}</span>
                <span className="text-muted-foreground">({r.to})</span>
                <span className="ml-auto text-muted-foreground">{r.totalItems} item{r.totalItems !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        )}

        {/* Weekly report results */}
        {lastWeeklyResult !== null && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
            <div className="text-sm font-semibold text-amber-800">{lastWeeklyResult.sent} weekly report reminder{lastWeeklyResult.sent !== 1 ? "s" : ""} generated</div>
            {lastWeeklyResult.sent === 0 && <p className="text-xs text-amber-700">All weekly reports submitted on time — no overdue reminders.</p>}
            {lastWeeklyResult.reminders?.map((r, i) => (
              <div key={i} className="text-xs flex items-center gap-2 py-1 border-b border-amber-200/60 last:border-0">
                <span className="font-semibold text-amber-900">{r.toName}</span>
                <span className="text-amber-700">({r.to})</span>
                <span className="ml-auto text-amber-700">{r.totalItems} project{r.totalItems !== 1 ? "s" : ""} missing</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Admin Page ────────────────────────────────────────────────────────

export default function Admin() {
  const isAdmin = useIsAdmin();
  const { data: authData } = useGetCurrentAuthUser();
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
              These weights are applied to the 4 mandatory phase gates when a new project is created. Changes affect new projects only.
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
                    currentUserId={authData?.user?.id}
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
                  <span className="font-semibold text-foreground">Project Manager</span> — configurable per-project.{" "}
                  <span className="font-semibold text-foreground">Approver</span> — approve milestones.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Email & Notifications */}
      <SectionCard title="Email & Notifications" icon={Bell}>
        <EmailNotificationsPanel config={configData as Record<string, unknown> | undefined} users={usersData?.users ?? []} />
      </SectionCard>

      {/* User Access Overview */}
      <SectionCard title="User Access Overview" icon={Eye}>
        <UserAccessOverview />
      </SectionCard>

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
