import React, { useState } from "react";
import {
  useListSpmoPillars,
  useListSpmoInitiatives,
  useListSpmoProjects,
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmoOverview,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass } from "@/components/modal";
import { Loader2, Network, ChevronRight, Cpu, Settings, Users, Leaf, Pencil } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

function calcPlannedProgress(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const total = Math.max(end.getTime() - start.getTime(), 1);
  const elapsed = today.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

const PILLAR_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Cpu, Settings, Users, Leaf, Network,
};

function PillarIcon({ name, className, color }: { name: string; className?: string; color?: string }) {
  const Icon = PILLAR_ICONS[name] ?? Network;
  return <Icon className={className} style={color ? { color } : undefined} />;
}

export default function StrategyMap() {
  const { data: pillarsData, isLoading: pillarsLoading } = useListSpmoPillars();
  const { data: initiativesData, isLoading: initLoading } = useListSpmoInitiatives();
  const { data: projectsData, isLoading: projLoading } = useListSpmoProjects();
  const { data: configData } = useGetSpmoConfig();
  const { data: overviewData } = useGetSpmoOverview();
  const { toast } = useToast();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [visionText, setVisionText] = useState("");
  const [missionText, setMissionText] = useState("");
  const [atRiskThreshold, setAtRiskThreshold] = useState(5);
  const [delayedThreshold, setDelayedThreshold] = useState(10);
  const [msAtRiskThreshold, setMsAtRiskThreshold] = useState(5);

  const updateConfig = useUpdateSpmoConfig();

  const isLoading = pillarsLoading || initLoading || projLoading;

  function openEditVision() {
    setVisionText(configData?.vision ?? "");
    setMissionText(configData?.mission ?? "");
    setAtRiskThreshold(configData?.projectAtRiskThreshold ?? 5);
    setDelayedThreshold(configData?.projectDelayedThreshold ?? 10);
    setMsAtRiskThreshold(configData?.milestoneAtRiskThreshold ?? 5);
    setEditModalOpen(true);
  }

  function handleSaveVision(e: React.FormEvent) {
    e.preventDefault();
    updateConfig.mutate(
      {
        data: {
          vision: visionText,
          mission: missionText,
          projectAtRiskThreshold: atRiskThreshold,
          projectDelayedThreshold: delayedThreshold,
          milestoneAtRiskThreshold: msAtRiskThreshold,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Vision & Mission updated" });
          setEditModalOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "Failed to save" }),
      }
    );
  }

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

  const initiativeIndexMap = new Map(initiatives.map((ini, idx) => [ini.id, idx + 1]));

  const programmePct = overviewData?.programmeProgress
    ?? (pillars.length > 0
      ? Math.round(pillars.reduce((s, p) => s + (p.progress ?? 0), 0) / pillars.length)
      : 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Strategy House"
        description="National Transformation Programme — Pillars, Initiatives, and Projects"
      >
        <button
          onClick={openEditVision}
          className="flex items-center gap-2 bg-secondary text-foreground px-4 py-2 rounded-lg font-semibold hover:bg-secondary/70 transition-colors border border-border"
        >
          <Pencil className="w-4 h-4" /> Edit Vision
        </button>
      </PageHeader>

      {/* Strategy Header Banner */}
      <Card className="bg-gradient-to-br from-primary via-primary/90 to-violet-700 text-white border-0 shadow-lg shadow-primary/20">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-[0.2em] mb-2 text-white/60">National Transformation Programme</div>
            <div className="text-6xl font-display font-bold mb-4">{Math.round(programmePct)}%</div>
            {configData?.vision && (
              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1">Vision</div>
                <p className="text-sm leading-relaxed text-white/90">{configData.vision}</p>
              </div>
            )}
            {configData?.mission && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1">Mission</div>
                <p className="text-sm leading-relaxed text-white/80">{configData.mission}</p>
              </div>
            )}
          </div>
          <div className="flex gap-8 shrink-0">
            <div className="text-center">
              <div className="text-3xl font-display font-bold">{pillars.length}</div>
              <div className="text-xs text-white/60 uppercase tracking-wider font-medium mt-1">Pillars</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-display font-bold">{initiatives.length}</div>
              <div className="text-xs text-white/60 uppercase tracking-wider font-medium mt-1">Initiatives</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-display font-bold">{projects.filter((p) => p.status === "active").length}</div>
              <div className="text-xs text-white/60 uppercase tracking-wider font-medium mt-1">Active</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4-pillar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pillars.map((pillar) => {
          const pillarInitiatives = initiatives.filter((i) => i.pillarId === pillar.id);

          return (
            <div
              key={pillar.id}
              className="rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Coloured top stripe */}
              <div className="h-1.5" style={{ backgroundColor: pillar.color }} />

              {/* Pillar Header */}
              <div className="px-6 py-5 bg-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${pillar.color}20` }}
                    >
                      <PillarIcon name={pillar.iconName} className="w-5 h-5" color={pillar.color} />
                    </div>
                    <div>
                      <h3 className="text-lg font-display font-bold" style={{ color: pillar.color }}>{pillar.name}</h3>
                      {pillar.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{pillar.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-display font-bold" style={{ color: pillar.color }}>
                      {Math.round(pillar.progress)}%
                    </div>
                    <div className="text-xs text-muted-foreground">actual progress</div>
                  </div>
                </div>

                <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, pillar.progress)}%`, backgroundColor: pillar.color }}
                  />
                </div>

              </div>

              {/* Initiatives List */}
              <div className="bg-secondary/20 divide-y divide-border/50 border-t border-border">
                {pillarInitiatives.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-muted-foreground italic">No initiatives yet.</div>
                ) : (
                  pillarInitiatives.map((initiative, idx) => {
                    const initiativeProjects = projects.filter((p) => p.initiativeId === initiative.id);
                    const planned = calcPlannedProgress(initiative.startDate, initiative.targetDate);
                    return (
                      <div key={initiative.id} className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 border border-border bg-background"
                          >
                            {idx + 1}
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm truncate">Initiative {String(initiativeIndexMap.get(initiative.id) ?? 0).padStart(2, "0")}: {initiative.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {planned > 0 && (
                                  <span className="text-xs text-muted-foreground">Plan {planned}%</span>
                                )}
                                <span className="text-xs font-bold" style={{ color: pillar.color }}>
                                  {Math.round(initiative.progress ?? 0)}%
                                </span>
                              </div>
                            </div>
                            <div className="h-1 bg-secondary rounded-full overflow-hidden mt-1.5">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, initiative.progress ?? 0)}%`,
                                  backgroundColor: pillar.color,
                                }}
                              />
                            </div>
                            {initiativeProjects.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {initiativeProjects.length} project{initiativeProjects.length !== 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </div>
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
        </Card>
      )}

      {/* Edit Vision Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Vision, Mission & Health Thresholds">
        <form onSubmit={handleSaveVision} className="space-y-4">
          <FormField label="Programme Vision">
            <textarea
              className={inputClass}
              rows={3}
              value={visionText}
              onChange={(e) => setVisionText(e.target.value)}
              placeholder="The long-term vision of the national transformation..."
            />
          </FormField>
          <FormField label="Programme Mission">
            <textarea
              className={inputClass}
              rows={3}
              value={missionText}
              onChange={(e) => setMissionText(e.target.value)}
              placeholder="Our mission is to..."
            />
          </FormField>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Health Status Thresholds (%)</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Project At Risk">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={inputClass}
                  value={atRiskThreshold}
                  onChange={(e) => setAtRiskThreshold(Number(e.target.value))}
                />
              </FormField>
              <FormField label="Project Delayed">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={inputClass}
                  value={delayedThreshold}
                  onChange={(e) => setDelayedThreshold(Number(e.target.value))}
                />
              </FormField>
              <FormField label="Milestone At Risk">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={inputClass}
                  value={msAtRiskThreshold}
                  onChange={(e) => setMsAtRiskThreshold(Number(e.target.value))}
                />
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A project/milestone is <span className="text-warning font-semibold">At Risk</span> when actual progress lags planned by more than the At Risk % threshold, and <span className="text-destructive font-semibold">Delayed</span> when it exceeds the Delayed % threshold.
            </p>
          </div>
          <FormActions loading={updateConfig.isPending} label="Save Changes" onCancel={() => setEditModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
