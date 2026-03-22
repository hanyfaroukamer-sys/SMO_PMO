import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface DepEnrichedRow {
  id: number;
  sourceType: "milestone" | "project";
  sourceId: number;
  sourceName: string;
  sourceProjectName: string;
  sourceThreshold: number;
  targetType: "milestone" | "project";
  targetId: number;
  targetName: string;
  targetProjectName: string;
  depType: "ms-ms" | "ms-proj" | "proj-proj";
  lagDays: number;
  isHard: boolean;
  notes: string | null;
  createdAt: string;
}

export interface BlockerInfo {
  sourceId: number;
  sourceType: "milestone" | "project";
  sourceName: string;
  sourceProject: string;
  sourceProgress: number;
  sourceApproval: string;
  required: number;
  isHard: boolean;
  lagDays: number;
  satisfied: boolean;
  reason: string;
  depType: string;
}

export interface DepResolution {
  status: "blocked" | "ready";
  blockers: BlockerInfo[];
}

export interface CreateDepPayload {
  sourceType: "milestone" | "project";
  sourceId: number;
  targetType: "milestone" | "project";
  targetId: number;
  depType: "ms-ms" | "ms-proj" | "proj-proj";
  sourceThreshold?: number;
  lagDays?: number;
  isHard?: boolean;
  notes?: string;
}

export interface CascadeResult {
  directlyBlocked: Array<{ id: number; name: string; project: string; type: string }>;
  indirectlyBlocked: Array<{ id: number; name: string; project: string; type: string; hops: number }>;
  totalAffected: number;
}

// ─────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────

export function useListDependencies() {
  return useQuery({
    queryKey: ["/api/spmo/dependencies"],
    queryFn: () =>
      customFetch<{ dependencies: DepEnrichedRow[] }>("/api/spmo/dependencies", {
        method: "GET",
      }),
  });
}

export function useResolveDependency(targetId: number, targetType: "milestone" | "project") {
  return useQuery({
    queryKey: [`/api/spmo/dependencies/resolve`, targetId, targetType],
    queryFn: () =>
      customFetch<DepResolution>(
        `/api/spmo/dependencies/resolve?targetId=${targetId}&targetType=${targetType}`,
        { method: "GET" },
      ),
    enabled: targetId > 0,
  });
}

export function useResolveProjectDependencies(projectId: number) {
  return useQuery({
    queryKey: [`/api/spmo/dependencies/resolve-project`, projectId],
    queryFn: () =>
      customFetch<{ resolutions: Record<number, DepResolution> }>(
        `/api/spmo/dependencies/resolve-project?projectId=${projectId}`,
        { method: "GET" },
      ),
    enabled: projectId > 0,
  });
}

export function useCascadeAnalysis(sourceId: number | null) {
  return useQuery({
    queryKey: [`/api/spmo/dependencies/cascade`, sourceId],
    queryFn: () =>
      customFetch<CascadeResult>(`/api/spmo/dependencies/cascade?sourceId=${sourceId}`, {
        method: "GET",
      }),
    enabled: sourceId !== null && sourceId > 0,
  });
}

export function useCreateDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDepPayload) =>
      customFetch<DepEnrichedRow>("/api/spmo/dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/dependencies"] });
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
    },
  });
}

export function useDeleteDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/spmo/dependencies/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/spmo/dependencies"] });
      qc.invalidateQueries({ queryKey: ["/api/spmo/projects"] });
    },
  });
}
