import { ReactNode, useEffect } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useGetCurrentAuthUser();

  useEffect(() => {
    if (!isLoading && (!data?.user || error)) {
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = `/strategy-pmo/login?returnTo=${encodeURIComponent(returnTo)}`;
    }
  }, [isLoading, data, error]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Authenticating securely...</p>
        </div>
      </div>
    );
  }

  if (!data?.user || error) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
