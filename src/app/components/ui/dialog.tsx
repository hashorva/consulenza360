import * as React from "react";
import { createPortal } from "react-dom";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "../../lib/utils";
import { Icon } from "../Icon";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

export function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DialogContext);

  React.useEffect(() => {
    if (!context?.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") context.onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [context]);

  if (!context?.open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/30 p-3 backdrop-blur-sm" onClick={() => context.onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 max-h-screen w-full max-w-3xl overflow-hidden rounded-3xl border border-stone-200/80 bg-stone-50 text-stone-950 shadow-2xl outline-none dark:border-stone-800/80 dark:bg-stone-950 dark:text-stone-50",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
        {...props}
      >
        {children}
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-stone-900 dark:hover:text-stone-50"
          onClick={() => context.onOpenChange(false)}
        >
          <Icon icon={Cancel01Icon} size={17} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-stone-200/70 px-5 py-4 dark:border-stone-800/70", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-normal", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-y-auto p-5", className)} {...props} />;
}
