"use client";

import { useState } from "react";
import { LeadDetail } from "./lead-detail";
import { LeadConvertDialog } from "./lead-convert-dialog";
import type { Lead } from "@/features/leads/types";
import type { Activity } from "@/features/activities/types";

type LeadDetailPageProps = {
  lead: Lead;
  activities: Activity[];
};

export function LeadDetailPage({ lead, activities }: LeadDetailPageProps) {
  const [convertOpen, setConvertOpen] = useState(false);

  return (
    <>
      <LeadDetail
        lead={lead}
        activities={activities}
        onConvert={() => setConvertOpen(true)}
      />
      <LeadConvertDialog
        lead={lead}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
    </>
  );
}
