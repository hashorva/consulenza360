import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm", {
  variants: {
    variant: {
      default: "border-transparent bg-stone-950 text-stone-50 dark:bg-stone-50 dark:text-stone-950",
      present: "border-present/20 bg-present/10 text-present",
      absent: "border-absent/25 bg-absent/10 text-absent",
      error: "border-error/20 bg-error/10 text-error",
      cyan: "border-system/20 bg-system/10 text-system",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
