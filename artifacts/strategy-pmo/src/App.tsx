import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AuthGuard } from "@/components/auth-guard";

// Pages
import Dashboard from "@/pages/dashboard";
import Pillars from "@/pages/pillars";
import Initiatives from "@/pages/initiatives";
import Projects from "@/pages/projects";
import ProgressProof from "@/pages/progress-proof";
import KPIs from "@/pages/kpis";
import Risks from "@/pages/risks";
import Budget from "@/pages/budget";
import Alerts from "@/pages/alerts";
import ActivityLog from "@/pages/activity";

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
          <Route path="/pillars" component={Pillars} />
          <Route path="/initiatives" component={Initiatives} />
          <Route path="/projects" component={Projects} />
          <Route path="/progress" component={ProgressProof} />
          <Route path="/kpis" component={KPIs} />
          <Route path="/risks" component={Risks} />
          <Route path="/budget" component={Budget} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/activity" component={ActivityLog} />
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
