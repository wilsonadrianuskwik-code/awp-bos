"use client";

import { Receipt } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Activity } from "@/features/activities/types";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  credit_card: "Credit Card",
  cash: "Cash",
  check: "Check",
  paypal: "PayPal",
  stripe: "Stripe",
  other: "Other",
};

// Payment activities (written by record_payment, 00020_create_invoice_functions.sql)
// carry this shape in metadata. Every other activity type across leads,
// clients, and quotations has no such fields and falls through to the
// plain description rendering below, unaffected.
type PaymentMetadata = {
  payment_number: string;
  amount: number;
  currency: string;
  payment_method: string;
  ordinal: number;
};

function getPaymentMetadata(activity: Activity): PaymentMetadata | null {
  const m = activity.metadata;
  if (
    typeof m?.payment_number === "string" &&
    typeof m?.amount === "number" &&
    typeof m?.currency === "string" &&
    typeof m?.payment_method === "string" &&
    typeof m?.ordinal === "number"
  ) {
    return m as unknown as PaymentMetadata;
  }
  return null;
}

type ActivityTimelineProps = {
  activities: Activity[];
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  return (
    // The vertical rail connecting entries is what makes this read as a
    // timeline instead of a list; each avatar wears a card-colored ring
    // so the rail appears to pass behind it.
    <div className="relative space-y-5 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-border">
      {activities.map((activity) => {
        const initials =
          activity.actor?.full_name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) ?? "?";

        const payment = getPaymentMetadata(activity);

        return (
          <div key={activity.id} className="flex gap-3">
            {payment ? (
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-2 ring-card dark:bg-emerald-950 dark:text-emerald-300">
                <Receipt className="h-4 w-4" />
              </div>
            ) : (
              <Avatar className="relative z-10 h-8 w-8 shrink-0 ring-2 ring-card">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 text-sm">
              {payment ? (
                <>
                  <p className="font-medium">
                    Payment #{payment.ordinal} recorded
                    <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                      {payment.payment_number}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {formatCurrency(payment.amount)} via{" "}
                    {PAYMENT_METHOD_LABEL[payment.payment_method] ??
                      payment.payment_method}
                  </p>
                </>
              ) : (
                <p>
                  <span className="font-medium">
                    {activity.actor?.full_name ?? "Unknown"}
                  </span>{" "}
                  {activity.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {timeAgo(activity.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
