import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      outline: "border-2 border-border bg-transparent hover:bg-slate-50 hover:border-slate-300 text-slate-700",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-slate-100 text-slate-700 hover:text-slate-900",
      link: "text-primary underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-11 px-5 py-2",
      sm: "h-9 px-4 text-xs",
      lg: "h-12 px-8 text-lg",
      icon: "h-11 w-11",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export function buttonVariants({
  variant = "default",
  size = "default",
}: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"] } = {}): string {
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
    outline: "border-2 border-border bg-transparent hover:bg-slate-50 hover:border-slate-300 text-slate-700",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-slate-100 text-slate-700 hover:text-slate-900",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
    default: "h-11 px-5 py-2",
    sm: "h-9 px-4 text-xs",
    lg: "h-12 px-8 text-lg",
    icon: "h-11 w-11",
  };
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    variants[variant],
    sizes[size]
  );
}

export { Button };
