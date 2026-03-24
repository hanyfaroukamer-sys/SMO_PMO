import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Upload, FileText, X, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp, Plus, Trash2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/use-is-admin";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ImportMode = "new" | "merge" | "replace";

interface ImportPillar {
  name: string;
  color: string;
  description: string;
  matchAction: string;
  matchId: number | null;
}

interface ImportInitiative {
  name: string;
  pillar: string;
  owner: string;
  description: string;
  budgetAllocated: number | null;
  startDate: string | null;
  endDate: string | null;
  matchAction: string;
  matchId: number | null;
}

interface ImportProject {
  name: string;
  projectCode: string;
  initiative: string;
  owner: string;
  budgetAllocated: number | null;
  budgetSpent: number | null;
  startDate: string | null;
  endDate: string | null;
  milestones: Array<{ name: string; progress: number; effort: number; dueDate: string | null }>;
  matchAction: string;
  matchId: number | null;
}

interface ImportKpi {
  name: string;
  pillar?: string;
  project?: string;
  target: number | null;
  actual: number | null;
  baseline?: number | null;
  unit: string;
  owner?: string;
  matchAction: string;
  matchId: number | null;
}

interface ExtractedData {
  vision: string;
  mission: string;
  pillars: ImportPillar[];
  enablers: string[];
  initiatives: ImportInitiative[];
  projects: ImportProject[];
  strategicKpis: ImportKpi[];
  operationalKpis: ImportKpi[];
  confidence: { overall: number; structureFound: string; notes: string };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const ACCEPTED = ".pdf,.xlsx,.xls,.csv,.docx,.pptx,.ppt";
const COLOR_PALETTE = ["#2563EB", "#7C3AED", "#E8590C", "#0D9488", "#B91C1C", "#CA8A04", "#15803D", "#BE185D"];

function MatchBadge({ action }: { action: string }) {
  if (action === "update") return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">UPDATE</span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">NEW</span>
  );
}

function InlineText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors"
    />
  );
}

function InlineNumber({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
      placeholder={placeholder ?? "—"}
      className="w-full text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors"
    />
  );
}

// ─── STEP 1: UPLOAD ──────────────────────────────────────────────────────────

