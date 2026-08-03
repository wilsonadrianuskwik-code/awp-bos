import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { DocumentLink } from "@/features/documents/queries";

const ROUTE_SEGMENT: Record<string, string> = {
  quotation: "quotations",
  proforma_invoice: "proforma-invoices",
  invoice: "invoices",
  purchase_order: "purchase-orders",
  delivery_order: "delivery-orders",
  payment: "payments",
};

/**
 * The traceability chain for one document, rendered as clickable rows
 * showing each linked document's number — the thing users actually match
 * against paper and supplier correspondence, so it's set in monospace and
 * never truncated.
 *
 * Split by direction: what produced this document vs. what it produced.
 */
export function LinkedDocumentsCard({
  links,
  workspaceSlug,
}: {
  links: DocumentLink[];
  workspaceSlug: string;
}) {
  if (links.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linked Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <LinkedDocumentsList links={links} workspaceSlug={workspaceSlug} />
      </CardContent>
    </Card>
  );
}

/**
 * The same chain without the card chrome, for pages that supply their
 * own heading (the document detail tabs).
 */
export function LinkedDocumentsList({
  links,
  workspaceSlug,
}: {
  links: DocumentLink[];
  workspaceSlug: string;
}) {
  if (links.length === 0) return null;

  const upstream = links.filter((l) => l.direction === "generated_from");
  const downstream = links.filter((l) => l.direction === "generated_to");

  return (
    <div className="space-y-4">
      {upstream.length > 0 && (
        <LinkGroup
          title="Generated from"
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          links={upstream}
          workspaceSlug={workspaceSlug}
        />
      )}
      {downstream.length > 0 && (
        <LinkGroup
          title="Generated"
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          links={downstream}
          workspaceSlug={workspaceSlug}
        />
      )}
    </div>
  );
}

function LinkGroup({
  title,
  icon,
  links,
  workspaceSlug,
}: {
  title: string;
  icon: React.ReactNode;
  links: DocumentLink[];
  workspaceSlug: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {links.map((link) => (
          <li key={`${link.relatedType}-${link.relatedId}`}>
            <Link
              href={`/${workspaceSlug}/${ROUTE_SEGMENT[link.relatedType] ?? ""}/${link.relatedId}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[13px] font-medium">
                  {link.relatedNumber}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {link.relatedLabel}
                </span>
              </span>
              {link.relatedStatus && <StatusBadge status={link.relatedStatus} />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
