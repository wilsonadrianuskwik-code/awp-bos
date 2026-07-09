"use client";

import { useState } from "react";
import { LayoutList, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadList } from "./lead-list";
import { LeadPipeline } from "./lead-pipeline";
import type { Lead } from "@/features/leads/types";

type LeadListPageProps = {
  leads: Lead[];
};

export function LeadListPage({ leads }: LeadListPageProps) {
  const [view, setView] = useState<"table" | "kanban">("table");

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1">
        <Button
          variant={view === "table" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("table")}
        >
          <LayoutList className="h-4 w-4" />
        </Button>
        <Button
          variant={view === "kanban" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("kanban")}
        >
          <Kanban className="h-4 w-4" />
        </Button>
      </div>

      {view === "table" ? (
        <LeadList leads={leads} />
      ) : (
        <LeadPipeline leads={leads} />
      )}
    </div>
  );
}
