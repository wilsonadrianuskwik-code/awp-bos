import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllDocuments } from "@/features/documents/all-documents-queries";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  type DocumentType,
} from "@/features/documents/document-types";
import {
  FIRST_AMOUNT_COLUMN,
  REGISTER_COLUMNS,
  registerValues,
} from "@/features/documents/register-export";

/**
 * The register as a real .xlsx workbook.
 *
 * Built server-side rather than in the browser: ExcelJS is a large
 * dependency, and generating here keeps it out of the client bundle
 * entirely. It also means the export re-runs the same query the page
 * did, so a filtered export can never disagree with what was on screen.
 *
 * Reads go through the request's Supabase session, so RLS scopes the
 * data exactly as it does everywhere else — this route grants nothing a
 * user couldn't already see.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    return new NextResponse("Not found", { status: 404 });
  }

  const sp = new URL(request.url).searchParams;
  const documentType = DOCUMENT_TYPES.includes(sp.get("type") as DocumentType)
    ? (sp.get("type") as DocumentType)
    : undefined;
  const number = (value: string | null) => {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : undefined;
  };

  const documents = await getAllDocuments(workspace.id, {
    projectId: sp.get("project") ?? undefined,
    documentType,
    search: sp.get("q") ?? undefined,
    dateFrom: sp.get("from") ?? undefined,
    dateTo: sp.get("to") ?? undefined,
    amountMin: number(sp.get("min")),
    amountMax: number(sp.get("max")),
    paidFrom: sp.get("paidFrom") ?? undefined,
    paidTo: sp.get("paidTo") ?? undefined,
    status: sp.get("status") ?? undefined,
  });

  // Tick-box selection travels as "type:id" pairs. Absent means "whatever
  // the filters matched", matching the page's own default.
  const ids = sp.get("ids");
  const selected = ids ? new Set(ids.split(",")) : null;
  const rows = selected
    ? documents.filter((doc) => selected.has(`${doc.document_type}:${doc.id}`))
    : documents;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = workspace.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Register", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  sheet.addRow([...REGISTER_COLUMNS]);
  for (const doc of rows) {
    sheet.addRow(registerValues(doc));
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 10 };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 28;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F5EC" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0B0B0" } },
      left: { style: "thin", color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      right: { style: "thin", color: { argb: "FFB0B0B0" } },
    };
  });

  REGISTER_COLUMNS.forEach((label, i) => {
    const column = sheet.getColumn(i + 1);
    // Dates (TANGGAL, TERIMA) and money each get a format Excel can
    // still calculate with — no formatting is applied as text.
    if (label === "TANGGAL" || label === "TERIMA") {
      column.numFmt = "dd/mm/yyyy";
      column.width = 12;
    } else if (i >= FIRST_AMOUNT_COLUMN) {
      column.numFmt = "#,##0";
      column.width = 16;
    } else if (label === "BILL TO" || label === "DESKRIPSI") {
      column.width = 28;
    } else {
      column.width = 18;
    }
    column.alignment = {
      vertical: "middle",
      horizontal: i >= FIRST_AMOUNT_COLUMN ? "right" : "left",
    };
  });

  // Excel's own filter dropdowns on the header row, so the recipient can
  // keep slicing the register after it leaves the app.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: REGISTER_COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const scope = [
    sp.get("project") ? "project" : null,
    documentType ? DOCUMENT_TYPE_LABEL[documentType] : null,
    selected ? "selected" : null,
  ]
    .filter(Boolean)
    .join(" - ");
  const today = new Date().toISOString().slice(0, 10);
  const filename = `Register${scope ? ` ${scope}` : ""} ${today}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
