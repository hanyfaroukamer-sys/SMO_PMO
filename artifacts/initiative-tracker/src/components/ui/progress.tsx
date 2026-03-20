import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const safeValue = Math.min(100, Math.max(0, value || 0));
    
    return (
      <div
        ref={ref}
        className={cn("relative h-3 w-full overflow-hidden rounded-full bg-slate-100", className)}
        {...props}
      >
        <motion.div
          className="h-full w-full flex-1 bg-gradient-to-r from-primary to-accent transition-all"
          initial={{ x: "-100%" }}
          animate={{ x: `-${100 - safeValue}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
