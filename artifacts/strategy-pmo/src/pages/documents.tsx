import { useState } from "react";
import {
  useListSpmoDocuments,
  useCreateSpmoDocument,
  useDeleteSpmoDocument,
  useListSpmoProjects,
  useGetCurrentAuthUser,
  type SpmoDocument,
} from "@workspace/api-client-react";
import { PageHeader, Card } from "@/components/ui-elements";
import { Loader2, Plus, Trash2, FolderOpen, FileText, Upload, Search, Download } from "lucide-react";
import { exportToXlsx } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

const DOC_CATEGORY_LABELS: Record<string, string> = {
  business_case: "Business Case",
  charter: "Charter",
  plan: "Plan",
  report: "Report",
  template: "Template",
  contract: "Contract",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  business_case: "text-purple-700 bg-purple-50 border-purple-200",
  charter: "text-blue-700 bg-blue-50 border-blue-200",
  plan: "text-green-700 bg-green-50 border-green-200",
  report: "text-amber-700 bg-amber-50 border-amber-200",
  template: "text-cyan-700 bg-cyan-50 border-cyan-200",
  contract: "text-red-700 bg-red-50 border-red-200",
  other: "text-gray-600 bg-gray-50 border-gray-200",
};

type DocForm = {
  title: string;
  category: string;
  description: string;
  tags: string;
  projectId: string;
};

const emptyForm = (): DocForm => ({
  title: "",
  category: "other",
  description: "",
  tags: "",
  projectId: "",
});

export default function Documents() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: authData } = useGetCurrentAuthUser();
  const userRole = authData?.user?.role;
  const canEdit = userRole === "admin" || userRole === "project-manager";

  const { data, isLoading, queryKey } = useListSpmoDocuments();
  const { data: projectsData } = useListSpmoProjects();
  const createDoc = useCreateSpmoDocument();
  const deleteDoc = useDeleteSpmoDocument();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DocForm>(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const allDocs = (data?.documents ?? []) as SpmoDocument[];
  const projects = projectsData?.projects ?? [];

  const filtered = allDocs.filter((doc) => {
    const matchSearch = search === "" ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(search.toLowerCase()) ||
      (doc.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = filterCategory === "all" || doc.category === filterCategory;
    const matchProject = filterProject === "all" || String(doc.projectId) === filterProject;
    return matchSearch && matchCategory && matchProject;
  });

  const handleUpload = async () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (!file) { toast({ title: "Please select a file", variant: "destructive" }); return; }
    const projId = form.projectId ? parseInt(form.projectId) : undefined;
    if (!projId) { toast({ title: "Please select a project", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const objectPath = `documents/${projId}/${Date.now()}_${file.name}`;
      await createDoc.mutateAsync({
        projectId: projId,
        title: form.title,
        category: form.category as SpmoDocument["category"],
        description: form.description || undefined,
        fileName: file.name,
        contentType: file.type,
        objectPath,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      } as SpmoDocument);
      toast({ title: "Document added" });
      qc.invalidateQueries({ queryKey });
      setFile(null);
      setForm(emptyForm());
      setShowForm(false);
    } catch {
      toast({ title: "Failed to save document", variant: "destructive" });
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: number) => {
    await deleteDoc.mutateAsync(id);
    qc.invalidateQueries({ queryKey });
    toast({ title: "Document deleted" });
  };

  const projectName = (id: number | null) =>
    id == null ? "—" : (projects.find((p) => p.id === id)?.name ?? `Project #${id}`);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader title="Documents" description="Programme-wide document library — charters, plans, reports and more.">
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToXlsx(filtered.map((d) => ({
              Title: d.title,
              Category: DOC_CATEGORY_LABELS[d.category],
              Project: projectName(d.projectId),
              "File Name": d.fileName,
              Version: d.version,
              "Uploaded By": d.uploadedByName ?? "",
              "Upload Date": new Date(d.createdAt).toLocaleDateString("en-GB"),
              Tags: (d.tags ?? []).join(", "),
            })), "documents-export")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          {canEdit && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> Add Document
            </button>
          )}
        </div>
      </PageHeader>

      {showForm && (
        <Card className="p-5 space-y-4 border-primary/20">
          <h3 className="font-bold text-base">Add New Document</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Document title"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Project *</label>
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Optional notes…"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Q1, finance"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">File *</label>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-dashed border-border hover:border-primary transition-colors text-muted-foreground hover:text-foreground w-full"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span className="truncate">{file ? file.name : "Choose file…"}</span>
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:-translate-y-0.5 transition-transform disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save
            </button>
            <button onClick={() => { setShowForm(false); setForm(emptyForm()); setFile(null); }} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Categories</option>
          {Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(search || filterCategory !== "all" || filterProject !== "all") && (
          <button onClick={() => { setSearch(""); setFilterCategory("all"); setFilterProject("all"); }} className="text-xs text-muted-foreground hover:text-foreground underline">Clear filters</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {allDocs.length}</span>
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <Card className="text-center py-20">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-bold text-lg">
            {allDocs.length === 0 ? "No documents yet" : "No documents match your filters"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {allDocs.length === 0
              ? "Upload project documents like charters, plans, and reports."
              : "Try adjusting your search or filter criteria."}
          </p>
          {canEdit && allDocs.length === 0 && (
            <button onClick={() => setShowForm(true)} className="mt-4 text-primary hover:underline text-sm font-medium">Add the first document</button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <Card key={doc.id} className="p-4 flex items-center gap-4 card-shadow hover:card-shadow-hover transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-semibold text-sm truncate max-w-xs">{doc.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${CATEGORY_COLORS[doc.category] ?? ""}`}>
                    {DOC_CATEGORY_LABELS[doc.category]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">v{doc.version}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{projectName(doc.projectId)}</span>
                  <span>{doc.fileName}</span>
                  {doc.uploadedByName && <span>By: {doc.uploadedByName}</span>}
                  <span>{new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {doc.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
