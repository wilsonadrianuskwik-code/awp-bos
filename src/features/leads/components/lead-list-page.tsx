"use client";

import { useMemo, useState } from "react";
import { LayoutList, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { LeadList } from "./lead-list";
import { LeadPipeline } from "./lead-pipeline";
import type { Lead } from "@/features/leads/types";

type LeadListPageProps = {
  leads: Lead[];
};

export function LeadListPage({ leads }: LeadListPageProps) {
  const [view, setView] = useState<"table" | "kanban">("table");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.company, l.email].some((v) => v?.toLowerCase().includes(q))
    );
  }, [leads, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search leads…" />
        <div className="flex shrink-0 gap-1">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("table")}
            aria-label="Table view"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "kanban" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setView("kanban")}
            aria-label="Board view"
          >
            <Kanban className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "table" ? (
        <LeadList leads={filtered} />
      ) : (
        <LeadPipeline leads={filtered} />
      )}
    </div>
  );
}
