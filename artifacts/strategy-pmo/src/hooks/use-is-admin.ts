import { useGetCurrentAuthUser } from "@workspace/api-client-react";

export function useIsAdmin() {
  const { data: authData } = useGetCurrentAuthUser();
  return authData?.user?.role === "admin";
}

export function useCurrentUser() {
  const { data: authData } = useGetCurrentAuthUser();
  return authData?.user ?? null;
}
