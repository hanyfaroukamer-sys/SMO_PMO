import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AuthGuard } from "@/components/auth-guard";

// Pages
import Dashboard from "@/pages/dashboard";
import StrategyMap from "@/pages/strategy-map";
import Projects from "@/pages/projects";
import ProgressProof from "@/pages/progress-proof";
import KPIs from "@/pages/kpis";
import OpKPIs from "@/pages/op-kpis";
import Budget from "@/pages/budget";
import Procurement from "@/pages/procurement";
import Departments from "@/pages/departments";
import DepartmentPortfolio from "@/pages/department-portfolio";
import PillarPortfolio from "@/pages/pillar-portfolio";
import Risks from "@/pages/risks";
import Alerts from "@/pages/alerts";
import ActivityLog from "@/pages/activity";
import Admin from "@/pages/admin";
import Pillars from "@/pages/pillars";
import Initiatives from "@/pages/initiatives";
import ImportPage from "@/pages/import";
import Dependencies from "@/pages/dependencies";
import ProjectDetail from "@/pages/project-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

function Router() {
  return (
    <AuthGuard>
      <Layout>
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
          <Route path="/budget" component={Budget} />
          <Route path="/procurement" component={Procurement} />
          <Route path="/departments" component={Departments} />
          <Route path="/departments/:id/portfolio" component={DepartmentPortfolio} />
          <Route path="/pillars/:id/portfolio" component={PillarPortfolio} />
          <Route path="/risks" component={Risks} />
          <Route path="/dependencies" component={Dependencies} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/activity" component={ActivityLog} />
          <Route path="/import" component={ImportPage} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
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
