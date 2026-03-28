import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "http://localhost:3000";

async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync("spmo_auth_session_token"); } catch { return null; }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

export function useApi<T>(path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => apiFetch<T>(path),
    enabled,
    staleTime: 30_000,
  });
}

export function useApiMutation<TData, TBody>(path: string, method = "POST") {
  const qc = useQueryClient();
  return useMutation<TData, Error, TBody>({
    mutationFn: (body) => apiFetch<TData>(path, { method, body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
