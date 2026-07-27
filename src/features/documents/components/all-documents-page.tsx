"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ListEmpty } from "@/components/shared/list-empty";
import { StatusBadge } from "@/components/shared/status-badge";
import { useWorkspace } from "@/providers/workspace-provider";
import { formatCurrency } from "@/lib/utils/format-currency";
import {
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_TYPE_ROUTE,
  type AnyDocument,
} from "@/features/documents/document-types";
import { DocumentFilterBar } from "@/features/documents/components/document-filter-bar";
import {
  REGISTER_COLUMNS,
  buildRegisterRow,
  downloadCsv,
  toCsv,
} from "@/features/documents/register-export";

/** Rows are keyed across types — ids are only unique within a table. */
const rowKey = (doc: AnyDocument) => `${doc.document_type}:${doc.id}`;

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
    id: "payment_date",
    header: "Paid On",
    cell: ({ row }) =>
      row.original.payment_date
        ? new Date(row.original.payment_date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
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
 * Every document in the workspace in one filterable, exportable table.
 *
 * Filters live in the URL (see DocumentFilterBar) and are applied by the
 * server query. Selection is local state — a tick-box choice is about
 * "what am I exporting right now", not a view worth linking to.
 */
export function AllDocumentsPage({
  documents,
  projects,
}: {
  documents: AnyDocument[];
  projects: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const statuses = useMemo(
    () => [...new Set(documents.map((d) => d.status))].sort(),
    [documents]
  );

  // Nothing ticked means "everything in view" — the common case is
  // exporting the filtered set, and forcing a select-all first would be
  // a step with no decision in it.
  const exportable = useMemo(
    () =>
      selectedIds.size === 0
        ? documents
        : documents.filter((doc) => selectedIds.has(rowKey(doc))),
    [documents, selectedIds]
  );

  function handleExport() {
    const csv = toCsv(REGISTER_COLUMNS, exportable.map(buildRegisterRow));
    const project = searchParams.get("project");
    const type = searchParams.get("type");
    const scope = [
      project ? projects.find((p) => p.id === project)?.code : null,
      type ? DOCUMENT_TYPE_LABEL[type as keyof typeof DOCUMENT_TYPE_LABEL] : null,
      selectedIds.size > 0 ? "selected" : null,
    ]
      .filter(Boolean)
      .join(" - ");
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(scope ? `Register ${scope} ${today}` : `Register ${today}`, csv);
  }

  return (
    <div className="space-y-4">
      {/* A 17-column register doesn't fit portrait. Scoped to this page by
          being mounted only here — the global @page rule (A4 portrait,
          globals.css) still governs printed documents. */}
      <style>{"@media print { @page { size: A4 landscape; } }"}</style>

      <DocumentFilterBar projects={projects} statuses={statuses} />

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <span className="text-sm text-muted-foreground">
          {selectedIds.size > 0
            ? `${selectedIds.size} of ${documents.length} selected`
            : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
        </span>
        {selectedIds.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportable.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export Excel ({exportable.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={exportable.length === 0}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Prints exactly what Export writes — selection included, so a
          printout and a spreadsheet of the same moment agree. */}
      <RegisterPrintTable documents={exportable} />

      <div className="print:hidden">
        {documents.length === 0 ? (
          <ListEmpty
            message={
              searchParams.size > 0
                ? "No documents match these filters."
                : "Documents you create will appear here."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={documents}
            selection={{
              selectedIds,
              onSelectedIdsChange: setSelectedIds,
              getId: rowKey,
            }}
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
            <tr key={rowKey(doc)}>
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
