"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";
import { ListEmpty } from "@/components/shared/list-empty";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/providers/workspace-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import {
  DOCUMENT_TYPES,
  type AnyDocument,
  type DocumentType,
} from "@/features/documents/document-types";
import {
  REGISTER_COLUMNS,
  buildRegisterRow,
  downloadCsv,
  toCsv,
} from "@/features/documents/register-export";

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  delivery_order: "Delivery Order",
};

const DOCUMENT_TYPE_ROUTE: Record<DocumentType, string> = {
  quotation: "quotations",
  proforma_invoice: "proforma-invoices",
  invoice: "invoices",
  purchase_order: "purchase-orders",
  delivery_order: "delivery-orders",
};

/** Sentinel: Radix Select can't hold an empty-string value. */
const ALL = "__all__";

const columns: ColumnDef<AnyDocument, unknown>[] = [
  {
    accessorKey: "document_type",
    header: "Type",
    cell: ({ row }) => DOCUMENT_TYPE_LABEL[row.original.document_type],
  },
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.number}</span>
    ),
  },
  {
    id: "project",
    header: "Project",
    cell: ({ row }) =>
      row.original.project ? (
        <span className="truncate">
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.project.code}
          </span>{" "}
          {row.original.project.name}
        </span>
      ) : (
        "—"
      ),
  },
  {
    id: "party",
    header: "Client / Supplier",
    cell: ({ row }) => row.original.party ?? "—",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
    cell: ({ row }) =>
      new Date(row.original.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
  },
];

/**
 * Every document in the workspace in one table, filterable by project
 * and by type.
 *
 * Filters live in the URL rather than component state, so a filtered
 * view is linkable and survives a refresh — that's what lets the project
 * page deep-link straight into "all documents for this project", instead
 * of this being a second, parallel way to browse.
 */
export function AllDocumentsPage({
  documents,
  projects,
}: {
  documents: AnyDocument[];
  projects: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();

  const projectId = searchParams.get("project") ?? ALL;
  const documentType = searchParams.get("type") ?? ALL;

  function handleExport() {
    const csv = toCsv(REGISTER_COLUMNS, documents.map(buildRegisterRow));
    const scope = [
      projectId !== ALL
        ? projects.find((p) => p.id === projectId)?.code ?? "project"
        : null,
      documentType !== ALL ? DOCUMENT_TYPE_LABEL[documentType as DocumentType] : null,
    ]
      .filter(Boolean)
      .join(" - ");
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(scope ? `Register ${scope} ${today}` : `Register ${today}`, csv);
  }

  function setFilter(key: "project" | "type", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-4">
      {/* A 17-column register doesn't fit portrait. Scoped to this page by
          being mounted only here — the global @page rule (A4 portrait,
          globals.css) still governs printed documents. */}
      <style>{"@media print { @page { size: A4 landscape; } }"}</style>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Select
          value={projectId}
          onValueChange={(v) => setFilter("project", v)}
        >
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={documentType} onValueChange={(v) => setFilter("type", v)}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="All document types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All document types</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DOCUMENT_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={documents.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      <RegisterPrintTable documents={documents} />

      <div className="print:hidden">
      {documents.length === 0 ? (
        <ListEmpty
          message={
            projectId !== ALL || documentType !== ALL
              ? "No documents match these filters."
              : "Documents you create will appear here."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={documents}
          onRowClick={(doc) =>
            router.push(
              `/${workspace.slug}/${DOCUMENT_TYPE_ROUTE[doc.document_type]}/${doc.id}`
            )
          }
        />
      )}
      </div>
    </div>
  );
}

/**
 * The printed/PDF form of the register — the same columns the Excel
 * export writes, so a printout and a spreadsheet of the same view can be
 * read side by side without re-mapping anything.
 */
function RegisterPrintTable({ documents }: { documents: AnyDocument[] }) {
  if (documents.length === 0) return null;
  return (
    <div className="hidden print:block">
      <table className="w-full border-collapse text-[8px]">
        <thead>
          <tr>
            {REGISTER_COLUMNS.map((column) => (
              <th
                key={column}
                className="border border-gray-400 bg-gray-100 px-1 py-1 text-left font-semibold uppercase [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={`${doc.document_type}-${doc.id}`}>
              {buildRegisterRow(doc).map((cell, i) => (
                <td
                  key={REGISTER_COLUMNS[i]}
                  className={`border border-gray-300 px-1 py-0.5 ${
                    i >= 6 ? "text-right tabular-nums" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
