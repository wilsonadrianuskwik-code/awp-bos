"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (
      message: string,
      type: Toast["type"] = "info",
      options?: ToastOptions
    ) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, options?.duration ?? 5000);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Context.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg px-4 py-3 text-sm shadow-lg transition-all animate-in slide-in-from-bottom-2",
              t.type === "success" && "bg-green-600 text-white",
              t.type === "error" && "bg-destructive text-destructive-foreground",
              t.type === "info" && "bg-primary text-primary-foreground"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{t.message}</span>
              <div className="flex shrink-0 items-center gap-2">
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  onClick={() => dismiss(t.id)}
                  className="opacity-70 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function useToast() {
  const context = useContext(Context);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
