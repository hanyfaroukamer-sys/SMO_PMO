import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListSpmoDepartments,
  useCreateSpmaDepartment,
  useUpdateSpmaDepartment,
  useDeleteSpmaDepartment,
  useGetSpmaAdminUsers,
} from "@workspace/api-client-react";
import { PageHeader, Card, ProgressBar } from "@/components/ui-elements";
import { Modal, FormField, FormActions, inputClass } from "@/components/modal";
import { Loader2, Pencil, Trash2, Plus, Building2, FolderOpen } from "lucide-react";
import { UserMentionInput } from "@/components/user-mention-input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#84cc16",
];

type DeptForm = {
  name: string;
  description: string;
  color: string;
  headName: string;
  headEmail: string;
  taskReminderCcUserId: string;
  taskReminderCcName: string;
  weeklyOverdueCcUserId: string;
  weeklyOverdueCcName: string;
  sortOrder: string;
};

const emptyForm = (): DeptForm => ({
  name: "", description: "", color: COLORS[0], headName: "", headEmail: "",
  taskReminderCcUserId: "", taskReminderCcName: "",
  weeklyOverdueCcUserId: "", weeklyOverdueCcName: "",
  sortOrder: "0",
});

export default function Departments() {
  const { data, isLoading } = useListSpmoDepartments();
  const { data: usersData } = useGetSpmaAdminUsers();
  const allUsers = usersData?.users ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DeptForm>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const createMutation = useCreateSpmaDepartment();
  const updateMutation = useUpdateSpmaDepartment();
  const deleteMutation = useDeleteSpmaDepartment();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/spmo/departments"] });
  };

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(dept: NonNullable<typeof data>["departments"][number]) {
    setEditId(dept.id);
    setForm({
      name: dept.name,
      description: dept.description ?? "",
      color: dept.color ?? COLORS[0],
      headName: dept.headName ?? "",
      headEmail: dept.headEmail ?? "",
      taskReminderCcUserId: dept.taskReminderCcUserId ?? "",
      taskReminderCcName: dept.taskReminderCcName ?? "",
      weeklyOverdueCcUserId: dept.weeklyOverdueCcUserId ?? "",
      weeklyOverdueCcName: dept.weeklyOverdueCcName ?? "",
      sortOrder: String(dept.sortOrder ?? 0),
    });
    setModalOpen(true);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete department "${name}"? Projects assigned to it will be untagged.`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `"${name}" removed.` });
        invalidate();
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      color: form.color,
      headName: form.headName || undefined,
      headEmail: form.headEmail || undefined,
      taskReminderCcUserId: form.taskReminderCcUserId || undefined,
      taskReminderCcName: form.taskReminderCcName || undefined,
      weeklyOverdueCcUserId: form.weeklyOverdueCcUserId || undefined,
      weeklyOverdueCcName: form.weeklyOverdueCcName || undefined,
      sortOrder: parseInt(form.sortOrder) || 0,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Updated" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to update.", variant: "destructive" }),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Created" });
          setModalOpen(false);
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to create.", variant: "destructive" }),
      });
    }
  }

  const departments = data?.departments ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Departments"
        description="Manage organisational departments and their project portfolio"
      >
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Department
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : departments.length === 0 ? (
        <Card className="text-center py-16">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No departments yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a department to start grouping projects by organisational unit.</p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create First Department
          </button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: dept.color ?? "#3b82f6" + "22" }}
                  >
                    <Building2 className="w-5 h-5" style={{ color: dept.color ?? "#3b82f6" }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{dept.name}</h3>
                    {dept.description && (
                      <p className="text-sm text-slate-500 truncate">{dept.description}</p>
                    )}
                    {dept.headName && (
                      <p className="text-xs text-muted-foreground">Head: {dept.headName}</p>
                    )}
                    {(dept.taskReminderCcName || dept.weeklyOverdueCcName) && (
                      <p className="text-[10px] text-muted-foreground">
                        {dept.taskReminderCcName && <span>Task CC: {dept.taskReminderCcName}</span>}
                        {dept.taskReminderCcName && dept.weeklyOverdueCcName && <span> · </span>}
                        {dept.weeklyOverdueCcName && <span>Weekly CC: {dept.weeklyOverdueCcName}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={() => openEdit(dept)}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id, dept.name)}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{dept.projectCount} project{dept.projectCount !== 1 ? "s" : ""}</span>
                  <span className="font-medium text-slate-700">{dept.progress}%</span>
                </div>
                <ProgressBar progress={dept.progress} />
              </div>

              <button
                onClick={() => navigate(`/departments/${dept.id}/portfolio`)}
                className="flex items-center justify-center gap-2 w-full text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-2 rounded-lg border border-blue-200 font-medium transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                View Portfolio
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId !== null ? "Edit Department" : "New Department"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Infrastructure"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description..."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Department Head Name">
              <input className={inputClass} value={form.headName} onChange={(e) => setForm({ ...form, headName: e.target.value })} placeholder="e.g. Dr. Ahmed Al-Dosari" />
            </FormField>
            <FormField label="Department Head Email">
              <input type="email" className={inputClass} value={form.headEmail} onChange={(e) => setForm({ ...form, headEmail: e.target.value })} placeholder="ahmed@example.gov" />
            </FormField>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Reminder CC Recipients</div>
            <p className="text-[10px] text-muted-foreground">Choose who gets CC'd when PMs in this department receive reminder emails.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="CC on Task Reminders (milestones, risks)">
                <UserMentionInput
                  value={form.taskReminderCcName}
                  onChange={(name, userId) => setForm({ ...form, taskReminderCcName: name, ...(userId ? { taskReminderCcUserId: userId } : {}) })}
                  placeholder="Type to search users…"
                  className={inputClass}
                />
              </FormField>

              <FormField label="CC on Weekly Report Overdue">
                <UserMentionInput
                  value={form.weeklyOverdueCcName}
                  onChange={(name, userId) => setForm({ ...form, weeklyOverdueCcName: name, ...(userId ? { weeklyOverdueCcUserId: userId } : {}) })}
                  placeholder="Type to search users…"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          <FormField label="Colour">
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? "#1e293b" : "transparent",
                  }}
                />
              ))}
            </div>
          </FormField>

          <FormField label="Sort Order">
            <input
              type="number"
              className={inputClass}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </FormField>

          <FormActions
            onCancel={() => setModalOpen(false)}
            loading={isSaving}
            label={editId !== null ? "Save Changes" : "Create Department"}
          />
        </form>
      </Modal>
    </div>
  );
}
