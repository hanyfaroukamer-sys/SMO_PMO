import React, { ReactNode } from "react";
import { cn, getStatusColor, calcEffectiveProgress } from "@/lib/utils";

export function PageHeader({ title, description, children }: { title: string, description?: string, children?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-lg">{description}</p>}
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
      "px-2.5 py-1 rounded-full text-xs font-semibold capitalize border whitespace-nowrap",
      getStatusColor(status),
      className
    )}>
      {formattedStatus}
    </span>
  );
}

export function ProgressBar({ progress, status, className, showLabel = true }: { progress: number, status?: string, className?: string, showLabel?: boolean }) {
  const effectiveProgress = status ? calcEffectiveProgress(progress, status) : progress;
  
  return (
    <div className={cn("w-full flex items-center gap-3", className)}>
      <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden border border-border/50">
        <div 
          className="h-full bg-primary transition-all duration-500 ease-out relative"
          style={{ width: `${Math.min(100, Math.max(0, effectiveProgress))}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20" />
        </div>
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
        "bg-card border border-card-border rounded-[14px] shadow-sm overflow-hidden",
        !noPadding && "p-5 md:p-6",
        onClick && "cursor-pointer",
        className
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
