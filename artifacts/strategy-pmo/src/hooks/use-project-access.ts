import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useIsAdmin } from "./use-is-admin";
import { useCurrentUser } from "./use-is-admin";

export type ProjectAccessGrant = {
  id: number;
  projectId: number;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  grantedById: string;
  grantedByName: string | null;
  grantedAt: string;
};

/** Returns the current user's editable project IDs (or admin: true for admins) */
export function useMyProjectAccess() {
  const { data } = useQuery<{ admin: boolean; projectIds: number[] }>({
    queryKey: ["/api/spmo/my-project-access"],
    queryFn: () => customFetch("/api/spmo/my-project-access"),
    staleTime: 60_000,
  });
  return data ?? { admin: false, projectIds: [] };
}

/** Returns true if the current user can edit the given project */
export function useCanEditProject(projectId: number | null | undefined): boolean {
  const isAdmin = useIsAdmin();
  const { admin, projectIds } = useMyProjectAccess();
  if (isAdmin || admin) return true;
  if (!projectId) return false;
  return projectIds.includes(projectId);
}

/** Fetches access grants for a specific project (admin only) */
export function useProjectAccessGrants(projectId: number | null | undefined) {
  return useQuery<{ grants: ProjectAccessGrant[] }>({
    queryKey: ["/api/spmo/projects", projectId, "access"],
    queryFn: () => customFetch(`/api/spmo/projects/${projectId}/access`),
    enabled: projectId != null,
  });
}

/** Grants a user edit access to a project */
export function useGrantProjectAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId, userName, userEmail }: { projectId: number; userId: string; userName?: string; userEmail?: string }) =>
      customFetch(`/api/spmo/projects/${projectId}/access`, {
        method: "POST",
        body: JSON.stringify({ userId, userName, userEmail }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects", projectId, "access"] });
    },
  });
}

/** Revokes a user's edit access to a project */
export function useRevokeProjectAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: number; userId: string }) =>
      customFetch(`/api/spmo/projects/${projectId}/access/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects", projectId, "access"] });
    },
  });
}
