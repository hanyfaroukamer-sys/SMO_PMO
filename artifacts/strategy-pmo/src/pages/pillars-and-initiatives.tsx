import { useState, lazy, Suspense } from "react";
import { PageHeader } from "@/components/ui-elements";
import { Layers, Flag, Loader2 } from "lucide-react";

const Pillars = lazy(() => import("@/pages/pillars"));
const Initiatives = lazy(() => import("@/pages/initiatives"));

type Tab = "pillars" | "initiatives";

export default function PillarsAndInitiatives() {
  const [tab, setTab] = useState<Tab>("pillars");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Pillars & Initiatives"
        description={tab === "pillars" ? "Strategic pillars and cross-cutting enablers" : "Initiatives grouped by pillar"}
      />

      {/* Tab toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setTab("pillars")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "pillars" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Layers className="w-4 h-4" /> Pillars & Enablers
        </button>
        <button
          onClick={() => setTab("initiatives")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "initiatives" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Flag className="w-4 h-4" /> Initiatives
        </button>
      </div>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        {tab === "pillars" ? <Pillars /> : <Initiatives />}
      </Suspense>
    </div>
  );
}
