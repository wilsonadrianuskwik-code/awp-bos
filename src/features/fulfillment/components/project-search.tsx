"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspace } from "@/providers/workspace-provider";
import {
  searchFulfillmentProjectsAction,
  type FulfillmentProjectSearchResult,
} from "@/features/fulfillment/actions-projects";

// Shared behind both the landing page's jump bar and the workspace
// breadcrumb's switcher — one search box matching client name OR invoice
// number in a single query (see searchFulfillmentProjectsAction), so
// finding a project is never a two-step "pick client, then pick invoice."
function useProjectSearch() {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FulfillmentProjectSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      searchFulfillmentProjectsAction(workspace.id, query).then((res) => {
        setResults(res.data ?? []);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, workspace.id]);

  return { query, setQuery, results, loading };
}

function ResultsList({
  results,
  loading,
  query,
  onSelect,
}: {
  results: FulfillmentProjectSearchResult[];
  loading: boolean;
  query: string;
  onSelect: (invoiceId: string) => void;
}) {
  if (!query.trim()) return null;

  return (
    <div className="max-h-72 overflow-y-auto py-1">
      {loading ? (
        <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">Searching…</p>
      ) : results.length === 0 ? (
        <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
          No projects match &ldquo;{query}&rdquo;
        </p>
      ) : (
        results.map((r) => (
          <button
            key={r.invoiceId}
            type="button"
            onClick={() => onSelect(r.invoiceId)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <span className="truncate font-medium">{r.clientName}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {r.invoiceNumber}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// Project workspace header: the breadcrumb's dropdown caret opens this
// popover to jump to a different project without a permanent picker taking
// up header space (see project-header-bar.tsx). `onSelect` sets the
// workspace shell's selected invoice in place — the whole /fulfillment
// module is one page now, so switching projects is never a navigation.
export function ProjectSwitcherPopover({
  trigger,
  onSelect,
}: {
  trigger: React.ReactNode;
  onSelect: (invoiceId: string) => void;
}) {
  const { query, setQuery, results, loading } = useProjectSearch();
  const [open, setOpen] = useState(false);

  function select(invoiceId: string) {
    setOpen(false);
    setQuery("");
    onSelect(invoiceId);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Switch to another project…"
            className="h-7 border-none px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ResultsList results={results} loading={loading} query={query} onSelect={select} />
      </PopoverContent>
    </Popover>
  );
}
