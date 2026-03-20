import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-12">
          <Target className="w-10 h-10 text-slate-400" />
        </div>
        <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">404</h1>
        <p className="text-lg text-slate-600 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button size="lg" className="w-full sm:w-auto">Return to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