function UploadStep({
  files, mode, guidance,
  onFilesChange, onModeChange, onGuidanceChange,
  onAnalyse, analysing,
}: {
  files: File[];
  mode: ImportMode;
  guidance: string;
  onFilesChange: (f: File[]) => void;
  onModeChange: (m: ImportMode) => void;
  onGuidanceChange: (v: string) => void;
  onAnalyse: () => void;
  analysing: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const allowed = incoming.filter(f => {
      const n = f.name.toLowerCase();
      return [".pdf", ".xlsx", ".xls", ".csv", ".docx", ".pptx", ".ppt"].some(ext => n.endsWith(ext));
    });
    onFilesChange([...files, ...allowed]);
  }, [files, onFilesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 mx-auto flex items-center justify-center">
          <Upload className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold">Import Strategy Documents</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Upload your strategy deck, programme plan, or KPI tracker. Claude will extract the full programme structure automatically.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPTED} className="hidden"
          onChange={e => addFiles(Array.from(e.target.files ?? []))} />
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium text-sm">Drop files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, Excel, CSV, Word, PowerPoint — up to 50 MB each</p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 border border-border/50">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button onClick={e => { e.stopPropagation(); onFilesChange(files.filter((_, j) => j !== i)); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Guidance Prompt */}
      <div className="space-y-2">
        <div>
          <label className="text-sm font-semibold">Guidance for Claude <span className="font-normal text-muted-foreground">(optional)</span></label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tell Claude where to find key information — e.g. which tab or section has the KPIs, what the column headers mean, or what to focus on.
          </p>
        </div>
        <textarea
          value={guidance}
          onChange={e => onGuidanceChange(e.target.value)}
          placeholder={`Examples:\n• "KPIs are in the 'Indicators' tab, column D is target, column E is actual"\n• "Pillars are the coloured sections on slide 3. Ignore the appendix."\n• "Budget figures are in SAR millions. Owner names are in column B."`}
          rows={4}
          className="w-full text-sm rounded-xl border border-border px-3 py-2.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/60 leading-relaxed"
        />
      </div>

      {/* Mode Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Import Mode</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: "new", label: "New Setup", desc: "No existing data. Create everything from scratch.", color: "border-blue-500 bg-blue-50 text-blue-700" },
            { value: "merge", label: "Add to Existing", desc: "Keep current data and add what's new.", color: "border-amber-500 bg-amber-50 text-amber-700" },
            { value: "replace", label: "Replace All", desc: "Archive everything and rebuild from documents.", color: "border-destructive bg-destructive/5 text-destructive" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => onModeChange(opt.value)}
              className={cn(
                "p-3 rounded-xl border-2 text-left transition-all",
                mode === opt.value ? opt.color : "border-border hover:border-border/80 bg-background"
              )}
            >
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>
        {mode === "replace" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span><strong>Warning:</strong> This will permanently archive all existing programme data and rebuild from the uploaded documents. This cannot be undone.</span>
          </div>
        )}
      </div>

      {/* Analyse Button */}
      <button
        onClick={onAnalyse}
        disabled={files.length === 0 || analysing}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {analysing ? <><Loader2 className="w-4 h-4 animate-spin" />Analysing documents…</> : <><Upload className="w-4 h-4" />Upload & Analyse</>}
      </button>
    </div>
  );
}

// ─── STEP 2: REVIEW ──────────────────────────────────────────────────────────

type Tab = "overview" | "pillars" | "initiatives" | "projects" | "strategic-kpis" | "op-kpis";

function ReviewStep({
  data, mode, onDataChange, onConfirm, onBack, saving,
}: {
  data: ExtractedData;
  mode: ImportMode;
  onDataChange: (d: ExtractedData) => void;
  onConfirm: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const update = (partial: Partial<ExtractedData>) => onDataChange({ ...data, ...partial });

  const pillarNames = data.pillars.map(p => p.name).filter(Boolean);
  const initiativeNames = data.initiatives.map(i => i.name).filter(Boolean);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "overview", label: "Overview", count: 0 },
    { id: "pillars", label: "Pillars", count: data.pillars.length },
    { id: "initiatives", label: "Initiatives", count: data.initiatives.length },
    { id: "projects", label: "Projects", count: data.projects.length },
    { id: "strategic-kpis", label: "Strategic KPIs", count: data.strategicKpis.length },
    { id: "op-kpis", label: "Operational KPIs", count: data.operationalKpis.length },
  ];

  return (
    <div className="space-y-4">
      {/* Confidence banner */}
      <div className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border text-sm",
        data.confidence.overall >= 70 ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
        data.confidence.overall >= 40 ? "bg-amber-50 border-amber-200 text-amber-800" :
        "bg-orange-50 border-orange-200 text-orange-800"
      )}>
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Confidence: {data.confidence.overall}%</span>
          {data.confidence.structureFound && <span className="ml-2 opacity-80">— {data.confidence.structureFound}</span>}
          {data.confidence.notes && <div className="mt-0.5 opacity-70 text-xs">{data.confidence.notes}</div>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto pb-px">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}{t.count > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {tab === "overview" && (
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vision</label>
              <textarea
                value={data.vision}
                onChange={e => update({ vision: e.target.value })}
                placeholder="Organisation vision statement"
                rows={2}
                className="mt-1 w-full text-sm rounded-lg border border-border px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mission</label>
              <textarea
                value={data.mission}
                onChange={e => update({ mission: e.target.value })}
                placeholder="Organisation mission statement"
                rows={2}
                className="mt-1 w-full text-sm rounded-lg border border-border px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            {data.enablers.filter(Boolean).length > 0 && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Enablers</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {data.enablers.filter(Boolean).map((e, i) => (
                    <span key={i} className="px-2 py-1 text-xs rounded-full bg-muted border border-border">{e}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "pillars" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto_auto] gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-20">Status</div><div>Name</div><div>Description</div><div>Colour</div><div className="w-8" /><div className="w-8" />
            </div>
            {data.pillars.map((p, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto_auto] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/30 border border-border/50">
                <div className="w-20"><MatchBadge action={p.matchAction} /></div>
                <InlineText value={p.name} onChange={v => { const arr = [...data.pillars]; arr[i] = { ...p, name: v }; update({ pillars: arr }); }} placeholder="Pillar name" />
                <InlineText value={p.description} onChange={v => { const arr = [...data.pillars]; arr[i] = { ...p, description: v }; update({ pillars: arr }); }} placeholder="Description" />
                <div className="flex items-center gap-2">
                  <input type="color" value={p.color || "#3B82F6"} onChange={e => { const arr = [...data.pillars]; arr[i] = { ...p, color: e.target.value }; update({ pillars: arr }); }} className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
                  <span className="text-xs text-muted-foreground font-mono">{p.color}</span>
                </div>
                <button onClick={() => { const arr = [...data.pillars]; arr.splice(i, 1); update({ pillars: arr }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                <div className="w-8" />
              </div>
            ))}
            <button onClick={() => update({ pillars: [...data.pillars, { name: "", color: COLOR_PALETTE[data.pillars.length % COLOR_PALETTE.length], description: "", matchAction: "create", matchId: null }] })} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" />Add pillar
            </button>
          </div>
        )}

        {tab === "initiatives" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-20">Status</div><div>Name</div><div>Pillar</div><div>Owner</div><div className="w-8" />
            </div>
            {data.initiatives.map((ini, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/30 border border-border/50">
                <div className="w-20"><MatchBadge action={ini.matchAction} /></div>
                <InlineText value={ini.name} onChange={v => { const arr = [...data.initiatives]; arr[i] = { ...ini, name: v }; update({ initiatives: arr }); }} placeholder="Initiative name" />
                <select value={ini.pillar} onChange={e => { const arr = [...data.initiatives]; arr[i] = { ...ini, pillar: e.target.value }; update({ initiatives: arr }); }}
                  className="text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors">
                  <option value="">— select pillar —</option>
                  {pillarNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <InlineText value={ini.owner} onChange={v => { const arr = [...data.initiatives]; arr[i] = { ...ini, owner: v }; update({ initiatives: arr }); }} placeholder="Owner" />
                <button onClick={() => { const arr = [...data.initiatives]; arr.splice(i, 1); update({ initiatives: arr }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => update({ initiatives: [...data.initiatives, { name: "", pillar: pillarNames[0] || "", owner: "", description: "", budgetAllocated: null, startDate: null, endDate: null, matchAction: "create", matchId: null }] })} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" />Add initiative
            </button>
          </div>
        )}

        {tab === "projects" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_auto_1fr_1fr_1fr_auto] gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-20">Status</div><div>Name</div><div className="w-20">Code</div><div>Initiative</div><div>Owner</div><div>Budget (M)</div><div className="w-8" />
            </div>
            {data.projects.map((proj, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/30 border border-border/50">
                <div className="w-20"><MatchBadge action={proj.matchAction} /></div>
                <InlineText value={proj.name} onChange={v => { const arr = [...data.projects]; arr[i] = { ...proj, name: v }; update({ projects: arr }); }} placeholder="Project name" />
                <div className="w-20">
                  <InlineText value={proj.projectCode ?? ""} onChange={v => { const arr = [...data.projects]; arr[i] = { ...proj, projectCode: v }; update({ projects: arr }); }} placeholder="P01" />
                </div>
                <select value={proj.initiative} onChange={e => { const arr = [...data.projects]; arr[i] = { ...proj, initiative: e.target.value }; update({ projects: arr }); }}
                  className="text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors">
                  <option value="">— select initiative —</option>
                  {initiativeNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <InlineText value={proj.owner} onChange={v => { const arr = [...data.projects]; arr[i] = { ...proj, owner: v }; update({ projects: arr }); }} placeholder="Owner" />
                <InlineNumber value={proj.budgetAllocated} onChange={v => { const arr = [...data.projects]; arr[i] = { ...proj, budgetAllocated: v }; update({ projects: arr }); }} />
                <button onClick={() => { const arr = [...data.projects]; arr.splice(i, 1); update({ projects: arr }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => update({ projects: [...data.projects, { name: "", projectCode: "", initiative: initiativeNames[0] || "", owner: "", budgetAllocated: null, budgetSpent: null, startDate: null, endDate: null, milestones: [], matchAction: "create", matchId: null }] })} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" />Add project
            </button>
          </div>
        )}

        {tab === "strategic-kpis" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-20">Status</div><div>Name</div><div>Pillar</div><div>Target</div><div>Actual</div><div>Unit</div><div className="w-8" />
            </div>
            {data.strategicKpis.map((kpi, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/30 border border-border/50">
                <div className="w-20"><MatchBadge action={kpi.matchAction} /></div>
                <InlineText value={kpi.name} onChange={v => { const arr = [...data.strategicKpis]; arr[i] = { ...kpi, name: v }; update({ strategicKpis: arr }); }} placeholder="KPI name" />
                <select value={kpi.pillar || ""} onChange={e => { const arr = [...data.strategicKpis]; arr[i] = { ...kpi, pillar: e.target.value }; update({ strategicKpis: arr }); }}
                  className="text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors">
                  <option value="">— pillar —</option>
                  {pillarNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <InlineNumber value={kpi.target} onChange={v => { const arr = [...data.strategicKpis]; arr[i] = { ...kpi, target: v }; update({ strategicKpis: arr }); }} />
                <InlineNumber value={kpi.actual} onChange={v => { const arr = [...data.strategicKpis]; arr[i] = { ...kpi, actual: v }; update({ strategicKpis: arr }); }} />
                <InlineText value={kpi.unit} onChange={v => { const arr = [...data.strategicKpis]; arr[i] = { ...kpi, unit: v }; update({ strategicKpis: arr }); }} placeholder="%" />
                <button onClick={() => { const arr = [...data.strategicKpis]; arr.splice(i, 1); update({ strategicKpis: arr }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => update({ strategicKpis: [...data.strategicKpis, { name: "", pillar: pillarNames[0] || "", target: null, actual: null, baseline: null, unit: "", owner: "", matchAction: "create", matchId: null }] })} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" />Add KPI
            </button>
          </div>
        )}

        {tab === "op-kpis" && (
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-20">Status</div><div>Name</div><div>Project</div><div>Target</div><div>Actual</div><div>Unit</div><div className="w-8" />
            </div>
            {data.operationalKpis.map((kpi, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/30 border border-border/50">
                <div className="w-20"><MatchBadge action={kpi.matchAction} /></div>
                <InlineText value={kpi.name} onChange={v => { const arr = [...data.operationalKpis]; arr[i] = { ...kpi, name: v }; update({ operationalKpis: arr }); }} placeholder="KPI name" />
                <select value={kpi.project || ""} onChange={e => { const arr = [...data.operationalKpis]; arr[i] = { ...kpi, project: e.target.value }; update({ operationalKpis: arr }); }}
                  className="text-sm bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none py-0.5 transition-colors">
                  <option value="">— project —</option>
                  {data.projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
                <InlineNumber value={kpi.target} onChange={v => { const arr = [...data.operationalKpis]; arr[i] = { ...kpi, target: v }; update({ operationalKpis: arr }); }} />
                <InlineNumber value={kpi.actual} onChange={v => { const arr = [...data.operationalKpis]; arr[i] = { ...kpi, actual: v }; update({ operationalKpis: arr }); }} />
                <InlineText value={kpi.unit} onChange={v => { const arr = [...data.operationalKpis]; arr[i] = { ...kpi, unit: v }; update({ operationalKpis: arr }); }} placeholder="%" />
                <button onClick={() => { const arr = [...data.operationalKpis]; arr.splice(i, 1); update({ operationalKpis: arr }); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => update({ operationalKpis: [...data.operationalKpis, { name: "", project: "", target: null, actual: null, unit: "", matchAction: "create", matchId: null }] })} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" />Add KPI
            </button>
          </div>
        )}
      </div>

      {/* Summary bar + Actions */}
      <div className="border-t border-border pt-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-muted-foreground space-x-3">
          <span><strong>{data.pillars.length}</strong> pillars</span>
          <span><strong>{data.initiatives.length}</strong> initiatives</span>
          <span><strong>{data.projects.length}</strong> projects</span>
          <span><strong>{data.strategicKpis.length}</strong> strategic KPIs</span>
          <span><strong>{data.operationalKpis.length}</strong> op. KPIs</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors">
            ← Re-upload
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <>Confirm & Launch</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<ImportMode>("new");
  const [guidance, setGuidance] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground text-sm">You need admin privileges to import strategies.</p>
      </div>
    );
  }

  async function handleAnalyse() {
    setAnalysing(true);
    try {
      const form = new FormData();
      form.append("mode", mode);
      if (guidance.trim()) form.append("guidance", guidance.trim());
      for (const f of files) form.append("files", f);

      const res = await fetch("/api/spmo/import/analyse", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      const data = await res.json() as ExtractedData;
      data.vision = data.vision || "";
      data.mission = data.mission || "";
      data.pillars = (data.pillars || []).filter(p => p.name);
      data.initiatives = (data.initiatives || []).filter(i => i.name);
      data.projects = (data.projects || []).filter(p => p.name);
      data.strategicKpis = (data.strategicKpis || []).filter(k => k.name);
      data.operationalKpis = (data.operationalKpis || []).filter(k => k.name);
      data.enablers = (data.enablers || []).filter(Boolean);
      setExtracted(data);
      setStep("review");
    } catch (err) {
      toast({ variant: "destructive", title: "Analysis failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setAnalysing(false);
    }
  }

  async function handleConfirm() {
    if (!extracted) return;
    setSaving(true);
    try {
      const res = await fetch("/api/spmo/import/save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, data: extracted }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error || "Save failed");
      }
      qc.invalidateQueries();
      toast({ title: "Import successful!", description: `${extracted.pillars.length} pillars, ${extracted.initiatives.length} initiatives, ${extracted.projects.length} projects created.` });
      navigate("/");
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Progress stepper */}
      <div className="flex items-center gap-2 mb-8">
        {[{ label: "Upload Documents", active: step === "upload", done: step === "review" }, { label: "Review & Edit", active: step === "review", done: false }].map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <div className={cn("h-px flex-1 w-12", s.done || step === "review" ? "bg-primary" : "bg-border")} />}
            <div className={cn("flex items-center gap-2 text-sm font-medium", s.active ? "text-primary" : s.done ? "text-primary" : "text-muted-foreground")}>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", s.active ? "bg-primary text-white" : s.done ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                {s.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className="hidden sm:block">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {step === "upload" ? (
        <UploadStep
          files={files} mode={mode} guidance={guidance}
          onFilesChange={setFiles} onModeChange={setMode} onGuidanceChange={setGuidance}
          onAnalyse={handleAnalyse} analysing={analysing}
        />
      ) : extracted ? (
        <ReviewStep
          data={extracted} mode={mode}
          onDataChange={setExtracted}
          onConfirm={handleConfirm}
          onBack={() => setStep("upload")}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
