import { useEffect } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Loader2, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { data, isLoading } = useGetCurrentAuthUser();

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "/strategy-pmo/";

  useEffect(() => {
    if (!isLoading && data?.user) {
      window.location.href = returnTo;
    }
  }, [isLoading, data, returnTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data?.user) return null;

  const loginUrl = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;
  const signupUrl = `/api/signup?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md px-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 shadow-2xl backdrop-blur-sm text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white tracking-tight">StrategyPMO</h1>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Programme Management</p>
            </div>
          </div>

          <p className="text-slate-300 text-sm mb-8 leading-relaxed">
            Government programme management dashboard for tracking strategy, KPIs, projects, and milestones.
          </p>

          <div className="space-y-3">
            <a href={loginUrl} className="block">
              <Button className="w-full h-11 text-sm font-semibold" size="lg">
                Sign In
              </Button>
            </a>
            <a href={signupUrl} className="block">
              <Button variant="outline" className="w-full h-11 text-sm font-semibold border-white/20 text-white hover:bg-white/10 hover:text-white" size="lg">
                Create Account
              </Button>
            </a>
          </div>

          <p className="text-slate-500 text-xs mt-6">
            New users are assigned viewer access by default.
            <br />Contact your admin to request elevated permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
