import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useIsAdmin } from "./use-is-admin";

export type ProjectPermissions = {
  canEditDetails: boolean;
  canManageMilestones: boolean;
  canSubmitReports: boolean;
  canManageRisks: boolean;
  canManageBudget: boolean;
  canManageDocuments: boolean;
  canManageActions: boolean;
  canManageRaci: boolean;
  canSubmitChangeRequests: boolean;
};

export const DEFAULT_PERMISSIONS: ProjectPermissions = {
  canEditDetails: true,
  canManageMilestones: true,
  canSubmitReports: true,
  canManageRisks: true,
  canManageBudget: true,
  canManageDocuments: true,
  canManageActions: true,
  canManageRaci: true,
  canSubmitChangeRequests: true,
};

export const PERMISSION_LABELS: Record<keyof ProjectPermissions, { label: string; description: string }> = {
  canEditDetails:          { label: "Edit Project Details",    description: "Status, dates, description, priority" },
  canManageMilestones:     { label: "Manage Milestones",       description: "Create, update, delete milestones" },
  canSubmitReports:        { label: "Submit Weekly Reports",   description: "Weekly achievements & next steps" },
  canManageRisks:          { label: "Manage Risks",            description: "Create and update risks & mitigations" },
  canManageBudget:         { label: "Manage Budget",           description: "Add and edit budget line items" },
  canManageDocuments:      { label: "Manage Documents",        description: "Upload and manage documents" },
  canManageActions:        { label: "Manage Actions",          description: "Create and update action items" },
  canManageRaci:           { label: "Manage RACI Matrix",      description: "Assign responsible, accountable, consulted, informed" },
  canSubmitChangeRequests: { label: "Submit Change Requests",  description: "Create change requests" },
};

export type ProjectAccessGrant = {
  id: number;
  projectId: number;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  grantedById: string;
  grantedByName: string | null;
  grantedAt: string;
} & ProjectPermissions;

type MyAccessGrant = { projectId: number } & ProjectPermissions;
type MyAccessResponse = { admin: true; grants: [] } | { admin: false; grants: MyAccessGrant[] };

/** Fetches current user's access grants (includes per-permission detail) */
export function useMyProjectAccess() {
  const isAdmin = useIsAdmin();
  const { data } = useQuery<MyAccessResponse>({
    queryKey: ["/api/spmo/my-project-access"],
    queryFn: () => customFetch("/api/spmo/my-project-access"),
    staleTime: 60_000,
    enabled: !isAdmin, // admins don't need to fetch
  });
  const userId = (data as Record<string, unknown> | undefined)?.userId as string | undefined;
  if (isAdmin) return { admin: true as const, grants: [] as MyAccessGrant[], currentUserId: undefined as string | undefined };
  return { ...(data ?? { admin: false as const, grants: [] as MyAccessGrant[] }), currentUserId: userId };
}

/** Returns the full permissions object for the current user on a specific project */
export function useProjectPermissions(projectId: number | null | undefined, projectOwnerId?: string | null): ProjectPermissions | null {
  const isAdmin = useIsAdmin();
  const access = useMyProjectAccess();
  if (isAdmin || access.admin) return { ...DEFAULT_PERMISSIONS };
  if (!projectId) return null;

  // If the current user is the project owner, they have full access
  if (projectOwnerId && access.currentUserId && projectOwnerId === access.currentUserId) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const grant = access.grants.find((g) => g.projectId === projectId);
  // Non-owner PM with no explicit grant — no access
  if (!grant) return null;
  return {
    canEditDetails:          grant.canEditDetails,
    canManageMilestones:     grant.canManageMilestones,
    canSubmitReports:        grant.canSubmitReports,
    canManageRisks:          grant.canManageRisks,
    canManageBudget:         grant.canManageBudget,
    canManageDocuments:      grant.canManageDocuments,
    canManageActions:        grant.canManageActions,
    canManageRaci:           grant.canManageRaci,
    canSubmitChangeRequests: grant.canSubmitChangeRequests,
  };
}

/** Returns true if the current user has the given permission on the project */
export function useCanDo(projectId: number | null | undefined, permission: keyof ProjectPermissions): boolean {
  const perms = useProjectPermissions(projectId);
  if (!perms) return false;
  return perms[permission];
}

/** Backwards-compat: true if user has any access to project (at least one perm enabled) */
export function useCanEditProject(projectId: number | null | undefined): boolean {
  const perms = useProjectPermissions(projectId);
  if (!perms) return false;
  return Object.values(perms).some(Boolean);
}

/** Fetches access grants for a specific project (admin only) */
export function useProjectAccessGrants(projectId: number | null | undefined) {
  return useQuery<{ grants: ProjectAccessGrant[] }>({
    queryKey: ["/api/spmo/projects", projectId, "access"],
    queryFn: () => customFetch(`/api/spmo/projects/${projectId}/access`),
    enabled: projectId != null,
  });
}

/** Grants a user edit access to a project with specific permissions */
export function useGrantProjectAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId, userId, userName, userEmail, permissions,
    }: {
      projectId: number;
      userId: string;
      userName?: string;
      userEmail?: string;
      permissions?: Partial<ProjectPermissions>;
    }) =>
      customFetch(`/api/spmo/projects/${projectId}/access`, {
        method: "POST",
        body: JSON.stringify({ userId, userName, userEmail, ...permissions }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects", projectId, "access"] });
      qc.invalidateQueries({ queryKey: ["/api/spmo/my-project-access"] });
    },
  });
}

/** Updates permission flags for an existing grant */
export function useUpdateProjectPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId, userId, permissions,
    }: {
      projectId: number;
      userId: string;
      permissions: Partial<ProjectPermissions>;
    }) =>
      customFetch(`/api/spmo/projects/${projectId}/access/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(permissions),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects", projectId, "access"] });
      qc.invalidateQueries({ queryKey: ["/api/spmo/my-project-access"] });
    },
  });
}

/** Revokes a user's edit access to a project entirely */
export function useRevokeProjectAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: number; userId: string }) =>
      customFetch(`/api/spmo/projects/${projectId}/access/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects", projectId, "access"] });
      qc.invalidateQueries({ queryKey: ["/api/spmo/my-project-access"] });
    },
  });
}
