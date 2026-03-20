import React from "react";
import { useListSpmoPillars, useListSpmoInitiatives, useListSpmoProjects } from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Loader2, Network, ChevronRight, Cpu, Settings, Users, Leaf } from "lucide-react";

const PILLAR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Cpu, Settings, Users, Leaf,
};

function PillarIcon({ name, className }: { name: string; className?: string }) {
  const Icon = PILLAR_ICONS[name] ?? Network;
  return <Icon className={className} />;
}

export default function StrategyMap() {
  const { data: pillarsData, isLoading: pillarsLoading } = useListSpmoPillars();
  const { data: initiativesData, isLoading: initLoading } = useListSpmoInitiatives();
  const { data: projectsData, isLoading: projLoading } = useListSpmoProjects();

  const isLoading = pillarsLoading || initLoading || projLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pillars = pillarsData?.pillars ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const projects = projectsData?.projects ?? [];

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalInitiatives = initiatives.length;

  const programmePct = pillars.length > 0
    ? Math.round(pillars.reduce((s: number, p: { progress: number }) => s + (p.progress ?? 0), 0) / pillars.length)
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Strategy Map"
        description="Visual hierarchy of the National Transformation Programme — Pillars → Initiatives → Projects"
      />

      {/* Programme Summary Bar */}
      <Card className="bg-gradient-to-r from-primary/10 via-card to-card border-primary/20">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold mb-1">National Transformation Programme</h2>
            <p className="text-sm text-muted-foreground mb-4">Overall programme delivery progress</p>
            <ProgressBar progress={programmePct} />
          </div>
          <div className="flex gap-8 shrink-0">
            <div className="text-center">
              <div className="text-3xl font-display font-bold text-primary">{pillars.length}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mt-1">Pillars</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-display font-bold text-primary">{totalInitiatives}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mt-1">Initiatives</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-display font-bold text-primary">{activeProjects}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mt-1">Active Projects</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-display font-bold text-foreground">{programmePct}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mt-1">Progress</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Hierarchical Map */}
      <div className="space-y-6">
        {pillars.map((pillar: {
          id: number;
          name: string;
          description: string | null;
          color: string;
          iconName: string;
          progress: number;
          initiativeCount: number;
          projectCount: number;
        }) => {
          const pillarInitiatives = initiatives.filter((i: { pillarId: number }) => i.pillarId === pillar.id);
          return (
            <div key={pillar.id} className="rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Pillar Header */}
              <div
                className="px-6 py-4 flex items-center gap-4"
                style={{ backgroundColor: `${pillar.color}18`, borderBottom: `2px solid ${pillar.color}40` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${pillar.color}25` }}
                >
                  <span style={{ color: pillar.color }}><PillarIcon name={pillar.iconName} className="w-5 h-5" /></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-display font-bold" style={{ color: pillar.color }}>{pillar.name}</h3>
                    <span className="text-xs bg-white/60 px-2 py-0.5 rounded font-medium text-muted-foreground border border-border/50">
                      {pillarInitiatives.length} initiative{pillarInitiatives.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {pillar.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{pillar.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-2 bg-black/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, pillar.progress)}%`, backgroundColor: pillar.color }}
                      />
                    </div>
                    <span className="text-sm font-bold" style={{ color: pillar.color }}>
                      {Math.round(pillar.progress)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Initiatives */}
              <div className="bg-card divide-y divide-border/50">
                {pillarInitiatives.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-muted-foreground italic">No initiatives yet.</div>
                ) : (
                  pillarInitiatives.map((initiative, idx: number) => {
                    const initiativeBudget = (initiative as unknown as { budget?: number }).budget ?? 0;
                    const initiativeProjects = projects.filter((p: { initiativeId: number }) => p.initiativeId === initiative.id);
                    return (
                      <div key={initiative.id} className="px-6 py-4">
                        {/* Initiative Row */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0" style={{ borderColor: `${pillar.color}40` }}>
                            {idx + 1}
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">{initiative.name}</span>
                              {initiative.ownerName && (
                                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{initiative.ownerName}</span>
                              )}
                              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded font-mono">
                                SAR {(initiativeBudget / 1_000_000).toFixed(0)}M
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 min-w-[100px] shrink-0">
                            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, initiative.progress ?? 0)}%`, backgroundColor: pillar.color }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground w-8 text-right">
                              {Math.round(initiative.progress ?? 0)}%
                            </span>
                          </div>
                        </div>

                        {/* Projects */}
                        {initiativeProjects.length > 0 && (
                          <div className="ml-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                            {initiativeProjects.map((project: {
                              id: number;
                              name: string;
                              ownerName: string | null;
                              budget: number;
                              progress: number;
                              status: string;
                            }) => (
                              <div
                                key={project.id}
                                className="flex items-center gap-2 bg-secondary/40 hover:bg-secondary/70 rounded-lg px-3 py-2 transition-colors border border-border/30"
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: pillar.color }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-foreground truncate">{project.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {project.ownerName} · SAR {(project.budget / 1_000_000).toFixed(0)}M
                                  </div>
                                </div>
                                <span className="text-xs font-bold shrink-0" style={{ color: pillar.color }}>
                                  {Math.round(project.progress ?? 0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pillars.length === 0 && (
        <Card className="text-center py-16 text-muted-foreground">
          <Network className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No pillars found.</p>
          <p className="text-sm mt-1">Add pillars to see the strategy map.</p>
        </Card>
      )}
    </div>
  );
}
