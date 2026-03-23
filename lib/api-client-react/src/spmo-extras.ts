import { useQuery, useMutation, UseQueryOptions, UseMutationOptions, QueryKey } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SpmoChangeRequest = {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  changeType: "scope" | "budget" | "timeline" | "resource" | "other";
  impact: string | null;
  requestedById: string;
  requestedByName: string | null;
  requestedAt: string;
  status: "draft" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewComments: string | null;
  budgetImpact: number | null;
  timelineImpact: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SpmoRaci = {
  id: number;
  projectId: number;
  milestoneId: number | null;
  userId: string;
  userName: string | null;
  role: "responsible" | "accountable" | "consulted" | "informed";
  createdAt: string;
};

export type SpmoDocument = {
  id: number;
  projectId: number | null;
  milestoneId: number | null;
  title: string;
  description: string | null;
  category: "business_case" | "charter" | "plan" | "report" | "template" | "contract" | "other";
  fileName: string;
  contentType: string | null;
  objectPath: string;
  version: number;
  uploadedById: string;
  uploadedByName: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type SpmoAction = {
  id: number;
  projectId: number;
  milestoneId: number | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "done" | "cancelled";
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Change Requests ────────────────────────────────────────────────────────

export const useListSpmoChangeRequests = (projectId?: number, options?: UseQueryOptions<{ changeRequests: SpmoChangeRequest[] }>) => {
  const queryKey: QueryKey = ["/api/spmo/change-requests", projectId];
  const query = useQuery<{ changeRequests: SpmoChangeRequest[] }>({
    queryKey,
    queryFn: ({ signal }) => customFetch(`/api/spmo/change-requests${projectId ? `?projectId=${projectId}` : ""}`, { signal }),
    ...options,
  });
  return { ...query, queryKey };
};

export const useCreateSpmoChangeRequest = (options?: UseMutationOptions<SpmoChangeRequest, unknown, Partial<SpmoChangeRequest>>) =>
  useMutation<SpmoChangeRequest, unknown, Partial<SpmoChangeRequest>>({
    mutationFn: (body) => customFetch("/api/spmo/change-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useUpdateSpmoChangeRequest = (options?: UseMutationOptions<SpmoChangeRequest, unknown, { id: number } & Partial<SpmoChangeRequest>>) =>
  useMutation<SpmoChangeRequest, unknown, { id: number } & Partial<SpmoChangeRequest>>({
    mutationFn: ({ id, ...body }) => customFetch(`/api/spmo/change-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useDeleteSpmoChangeRequest = (options?: UseMutationOptions<unknown, unknown, number>) =>
  useMutation<unknown, unknown, number>({
    mutationFn: (id) => customFetch(`/api/spmo/change-requests/${id}`, { method: "DELETE" }),
    ...options,
  });

// ─── RACI ───────────────────────────────────────────────────────────────────

export const useListSpmoRaci = (projectId?: number, options?: UseQueryOptions<{ raci: SpmoRaci[] }>) => {
  const queryKey: QueryKey = ["/api/spmo/raci", projectId];
  const query = useQuery<{ raci: SpmoRaci[] }>({
    queryKey,
    queryFn: ({ signal }) => customFetch(`/api/spmo/raci?projectId=${projectId}`, { signal }),
    enabled: !!projectId,
    ...options,
  });
  return { ...query, queryKey };
};

export const useUpsertSpmoRaci = (options?: UseMutationOptions<SpmoRaci, unknown, Partial<SpmoRaci>>) =>
  useMutation<SpmoRaci, unknown, Partial<SpmoRaci>>({
    mutationFn: (body) => customFetch("/api/spmo/raci", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useDeleteSpmoRaci = (options?: UseMutationOptions<unknown, unknown, number>) =>
  useMutation<unknown, unknown, number>({
    mutationFn: (id) => customFetch(`/api/spmo/raci/${id}`, { method: "DELETE" }),
    ...options,
  });

// ─── Documents ───────────────────────────────────────────────────────────────

export const useListSpmoDocuments = (projectId?: number | null, options?: UseQueryOptions<{ documents: SpmoDocument[] }>) => {
  const queryKey: QueryKey = ["/api/spmo/documents", projectId];
  const query = useQuery<{ documents: SpmoDocument[] }>({
    queryKey,
    queryFn: ({ signal }) => customFetch(`/api/spmo/documents${projectId != null ? `?projectId=${projectId}` : ""}`, { signal }),
    ...options,
  });
  return { ...query, queryKey };
};

export const useCreateSpmoDocument = (options?: UseMutationOptions<SpmoDocument, unknown, Partial<SpmoDocument>>) =>
  useMutation<SpmoDocument, unknown, Partial<SpmoDocument>>({
    mutationFn: (body) => customFetch("/api/spmo/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useUpdateSpmoDocument = (options?: UseMutationOptions<SpmoDocument, unknown, { id: number } & Partial<SpmoDocument>>) =>
  useMutation<SpmoDocument, unknown, { id: number } & Partial<SpmoDocument>>({
    mutationFn: ({ id, ...body }) => customFetch(`/api/spmo/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useDeleteSpmoDocument = (options?: UseMutationOptions<unknown, unknown, number>) =>
  useMutation<unknown, unknown, number>({
    mutationFn: (id) => customFetch(`/api/spmo/documents/${id}`, { method: "DELETE" }),
    ...options,
  });

// ─── Action Items ─────────────────────────────────────────────────────────────

export const useListSpmoActions = (projectId?: number, options?: UseQueryOptions<{ actions: SpmoAction[] }>) => {
  const queryKey: QueryKey = ["/api/spmo/actions", projectId];
  const query = useQuery<{ actions: SpmoAction[] }>({
    queryKey,
    queryFn: ({ signal }) => customFetch(`/api/spmo/actions${projectId ? `?projectId=${projectId}` : ""}`, { signal }),
    ...options,
  });
  return { ...query, queryKey };
};

export const useCreateSpmoAction = (options?: UseMutationOptions<SpmoAction, unknown, Partial<SpmoAction>>) =>
  useMutation<SpmoAction, unknown, Partial<SpmoAction>>({
    mutationFn: (body) => customFetch("/api/spmo/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useUpdateSpmoAction = (options?: UseMutationOptions<SpmoAction, unknown, { id: number } & Partial<SpmoAction>>) =>
  useMutation<SpmoAction, unknown, { id: number } & Partial<SpmoAction>>({
    mutationFn: ({ id, ...body }) => customFetch(`/api/spmo/actions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ...options,
  });

export const useDeleteSpmoAction = (options?: UseMutationOptions<unknown, unknown, number>) =>
  useMutation<unknown, unknown, number>({
    mutationFn: (id) => customFetch(`/api/spmo/actions/${id}`, { method: "DELETE" }),
    ...options,
  });
