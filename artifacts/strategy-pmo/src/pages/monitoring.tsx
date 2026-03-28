import { useState, lazy, Suspense } from "react";
import { BellRing, ScrollText, Loader2 } from "lucide-react";

const Alerts = lazy(() => import("@/pages/alerts"));
const ActivityLog = lazy(() => import("@/pages/activity"));

type Tab = "alerts" | "activity";

export default function Monitoring() {
  const [tab, setTab] = useState<Tab>("alerts");

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setTab("alerts")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "alerts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BellRing className="w-4 h-4" /> Alerts
        </button>
        <button
          onClick={() => setTab("activity")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "activity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ScrollText className="w-4 h-4" /> Activity Log
        </button>
      </div>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        {tab === "alerts" ? <Alerts /> : <ActivityLog />}
      </Suspense>
    </div>
  );
}
