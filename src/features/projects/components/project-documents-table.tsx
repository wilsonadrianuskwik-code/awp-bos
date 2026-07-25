"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { ListEmpty } from "@/components/shared/list-empty";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { ProjectDocument } from "@/features/projects/queries";

const DOCUMENT_TYPE_LABEL: Record<ProjectDocument["document_type"], string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  proforma_invoice: "Proforma Invoice",
  delivery_order: "Delivery Order",
};

// Route segment each document type lives under — used to build detail
// links. Some of these routes may not exist yet (other engineers own
// them); linking to them is still correct, they'll just 404 until built.
const DOCUMENT_TYPE_ROUTE: Record<ProjectDocument["document_type"], string> = {
  quotation: "quotations",
  invoice: "invoices",
  purchase_order: "purchase-orders",
  proforma_invoice: "proforma-invoices",
  delivery_order: "delivery-orders",
};

const columns: ColumnDef<ProjectDocument, unknown>[] = [
  {
    accessorKey: "document_type",
    header: "Document Type",
    cell: ({ row }) => DOCUMENT_TYPE_LABEL[row.original.document_type],
  },
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.getValue("number")}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const { total, currency } = row.original;
      return total != null && currency ? formatCurrency(total, currency) : "—";
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => new Date(row.getValue("created_at") as string).toLocaleDateString(),
  },
];

type ProjectDocumentsTableProps = {
  documents: ProjectDocument[];
};

export function ProjectDocumentsTable({ documents }: ProjectDocumentsTableProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();

  if (documents.length === 0) {
    return <ListEmpty message="No documents linked to this project yet." />;
  }

  return (
    <DataTable
      columns={columns}
      data={documents}
      onRowClick={(doc) =>
        router.push(`/${workspace.slug}/${DOCUMENT_TYPE_ROUTE[doc.document_type]}/${doc.id}`)
      }
    />
  );
}
