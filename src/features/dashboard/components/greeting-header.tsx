"use client";

import Link from "next/link";
import { FileText, Receipt, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type GreetingHeaderProps = {
  firstName: string;
  workspaceSlug: string;
};

// Time-of-day is computed in the browser so "Good morning" follows the
// user's clock, not the server's. suppressHydrationWarning covers the
// rare SSR/client boundary hour.
function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// The dashboard opens like a product, not an admin panel: a personal
// greeting, today's date for orientation, and the three actions that
// start real work — all existing routes, just surfaced where the day
// starts.
export function GreetingHeader({ firstName, workspaceSlug }: GreetingHeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          {today}
        </p>
        <h1
          className="mt-1 text-2xl font-semibold tracking-tight"
          suppressHydrationWarning
        >
          {greetingForNow()}, {firstName}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/${workspaceSlug}/clients/new`}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Add Client
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/${workspaceSlug}/invoices/new`}>
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            New Invoice
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/${workspaceSlug}/quotations/new`}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            New Quotation
          </Link>
        </Button>
      </div>
    </div>
  );
}
