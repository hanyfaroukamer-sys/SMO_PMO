import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function calcEffectiveProgress(progress: number, status: string): number {
  if (progress >= 100 && status !== 'approved') {
    return 99;
  }
  return progress;
}

export function getStatusColor(status: string) {
  switch (status?.toLowerCase()) {
    case 'approved':
    case 'completed':
    case 'on_track':
    case 'mitigated':
    case 'closed':
    case 'success':
      return 'bg-success/15 text-success border-success/30';
    case 'in_progress':
    case 'active':
    case 'submitted':
    case 'open':
    case 'planned':
      return 'bg-primary/15 text-primary border-primary/30';
    case 'pending':
    case 'draft':
      return 'bg-muted text-muted-foreground border-border';
    case 'at_risk':
    case 'warning':
    case 'on_hold':
      return 'bg-warning/15 text-warning-foreground border-warning/30';
    case 'off_track':
    case 'rejected':
    case 'cancelled':
    case 'critical':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    default:
      return 'bg-secondary text-secondary-foreground border-border';
  }
}
