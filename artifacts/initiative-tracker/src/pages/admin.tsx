import { useListUsers, useUpdateUserRole } from "@workspace/api-client-react";
import { UpdateRoleRequestRole } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function Admin() {
  const { data, isLoading } = useListUsers();
  const updateRoleMut = useUpdateUserRole();
  const queryClient = useQueryClient();

  const handleRoleChange = async (userId: string, newRole: UpdateRoleRequestRole) => {
    try {
      await updateRoleMut.mutateAsync({ id: userId, data: { role: newRole } });
      toast.success("Role updated successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch {
      toast.error("Failed to update role");
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'admin') return <ShieldAlert className="w-4 h-4 text-destructive" />;
    if (role === 'approver') return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    return <Shield className="w-4 h-4 text-primary" />;
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Admin Panel</h1>
        <p className="text-slate-500 mt-1">Manage users and system roles.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">User</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Email</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Joined</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading users...</td>
                </tr>
              ) : data?.users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                          {user.firstName?.[0] || "U"}
                        </div>
                      )}
                      <span className="font-medium text-slate-900">{user.firstName} {user.lastName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{user.email}</td>
                  <td className="px-6 py-4 text-slate-600">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(user.role)}
                      <select
                        className="bg-transparent font-medium text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none cursor-pointer py-1"
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UpdateRoleRequestRole)}
                        disabled={updateRoleMut.isPending}
                      >
                        <option value="admin">Admin</option>
                        <option value="project-manager">Project Manager</option>
                        <option value="approver">Approver</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
