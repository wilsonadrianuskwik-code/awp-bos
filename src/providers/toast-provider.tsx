"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
  // Marks the exit phase: the toast stays mounted for the out-animation,
  // then gets removed. Entering/leaving is presentation state only.
  leaving?: boolean;
};

type ToastOptions = {
  action?: ToastAction;
  duration?: number;
};

type ToastContextType = {
  toasts: Toast[];
  toast: (message: string, type?: Toast["type"], options?: ToastOptions) => void;
  dismiss: (id: string) => void;
};

const Context = createContext<ToastContextType | undefined>(undefined);

// Toasts follow the design system's surface language (card background,
// hairline border, shadow-lg) with a single semantic accent per type
// carried by the leading icon — not a saturated full-bleed fill, which
// reads as an alert box rather than a notification.
const TOAST_STYLES: Record<
  Toast["type"],
  { icon: typeof Info; iconClass: string }
> = {
  success: { icon: CheckCircle2, iconClass: "text-emerald-600 dark:text-emerald-400" },
  error: { icon: AlertCircle, iconClass: "text-destructive" },
  info: { icon: Info, iconClass: "text-primary" },
};

const EXIT_MS = 180;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Two-phase removal: flag `leaving` so the exit animation plays, then
  // actually unmount after it finishes.
  const startExit = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const toast = useCallback(
    (
      message: string,
      type: Toast["type"] = "info",
      options?: ToastOptions
    ) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      setTimeout(() => startExit(id), options?.duration ?? 5000);
    },
    [startExit]
  );

  const dismiss = useCallback((id: string) => startExit(id), [startExit]);

  return (
    <Context.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, iconClass } = TOAST_STYLES[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3.5 text-card-foreground shadow-overlay",
                t.leaving
                  ? "duration-200 animate-out fade-out slide-out-to-right-4 fill-mode-forwards"
                  : "duration-200 animate-in fade-in slide-in-from-bottom-2"
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
              <p className="flex-1 text-[13px] leading-snug">{t.message}</p>
              <div className="flex shrink-0 items-center gap-1">
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="rounded-md px-2 py-0.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Context.Provider>
  );
}

export function useToast() {
  const context = useContext(Context);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
