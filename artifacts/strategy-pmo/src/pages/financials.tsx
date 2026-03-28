import { useState, lazy, Suspense } from "react";
import { Wallet, ShoppingCart, Loader2 } from "lucide-react";

const Budget = lazy(() => import("@/pages/budget"));
const Procurement = lazy(() => import("@/pages/procurement"));

type Tab = "budget" | "procurement";

export default function Financials() {
  const [tab, setTab] = useState<Tab>("budget");

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setTab("budget")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "budget" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Wallet className="w-4 h-4" /> Budget
        </button>
        <button
          onClick={() => setTab("procurement")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === "procurement" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ShoppingCart className="w-4 h-4" /> Procurement
        </button>
      </div>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        {tab === "budget" ? <Budget /> : <Procurement />}
      </Suspense>
    </div>
  );
}
