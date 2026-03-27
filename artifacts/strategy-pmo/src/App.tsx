import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthGuard } from "@/components/auth-guard";
import { ErrorBoundary } from "@/components/error-boundary";
import { Spinner } from "@/components/ui/spinner";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";

// Pages (lazy-loaded)
const Dashboard = lazy(() => import("@/pages/dashboard"));
const StrategyMap = lazy(() => import("@/pages/strategy-map"));
const Projects = lazy(() => import("@/pages/projects"));
const ProgressProof = lazy(() => import("@/pages/progress-proof"));
const KPIs = lazy(() => import("@/pages/kpis"));
const OpKPIs = lazy(() => import("@/pages/op-kpis"));
const Budget = lazy(() => import("@/pages/budget"));
const Procurement = lazy(() => import("@/pages/procurement"));
const Departments = lazy(() => import("@/pages/departments"));
const DepartmentPortfolio = lazy(() => import("@/pages/department-portfolio"));
const PillarPortfolio = lazy(() => import("@/pages/pillar-portfolio"));
const Risks = lazy(() => import("@/pages/risks"));
const Alerts = lazy(() => import("@/pages/alerts"));
const ActivityLog = lazy(() => import("@/pages/activity"));
const Admin = lazy(() => import("@/pages/admin"));
const Pillars = lazy(() => import("@/pages/pillars"));
const Initiatives = lazy(() => import("@/pages/initiatives"));
const ImportPage = lazy(() => import("@/pages/import"));
const Dependencies = lazy(() => import("@/pages/dependencies"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const Documents = lazy(() => import("@/pages/documents"));
const MyTasks = lazy(() => import("@/pages/my-tasks"));
const MyProjects = lazy(() => import("@/pages/my-projects"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data } = useGetCurrentAuthUser();
  if (data?.user?.role !== "admin") {
    return <div className="p-8 text-center text-muted-foreground">Admin access required</div>;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <AuthGuard>
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/strategy-map" component={StrategyMap} />
              <Route path="/pillars" component={Pillars} />
              <Route path="/initiatives" component={Initiatives} />
              <Route path="/projects" component={Projects} />
              <Route path="/projects/:id" component={ProjectDetail} />
              <Route path="/progress" component={ProgressProof} />
              <Route path="/kpis" component={KPIs} />
              <Route path="/op-kpis" component={OpKPIs} />
              <Route path="/budget">{() => <AdminGuard><Budget /></AdminGuard>}</Route>
              <Route path="/procurement">{() => <AdminGuard><Procurement /></AdminGuard>}</Route>
              <Route path="/departments" component={Departments} />
              <Route path="/departments/:id/portfolio" component={DepartmentPortfolio} />
              <Route path="/pillars/:id/portfolio" component={PillarPortfolio} />
              <Route path="/risks" component={Risks} />
              <Route path="/dependencies" component={Dependencies} />
              <Route path="/alerts">{() => <AdminGuard><Alerts /></AdminGuard>}</Route>
              <Route path="/activity">{() => <AdminGuard><ActivityLog /></AdminGuard>}</Route>
              <Route path="/import">{() => <AdminGuard><ImportPage /></AdminGuard>}</Route>
              <Route path="/documents" component={Documents} />
              <Route path="/my-tasks" component={MyTasks} />
              <Route path="/my-projects" component={MyProjects} />
              <Route path="/admin">{() => <AdminGuard><Admin /></AdminGuard>}</Route>
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </AuthGuard>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
