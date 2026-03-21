import { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = "max-w-lg" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative bg-card border border-border rounded-2xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200`}
      >
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-bold font-display">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors placeholder:text-muted-foreground";

export const selectClass =
  "w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

interface SubmitButtonProps {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  onCancel: () => void;
}

export function FormActions({ loading, disabled, label = "Save", onCancel }: SubmitButtonProps) {
  return (
    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading || disabled}
        className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? "Saving..." : label}
      </button>
    </div>
  );
}
