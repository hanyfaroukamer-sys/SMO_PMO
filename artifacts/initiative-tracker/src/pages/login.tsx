import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Target, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const { isAuthenticated, login, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-hidden">
      {/* Left side - content */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="max-w-md w-full"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/20 mb-8">
            <Target className="w-8 h-8 text-white" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 mb-4 tracking-tight">
            Track <span className="text-gradient">initiatives</span><br />
            with clarity.
          </h1>
          
          <p className="text-lg text-slate-600 mb-10 leading-relaxed">
            A powerful, professional platform for managing strategic goals, tracking milestones, and streamlining approval workflows across your entire organization.
          </p>
          
          <Button size="lg" className="w-full text-lg group" onClick={login}>
            Continue with Replit
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>
      </div>

      {/* Right side - imagery */}
      <div className="hidden lg:flex flex-1 relative bg-slate-900 items-center justify-center p-12">
        <div className="absolute inset-0 opacity-40">
          <img 
            src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
            alt="Abstract background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 glass-panel rounded-2xl p-8 max-w-lg w-full"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="h-4 w-32 bg-white/20 rounded animate-pulse" />
              <div className="h-6 w-16 bg-emerald-400/20 rounded-full" />
            </div>
            <div className="space-y-3">
              <div className="h-3 w-full bg-white/10 rounded" />
              <div className="h-3 w-4/5 bg-white/10 rounded" />
              <div className="h-3 w-2/3 bg-white/10 rounded" />
            </div>
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-white/20 rounded-full" />
                <div className="space-y-2 flex-1">
                  <div className="h-2 w-24 bg-white/20 rounded" />
                  <div className="h-2 w-16 bg-white/10 rounded" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
