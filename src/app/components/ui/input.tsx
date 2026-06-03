import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-xl border border-stone-200/70 bg-white px-3 py-1 text-sm shadow-sm transition-all placeholder:text-stone-400 focus-visible:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-800/70 dark:bg-stone-900/70 dark:placeholder:text-stone-500 dark:focus-visible:border-cyan-400",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
