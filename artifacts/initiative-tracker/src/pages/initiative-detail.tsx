import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetInitiative, 
  useCreateMilestone, 
  useDeleteInitiative,
  useSubmitMilestone,
  useApproveMilestone,
  useRejectMilestone,
  useAddAttachment,
  useDeleteMilestone,
  type MilestoneWithAttachments,
  type FileAttachment,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Calendar, User, Trash2, FileText, CheckCircle2, XCircle, Clock, Upload, Loader2, PlayCircle, Target } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const statusColors: Record<string, BadgeVariant> = {
  pending: "secondary",
  in_progress: "default",
  submitted: "warning",
  approved: "success",
  rejected: "destructive",
};

export default function InitiativeDetail() {
  const { id } = useParams();
  const initId = parseInt(id || "0");
  const { data: initiative, isLoading } = useGetInitiative(initId);
  const { user } = useAuth();
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const queryClient = useQueryClient();
  const deleteInitMutation = useDeleteInitiative();

  if (isLoading) return <div className="p-12 text-center text-slate-500">Loading initiative details...</div>;
  if (!initiative) return <div className="p-12 text-center text-red-500">Initiative not found</div>;

  const isOwner = user?.id === initiative.ownerId;
  const isAdmin = user?.role === "admin";
  const isPM = user?.role === "project-manager";
  const isApprover = user?.role === "approver";
  
  const canManageInitiative = isAdmin || (isPM && isOwner);
  const canAddMilestones = isAdmin || (isPM && isOwner);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this initiative?")) return;
    try {
      await deleteInitMutation.mutateAsync({ id: initId });
      toast.success("Initiative deleted");
      window.location.href = "/";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant={initiative.status === 'active' ? 'default' : 'secondary'} className="uppercase">
                  {initiative.status.replace("_", " ")}
                </Badge>
                {initiative.priority && (
                  <Badge variant="outline" className="uppercase border-slate-300 text-slate-600">
                    {initiative.priority} Priority
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 leading-tight max-w-3xl">
                {initiative.title}
              </h1>
            </div>
            
            {canManageInitiative && (
              <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            )}
          </div>

          <p className="text-lg text-slate-600 max-w-3xl mb-8 leading-relaxed">
            {initiative.description || "No description provided."}
          </p>

          <div className="flex flex-wrap gap-6 text-sm text-slate-600 mb-8 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span>Owner: <strong className="text-slate-900">{initiative.ownerName || "Unknown"}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Created: <strong className="text-slate-900">{format(new Date(initiative.createdAt), "MMM d, yyyy")}</strong></span>
            </div>
            {initiative.targetDate && (
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span>Target: <strong className="text-slate-900">{format(new Date(initiative.targetDate), "MMM d, yyyy")}</strong></span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <div className="flex justify-between items-end mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Overall Progress</h3>
                <p className="text-sm text-slate-500">Based on approved milestone weight</p>
              </div>
              <span className="text-3xl font-display font-bold text-primary">{initiative.progress}%</span>
            </div>
            <Progress value={initiative.progress} className="h-4" />
            <div className="flex gap-4 mt-4 text-sm font-medium">
              <span className="text-emerald-600">{initiative.approvedCount} Approved</span>
              <span className="text-amber-600">{initiative.pendingCount} Pending/Submitted</span>
              <span className="text-slate-500">{initiative.milestoneCount} Total Milestones</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-12 mb-6">
        <h2 className="text-2xl font-display font-bold text-slate-900">Milestones</h2>
        {canAddMilestones && (
          <Button onClick={() => setIsAddMilestoneOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Milestone
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {initiative.milestones.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl border-dashed">
              <p className="text-slate-500">No milestones added yet.</p>
            </div>
          ) : (
            initiative.milestones.map((milestone) => (
              <MilestoneCard 
                key={milestone.id} 
                milestone={milestone}
                initiativeId={initId}
                isAdmin={isAdmin} 
                isOwner={isOwner} 
                isApprover={isApprover} 
                isPM={isPM}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      <AddMilestoneDialog 
        open={isAddMilestoneOpen} 
        onOpenChange={setIsAddMilestoneOpen} 
        initiativeId={initId} 
      />
    </div>
  );
}

interface MilestoneCardProps {
  milestone: MilestoneWithAttachments;
  initiativeId: number;
  isAdmin: boolean;
  isOwner: boolean;
  isApprover: boolean;
  isPM: boolean;
}

function MilestoneCard({ milestone, initiativeId, isAdmin, isOwner, isApprover, isPM }: MilestoneCardProps) {
  const queryClient = useQueryClient();
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const submitMut = useSubmitMilestone();
  const approveMut = useApproveMilestone();
  const deleteMut = useDeleteMilestone();
  const { uploadFile, isUploading } = useUpload();
  const addAttachmentMut = useAddAttachment();

  const canSubmit = (isAdmin || (isPM && isOwner)) && (milestone.status === 'pending' || milestone.status === 'in_progress' || milestone.status === 'rejected');
  const canApprove = (isAdmin || isApprover) && milestone.status === 'submitted';
  const canDelete = isAdmin || (isPM && isOwner);
  const canUpload = (isAdmin || (isPM && isOwner)) && milestone.status !== 'approved';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/initiatives/${initiativeId}`] });

  const handleAction = async (action: string, promise: Promise<unknown>) => {
    try {
      await promise;
      toast.success(`Milestone ${action}`);
      invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : action;
      toast.error(`Failed to ${action}: ${msg}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { objectPath, fileName, contentType } = await uploadFile(file, milestone.id);
      await addAttachmentMut.mutateAsync({
        id: milestone.id,
        data: { fileName, objectPath, contentType }
      });
      toast.success("File attached successfully");
      invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Upload failed: ${msg}`);
    }
    e.target.value = '';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={statusColors[milestone.status] ?? "default"}>
                {milestone.status.replace("_", " ")}
              </Badge>
              <span className="text-sm font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                Weight: {milestone.weight}%
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{milestone.title}</h3>
            {milestone.description && (
              <p className="text-slate-600 text-sm mb-4">{milestone.description}</p>
            )}
            
            {milestone.status === 'rejected' && milestone.rejectionReason && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800 mb-4">
                <strong className="block mb-1">Rejection Reason:</strong>
                {milestone.rejectionReason}
              </div>
            )}
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
              {milestone.dueDate && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                  <Clock className="w-3.5 h-3.5" /> Due: {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                </div>
              )}
              {milestone.approvedByName && (
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved by {milestone.approvedByName}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-row md:flex-col gap-2 items-end justify-start md:justify-center shrink-0">
            {canSubmit && (
              <Button 
                size="sm" 
                onClick={() => handleAction('submitted', submitMut.mutateAsync({ id: milestone.id }))}
                disabled={submitMut.isPending}
                className="w-full md:w-auto"
              >
                <PlayCircle className="w-4 h-4 mr-1.5" /> Submit for Approval
              </Button>
            )}
            
            {canApprove && (
              <>
                <Button 
                  size="sm" 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white w-full md:w-auto shadow-emerald-600/20"
                  onClick={() => handleAction('approved', approveMut.mutateAsync({ id: milestone.id, data: {} }))}
                  disabled={approveMut.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  className="w-full md:w-auto"
                  onClick={() => setIsRejectOpen(true)}
                >
                  <XCircle className="w-4 h-4 mr-1.5" /> Reject
                </Button>
              </>
            )}

            {canDelete && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-slate-400 hover:text-destructive w-full md:w-auto mt-auto"
                onClick={() => {
                  if(confirm("Delete milestone?")) handleAction('deleted', deleteMut.mutateAsync({ id: milestone.id }));
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Attachments Section */}
      <div className="bg-slate-50 border-t border-slate-100 p-4 px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {milestone.attachments.length > 0 ? (
            milestone.attachments.map((att: FileAttachment) => (
              <a 
                key={att.id} 
                href={`/api/storage/objects/${att.objectPath.replace(/^\/objects\//, "")}`}
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary hover:text-primary transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="max-w-[150px] truncate">{att.fileName}</span>
              </a>
            ))
          ) : (
            <span className="text-sm text-slate-500 italic">No attachments</span>
          )}
        </div>
        
        {canUpload && (
          <div className="relative shrink-0">
            <Button size="sm" variant="outline" className="bg-white h-8" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Upload className="w-4 h-4 mr-1.5" />}
              {isUploading ? "Uploading..." : "Upload File"}
            </Button>
            <input 
              type="file" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </div>
        )}
      </div>

      <RejectDialog 
        open={isRejectOpen} 
        onOpenChange={setIsRejectOpen} 
        milestoneId={milestone.id} 
        onSuccess={invalidate} 
      />
    </motion.div>
  );
}

interface AddMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiativeId: number;
}

function AddMilestoneDialog({ open, onOpenChange, initiativeId }: AddMilestoneDialogProps) {
  const queryClient = useQueryClient();
  const createMut = useCreateMilestone();
  const [data, setData] = useState({ title: "", description: "", weight: 10, dueDate: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMut.mutateAsync({ id: initiativeId, data: { ...data, dueDate: data.dueDate || undefined } });
      toast.success("Milestone added");
      queryClient.invalidateQueries({ queryKey: [`/api/initiatives/${initiativeId}`] });
      onOpenChange(false);
      setData({ title: "", description: "", weight: 10, dueDate: "" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add milestone";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add Milestone">
      <form onSubmit={onSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Title</label>
          <Input required value={data.title} onChange={e => setData({...data, title: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Description</label>
          <Textarea value={data.description} onChange={e => setData({...data, description: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Weight (%)</label>
            <Input type="number" min="0" max="100" required value={data.weight} onChange={e => setData({...data, weight: parseInt(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Due Date</label>
            <Input type="date" value={data.dueDate} onChange={e => setData({...data, dueDate: e.target.value})} />
          </div>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={createMut.isPending}>Add</Button>
        </div>
      </form>
    </Dialog>
  );
}

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestoneId: number;
  onSuccess: () => void;
}

function RejectDialog({ open, onOpenChange, milestoneId, onSuccess }: RejectDialogProps) {
  const [comment, setComment] = useState("");
  const rejectMut = useRejectMilestone();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await rejectMut.mutateAsync({ id: milestoneId, data: { comment } });
      toast.success("Rejected");
      onSuccess();
      onOpenChange(false);
      setComment("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reject";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Reject Milestone">
      <form onSubmit={onSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Reason for rejection</label>
          <Textarea required value={comment} onChange={e => setComment(e.target.value)} placeholder="Please explain what needs to be fixed..." />
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={rejectMut.isPending}>Confirm Reject</Button>
        </div>
      </form>
    </Dialog>
  );
}
