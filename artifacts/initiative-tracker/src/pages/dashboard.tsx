import { useState } from "react";
import { Link } from "wouter";
import { useListInitiatives, useCreateInitiative } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Target, Plus, Calendar, Activity, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const statusColors: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  active: "default",
  completed: "success",
  on_hold: "warning",
  cancelled: "destructive",
};

export default function Dashboard() {
  const { data: listData, isLoading } = useListInitiatives();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const initiatives = listData?.initiatives || [];
  const filtered = initiatives.filter(i => 
    i.title.toLowerCase().includes(search.toLowerCase()) || 
    i.description?.toLowerCase().includes(search.toLowerCase())
  );

  const canCreate = user?.role === "admin" || user?.role === "project-manager";

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of all strategic initiatives.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input 
            placeholder="Search initiatives..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {canCreate && (
            <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              New Initiative
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card h-64 rounded-2xl animate-pulse bg-slate-200/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 glass-card rounded-3xl border-dashed">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No initiatives found</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            {search ? "Try adjusting your search criteria." : "Get started by creating your first strategic initiative."}
          </p>
          {canCreate && !search && (
            <Button onClick={() => setIsCreateOpen(true)} className="mt-6">
              Create Initiative
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((init) => (
            <Link key={init.id} href={`/initiatives/${init.id}`}>
              <div className="glass-card p-6 rounded-2xl h-full flex flex-col cursor-pointer group">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant={statusColors[init.status] || "default"} className="capitalize">
                    {init.status.replace("_", " ")}
                  </Badge>
                  {init.priority && (
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {init.priority} Priority
                    </span>
                  )}
                </div>
                
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {init.title}
                </h3>
                <p className="text-sm text-slate-500 line-clamp-2 mb-6 flex-1">
                  {init.description || "No description provided."}
                </p>
                
                <div className="space-y-4 mt-auto">
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <span>{init.milestoneCount} milestones</span>
                    </div>
                    {init.targetDate && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{format(new Date(init.targetDate), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium text-slate-700">Progress</span>
                      <span className="font-bold text-primary">{init.progress}%</span>
                    </div>
                    <Progress value={init.progress} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateInitiativeDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

function CreateInitiativeDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const createMutation = useCreateInitiative();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "draft" as any,
    priority: "medium" as any,
    targetDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        data: {
          ...formData,
          targetDate: formData.targetDate || undefined,
        }
      });
      toast.success("Initiative created successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
      onOpenChange(false);
      setFormData({ title: "", description: "", status: "draft", priority: "medium", targetDate: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to create initiative");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create New Initiative" description="Define a new strategic goal for your team.">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Title</label>
          <Input 
            required 
            value={formData.title} 
            onChange={e => setFormData({...formData, title: e.target.value})} 
            placeholder="e.g. Q3 Cloud Migration"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Description</label>
          <textarea 
            className="flex min-h-[100px] w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            value={formData.description} 
            onChange={e => setFormData({...formData, description: e.target.value})} 
            placeholder="What is the goal of this initiative?"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Priority</label>
            <select 
              className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              value={formData.priority}
              onChange={e => setFormData({...formData, priority: e.target.value as any})}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Target Date</label>
            <Input 
              type="date" 
              value={formData.targetDate} 
              onChange={e => setFormData({...formData, targetDate: e.target.value})} 
            />
          </div>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Initiative"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
