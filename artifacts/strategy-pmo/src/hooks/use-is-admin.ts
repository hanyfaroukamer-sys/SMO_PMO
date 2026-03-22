import { useGetCurrentAuthUser } from "@workspace/api-client-react";

export function useIsAdmin() {
  const { data: authData } = useGetCurrentAuthUser();
  return authData?.user?.role === "admin";
}

export function useIsProjectManager() {
  const { data: authData } = useGetCurrentAuthUser();
  return authData?.user?.role === "project-manager";
}

export function useCurrentUser() {
  const { data: authData } = useGetCurrentAuthUser();
  return authData?.user ?? null;
}
