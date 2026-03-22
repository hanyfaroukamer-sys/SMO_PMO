import React, { ReactNode } from "react";
import { cn, getStatusColor, calcEffectiveProgress } from "@/lib/utils";

export function PageHeader({ title, description, children }: { title: string, description?: string, children?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{title}</h1>
        <div className="w-12 h-0.5 rounded-full bg-gradient-to-r from-primary to-violet-500 mt-2 mb-1" />
        {description && <p className="text-muted-foreground mt-1 text-base">{description}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const formattedStatus = status?.replace(/_/g, ' ') || 'Unknown';
  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-xs font-semibold capitalize border whitespace-nowrap inline-flex items-center gap-1.5",
      getStatusColor(status),
      className
    )}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {formattedStatus}
    </span>
  );
}

export function ProgressBar({ progress, planned, status, className, showLabel = true }: {
  progress: number;
  planned?: number;
  status?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const effectiveProgress = status ? calcEffectiveProgress(progress, status) : progress;
  
  return (
    <div className={cn("w-full flex items-center gap-3", className)}>
      <div className="flex-1 relative h-2 bg-secondary rounded-full border border-border/50 overflow-hidden">
        <div 
          className="h-full transition-all duration-500 ease-out relative rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%`, background: "linear-gradient(90deg, hsl(var(--primary)) 0%, #7c3aed 100%)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 rounded-full" />
        </div>
        {planned !== undefined && planned > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-warning/80"
            style={{ left: `${Math.min(100, planned)}%`, transform: "translateX(-50%)" }}
          />
        )}
      </div>
      {showLabel && (
        <span className="text-sm font-semibold text-foreground shrink-0 w-10 text-right">
          {Math.round(effectiveProgress)}%
        </span>
      )}
    </div>
  );
}

export function Card({ className, children, noPadding = false, style, onClick }: { className?: string, children: ReactNode, noPadding?: boolean, style?: React.CSSProperties, onClick?: () => void }) {
  return (
    <div
      className={cn(
        "bg-card border border-card-border rounded-[14px] shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden",
        !noPadding && "p-5 md:p-6",
        onClick && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
        className
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
