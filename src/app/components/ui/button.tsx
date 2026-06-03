import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f1ec] disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-[#11100e]",
  {
    variants: {
      variant: {
        default:
          "bg-stone-950 text-stone-50 shadow-sm hover:bg-stone-800 hover:shadow-md dark:bg-stone-50 dark:text-stone-950 dark:hover:bg-stone-200",
        secondary:
          "border border-stone-200/70 bg-white text-stone-900 shadow-sm hover:border-stone-300 hover:bg-[#fbfaf7] dark:border-stone-800/70 dark:bg-stone-900/70 dark:text-stone-100 dark:hover:border-stone-700 dark:hover:bg-stone-900",
        ghost: "text-stone-700 hover:bg-stone-100/80 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-stone-50",
        destructive: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 hover:shadow-md",
      },
      size: {
        default: "px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
