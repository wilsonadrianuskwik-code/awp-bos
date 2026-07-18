"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ModuleErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  // Singular noun for the module, e.g. "invoices" — used in the message
  // so the error reads as specific to what broke, not the whole app.
  moduleName: string;
};

// Per-module error boundary. Placed as error.tsx inside a module's route
// segment (e.g. invoices/error.tsx) so a thrown error only replaces that
// module's content — the [workspaceSlug] layout (sidebar, top bar) that
// wraps it stays rendered, unlike the root error.tsx which loses the
// whole app shell. Same visual language as EmptyState (soft icon
// container, one-line message) since this is the same class of "nothing
// to render here" surface, just for an error instead of no data.
export function ModuleError({ error, reset, moduleName }: ModuleErrorProps) {
  useEffect(() => {
    console.error(`Error loading ${moduleName}:`, error);
  }, [error, moduleName]);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center duration-300 animate-in fade-in zoom-in-[0.99]">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Couldn&apos;t load {moduleName}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        Something went wrong loading this page. Try again, or come back later
        if the problem persists.
      </p>
      <div className="mt-5">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
