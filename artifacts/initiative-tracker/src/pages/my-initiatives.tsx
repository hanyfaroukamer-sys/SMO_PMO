import { useState } from "react";
import { Link } from "wouter";
import { useListInitiatives, InitiativeStatus, InitiativePriority } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Target, Calendar, Activity } from "lucide-react";
import { format } from "date-fns";
import type { BadgeVariant } from "@/components/ui/badge";

const statusColors: Record<string, BadgeVariant> = {
  draft: "secondary",
  active: "default",
  completed: "success",
  on_hold: "warning",
  cancelled: "destructive",
};

export default function MyInitiatives() {
  const { data: listData, isLoading } = useListInitiatives();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const initiatives = listData?.initiatives || [];
  const myInitiatives = initiatives.filter(i => i.ownerId === user?.id);
  const filtered = myInitiatives.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">My Initiatives</h1>
          <p className="text-slate-500 mt-1">Initiatives you own.</p>
        </div>
        <Input
          placeholder="Search my initiatives..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
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
            {search
              ? "Try adjusting your search criteria."
              : "You have not created any initiatives yet. Go to the Dashboard to create one."}
          </p>
          {!search && (
            <Button asChild className="mt-6">
              <Link href="/">Go to Dashboard</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((init) => (
            <Link key={init.id} href={`/initiatives/${init.id}`}>
              <div className="glass-card p-6 rounded-2xl h-full flex flex-col cursor-pointer group">
                <div className="flex justify-between items-start mb-4">
                  <Badge variant={statusColors[init.status] ?? "default"} className="capitalize">
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
    </div>
  );
}
