import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useListSpmoPillars,
  useListSpmoInitiatives,
  useListSpmoProjects,
  useGetSpmoConfig,
  useUpdateSpmoConfig,
  useGetSpmoOverview,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass } from "@/components/modal";
import { Loader2, Network, Cpu, Settings, Users, Leaf, Pencil, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PILLAR_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Cpu, Settings, Users, Leaf, Network, Zap,
};

function PillarIcon({ name, className, color }: { name: string; className?: string; color?: string }) {
  const Icon = PILLAR_ICONS[name] ?? Network;
  return <Icon className={className} style={color ? { color } : undefined} />;
}

export default function StrategyMap() {
  const [, navigate] = useLocation();
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
      { data: { vision: visionText, mission: missionText, projectAtRiskThreshold: atRiskThreshold, projectDelayedThreshold: delayedThreshold, milestoneAtRiskThreshold: msAtRiskThreshold } },
      {
        onSuccess: () => { toast({ title: "Vision & Mission updated" }); setEditModalOpen(false); },
        onError: () => toast({ variant: "destructive", title: "Failed to save" }),
      }
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const allPillars = pillarsData?.pillars ?? [];
  const initiatives = initiativesData?.initiatives ?? [];
  const projects = projectsData?.projects ?? [];

  const strategicPillars = allPillars.filter((p) => (p.pillarType ?? "pillar") === "pillar");
  const enablers = allPillars.filter((p) => p.pillarType === "enabler");

  const initiativeCodeMap = new Map(initiatives.map((ini, idx) => [ini.id, ini.initiativeCode ?? String(idx + 1).padStart(2, "0")]));

  const programmePct = overviewData?.programmeProgress
    ?? (allPillars.length > 0 ? Math.round(allPillars.reduce((s, p) => s + (p.progress ?? 0), 0) / allPillars.length) : 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Strategy House"
        description="National Transformation Programme — Vision, Pillars & Enablers"
      >
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{Math.round(programmePct)}%</div>
            <div className="text-xs text-muted-foreground">Programme Progress</div>
          </div>
          <button
            onClick={openEditVision}
            className="flex items-center gap-2 bg-secondary text-foreground px-4 py-2 rounded-lg font-semibold hover:bg-secondary/70 transition-colors border border-border"
          >
            <Pencil className="w-4 h-4" /> Edit Vision
          </button>
        </div>
      </PageHeader>

      {allPillars.length === 0 ? (
        <div className="rounded-2xl border border-border p-16 text-center text-muted-foreground bg-card">
          <Network className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No pillars found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden shadow-xl bg-card">

          {/* ══════════════════════════════════════════════
              ROOF: Triangle pointing up + Vision & Mission
          ══════════════════════════════════════════════ */}

          {/* Triangular roof peak — clip-path creates the "hut" silhouette */}
          <div
            className="bg-gradient-to-r from-primary to-violet-700 w-full"
            style={{ height: "72px", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
          />

          {/* Vision & Mission — seamlessly continues from the roof peak */}
          <div className="bg-gradient-to-r from-primary to-violet-700 text-white px-8 py-6 text-center -mt-px border-b-2 border-white/10">
            <div className="max-w-3xl mx-auto">
              <div className="text-[9px] font-bold uppercase tracking-[0.45em] text-white/40 mb-2">{configData?.programmeName ?? "Strategy House"}</div>
              {configData?.vision ? (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 mb-1">Vision</div>
                  <p className="text-xl font-bold text-white leading-snug">{configData.vision}</p>
                </>
              ) : (
                <p className="text-sm text-white/40 italic">No vision statement — click Edit Vision to add one.</p>
              )}
              {configData?.mission && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50 mb-1">Mission</div>
                  <p className="text-base text-white/85 leading-snug">{configData.mission}</p>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              PILLARS: Vertical columns side-by-side
          ══════════════════════════════════════════════ */}
          <div>
            {/* Section label */}
            <div className="flex items-center gap-2 px-5 py-2 bg-secondary/30 border-b border-border">
              <div className="w-1.5 h-4 rounded-full bg-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                Strategic Pillars
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">{strategicPillars.length} pillars · {initiatives.filter(i => strategicPillars.some(p => p.id === i.pillarId)).length} initiatives</span>
            </div>

            {/* Pillar columns */}
            <div
              className="grid divide-x divide-border"
              style={{ gridTemplateColumns: `repeat(${strategicPillars.length || 1}, 1fr)` }}
            >
              {strategicPillars.map((pillar) => {
                const pillarInits = initiatives.filter((i) => i.pillarId === pillar.id);
                const pct = Math.round(pillar.progress ?? 0);

                return (
                  <div key={pillar.id} className="flex flex-col">
                    {/* Pillar header */}
                    <div
                      className="px-4 py-4 text-center border-b border-border bg-card"
                      style={{ borderTop: `4px solid ${pillar.color}` }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2"
                        style={{ backgroundColor: `${pillar.color}18` }}
                      >
                        <PillarIcon name={pillar.iconName ?? ""} className="w-4 h-4" color={pillar.color} />
                      </div>
                      <h4 className="text-xs font-bold leading-tight cursor-pointer hover:underline" style={{ color: pillar.color }} onClick={() => navigate(`/pillars/${pillar.id}/portfolio`)}>{pillar.name}</h4>
                      <div className="text-2xl font-bold mt-1.5" style={{ color: pillar.color }}>{pct}%</div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2 mx-1">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pillar.color }} />
                      </div>
                    </div>

                    {/* Initiatives */}
                    <div className="flex-1 divide-y divide-border/30 bg-secondary/5">
                      {pillarInits.length === 0 ? (
                        <div className="px-4 py-5 text-center text-xs text-muted-foreground italic">No initiatives</div>
                      ) : (
                        pillarInits.map((initiative, idx) => {
                          const projCount = projects.filter((p) => p.initiativeId === initiative.id).length;
                          const ipct = Math.round(initiative.progress ?? 0);
                          const code = initiativeCodeMap.get(initiative.id) ?? String(idx + 1).padStart(2, "0");
                          return (
                            <div key={initiative.id} className="px-3 py-2.5">
                              <div className="flex items-start gap-1.5">
                                <span
                                  className="mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 text-white leading-none"
                                  style={{ backgroundColor: pillar.color }}
                                >
                                  {code}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold leading-tight line-clamp-2 text-foreground cursor-pointer hover:text-primary hover:underline" onClick={() => navigate(`/projects?initiative=${initiative.id}`)}>{initiative.name}</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <div className="h-1 flex-1 bg-secondary rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ipct)}%`, backgroundColor: pillar.color }} />
                                    </div>
                                    <span className="text-[10px] font-bold shrink-0" style={{ color: pillar.color }}>{ipct}%</span>
                                  </div>
                                  {projCount > 0 && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{projCount} project{projCount !== 1 ? "s" : ""}</p>
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
          </div>

          {/* ══════════════════════════════════════════════
              ENABLERS: Full-width horizontal tiles at the base
              (holding the pillars like a foundation)
          ══════════════════════════════════════════════ */}
          {enablers.length > 0 && (
            <div className="border-t-4 border-border">
              {/* Section label */}
              <div className="flex items-center gap-2 px-5 py-2 bg-secondary/30 border-b border-border">
                <div className="w-1.5 h-4 rounded-full bg-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
                  Cross-Cutting Enablers
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">{enablers.length} enablers · {initiatives.filter(i => enablers.some(e => e.id === i.pillarId)).length} initiatives</span>
              </div>

              {/* Enabler rows — horizontal tiles spanning full width */}
              <div className="divide-y divide-border">
                {enablers.map((enabler) => {
                  const enablerInits = initiatives.filter((i) => i.pillarId === enabler.id);
                  const epct = Math.round(enabler.progress ?? 0);
                  return (
                    <div
                      key={enabler.id}
                      className="flex items-center gap-4 px-5 py-3 bg-card hover:bg-secondary/10 transition-colors"
                      style={{ borderLeft: `5px solid ${enabler.color}` }}
                    >
                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${enabler.color}18` }}
                      >
                        <PillarIcon name={enabler.iconName ?? ""} className="w-4 h-4" color={enabler.color} />
                      </div>

                      {/* Name + progress */}
                      <div className="w-48 shrink-0">
                        <div className="text-xs font-bold leading-tight" style={{ color: enabler.color }}>{enabler.name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, epct)}%`, backgroundColor: enabler.color }} />
                          </div>
                          <span className="text-[10px] font-bold shrink-0" style={{ color: enabler.color }}>{epct}%</span>
                        </div>
                      </div>

                      {/* Initiatives as pills — spans the rest of the row */}
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {enablerInits.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">No initiatives linked</span>
                        ) : (
                          enablerInits.map((initiative) => {
                            const ipct = Math.round(initiative.progress ?? 0);
                            const code = initiativeCodeMap.get(initiative.id);
                            const projCount = projects.filter((p) => p.initiativeId === initiative.id).length;
                            return (
                              <div
                                key={initiative.id}
                                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border border-border bg-secondary/50 text-foreground/80"
                              >
                                {code && (
                                  <span className="font-bold text-[9px] px-1 py-0.5 rounded text-white leading-none" style={{ backgroundColor: enabler.color }}>{code}</span>
                                )}
                                <span className="font-medium max-w-[110px] truncate">{initiative.name}</span>
                                <span className="font-bold" style={{ color: enabler.color }}>{ipct}%</span>
                                {projCount > 0 && <span className="text-muted-foreground">· {projCount}p</span>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              FOUNDATION: Stats bar at the base
          ══════════════════════════════════════════════ */}
          <div className="border-t-2 border-border bg-secondary/40 px-6 py-3 flex items-center justify-center gap-8 flex-wrap">
            <div className="text-center">
              <div className="text-base font-bold text-foreground">{strategicPillars.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pillars</div>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="text-center">
              <div className="text-base font-bold text-foreground">{enablers.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Enablers</div>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="text-center">
              <div className="text-base font-bold text-foreground">{initiatives.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Initiatives</div>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="text-center">
              <div className="text-base font-bold text-foreground">{projects.filter((p) => p.status === "active").length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Active Projects</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vision Modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Vision, Mission & Health Thresholds">
        <form onSubmit={handleSaveVision} className="space-y-4">
          <FormField label="Programme Vision">
            <textarea className={inputClass} rows={3} value={visionText} onChange={(e) => setVisionText(e.target.value)} placeholder="The long-term vision of the national transformation..." />
          </FormField>
          <FormField label="Programme Mission">
            <textarea className={inputClass} rows={3} value={missionText} onChange={(e) => setMissionText(e.target.value)} placeholder="Our mission is to..." />
          </FormField>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Health Status Thresholds (%)</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Project At Risk">
                <input type="number" min={1} max={50} className={inputClass} value={atRiskThreshold} onChange={(e) => setAtRiskThreshold(Number(e.target.value))} />
              </FormField>
              <FormField label="Project Delayed">
                <input type="number" min={1} max={50} className={inputClass} value={delayedThreshold} onChange={(e) => setDelayedThreshold(Number(e.target.value))} />
              </FormField>
              <FormField label="Milestone At Risk">
                <input type="number" min={1} max={50} className={inputClass} value={msAtRiskThreshold} onChange={(e) => setMsAtRiskThreshold(Number(e.target.value))} />
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A project/milestone is <span className="text-warning font-semibold">At Risk</span> when actual progress lags planned by more than the At Risk % threshold.
            </p>
          </div>
          <FormActions loading={updateConfig.isPending} label="Save Changes" onCancel={() => setEditModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
