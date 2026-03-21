import { useLocation } from "wouter";
import {
  useGetSpmaDepartmentPortfolio,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar, StatusBadge } from "@/components/ui-elements";
import { Loader2, ArrowLeft, Building2, FolderOpen, TrendingUp, Target } from "lucide-react";

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

type Props = {
  params: { id: string };
};

export default function DepartmentPortfolio({ params }: Props) {
  const deptId = parseInt(params?.id ?? "0");
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useGetSpmaDepartmentPortfolio(deptId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64 p-6">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Card className="text-center py-12 text-slate-500">Department not found.</Card>
      </div>
    );
  }

  const { department, projects } = data;
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalSpent = projects.reduce((s, p) => s + (p.budgetSpent ?? 0), 0);
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/departments")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <PageHeader
          title={department.name}
          description="Department project portfolio"
        />
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <FolderOpen className="w-4 h-4" />
            <span>Projects</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{projects.length}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Avg Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{avgProgress}%</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Target className="w-4 h-4" />
            <span>Total Budget</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtCurrency(totalBudget)}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Building2 className="w-4 h-4" />
            <span>Spent</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtCurrency(totalSpent)}</p>
          {totalBudget > 0 && (
            <p className="text-xs text-slate-400">{Math.round((totalSpent / totalBudget) * 100)}% of budget</p>
          )}
        </Card>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 font-medium">No projects assigned to this department</p>
          <p className="text-slate-400 text-sm mt-1">
            Go to Projects and assign a department to include them here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const budgetUsedPct = project.budget > 0
              ? Math.min(100, Math.round((project.budgetSpent / project.budget) * 100))
              : 0;

            return (
              <Card key={project.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800">{project.name}</h3>
                      <StatusBadge status={project.status} />
                    </div>
                    {(project.initiativeName || project.pillarName) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {project.pillarName && <span>{project.pillarName}</span>}
                        {project.pillarName && project.initiativeName && <span className="mx-1">›</span>}
                        {project.initiativeName && <span>{project.initiativeName}</span>}
                      </p>
                    )}
                    {project.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-800">{project.progress}%</p>
                    <p className="text-xs text-slate-400">complete</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Progress</span>
                    <span>{project.approvedMilestones ?? 0} / {project.milestoneCount ?? 0} milestones</span>
                  </div>
                  <ProgressBar progress={project.progress} />
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500 border-t border-slate-100 pt-2">
                  <span>Budget: {fmtCurrency(project.budget)}</span>
                  <span>Spent: {fmtCurrency(project.budgetSpent)} ({budgetUsedPct}%)</span>
                  {project.ownerName && <span className="hidden sm:block">Owner: {project.ownerName}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
