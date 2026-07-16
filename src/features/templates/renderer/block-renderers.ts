// One render function per launch block type (columns is handled
// separately in render-document.ts since it needs to recurse into child
// block lists). Every renderer is a pure function: (block, data) => HTML
// fragment string, styled entirely through theme CSS custom properties
// (var(--t-primary), etc.) so a theme swap re-paints without touching
// this code.
import type { TemplateBlock } from "@/features/templates/types";
import type { DocumentRenderData, RenderLineItem } from "@/features/templates/renderer/types";
import { resolvePlaceholders } from "@/features/templates/renderer/placeholders";
import { escapeHtml, nl2br } from "@/features/templates/renderer/html-utils";
import { formatCurrency } from "@/lib/utils/format-currency";
import { evaluateVisibility } from "@/features/templates/renderer/visibility";

type Config = Record<string, unknown>;

function cfg<T>(config: Config, key: string, fallback: T): T {
  const value = config[key];
  return value === undefined ? fallback : (value as T);
}

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  invoice: "INVOICE",
  quotation: "QUOTATION",
  receipt: "RECEIPT",
  purchase_order: "PURCHASE ORDER",
  delivery_order: "DELIVERY ORDER",
};

function renderLogo(block: TemplateBlock, data: DocumentRenderData): string {
  const alignment = cfg<string>(block.config, "alignment", "left");
  const maxHeight = cfg(block.config, "max_height_mm", 20);
  if (!data.company.logo_url) return "";
  return `<div style="text-align:${alignment}"><img src="${escapeHtml(data.company.logo_url)}" style="max-height:${maxHeight}mm; max-width:100%;" alt="${escapeHtml(data.company.name)}"></div>`;
}

function renderCompanyInfo(block: TemplateBlock, data: DocumentRenderData): string {
  const fields = cfg<string[]>(block.config, "fields", ["name", "address", "phone", "email"]);
  const showLabels = cfg(block.config, "show_labels", false);
  const layout = cfg<string>(block.config, "layout", "stacked");

  const lines: string[] = [];
  for (const field of fields) {
    let value = "";
    let label = "";
    switch (field) {
      case "name":
        value = data.company.name;
        break;
      case "address": {
        const a = data.company.address;
        if (!a) continue;
        const parts = [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean);
        value = parts.join(", ");
        break;
      }
      case "phone":
        value = data.company.phone ?? "";
        label = "Phone";
        break;
      case "email":
        value = data.company.email ?? "";
        label = "Email";
        break;
      case "website":
        value = data.company.website ?? "";
        label = "Website";
        break;
      case "tax_id":
        value = data.company.tax_id ?? "";
        label = "Tax ID";
        break;
      case "registration":
        value = data.company.registration_number ?? "";
        label = "Reg. No.";
        break;
      case "tagline":
        value = data.workspace_branding?.tagline ?? "";
        break;
    }
    if (!value) continue;
    const text = showLabels && label ? `${label}: ${escapeHtml(value)}` : escapeHtml(value);
    const style = field === "name"
      ? "font-weight:var(--t-heading-weight); color:var(--t-text);"
      : field === "tagline"
        ? "font-style:italic; color:var(--t-muted); font-size:9pt;"
        : "color:var(--t-muted);";
    lines.push(`<div style="${style}">${text}</div>`);
  }

  const wrapperStyle = layout === "inline" ? "display:flex; gap:8px; flex-wrap:wrap;" : "";
  return `<div style="${wrapperStyle}">${lines.join("")}</div>`;
}

function renderClientInfo(block: TemplateBlock, data: DocumentRenderData): string {
  const heading = cfg(block.config, "heading", "Bill To");
  const fields = cfg<string[]>(block.config, "fields", ["name", "company", "email", "address"]);
  const showLabels = cfg(block.config, "show_labels", false);

  const lines: string[] = [];
  for (const field of fields) {
    let value = "";
    let label = "";
    switch (field) {
      case "name":
        value = data.client.name;
        break;
      case "company":
        value = data.client.company ?? "";
        break;
      case "email":
        value = data.client.email ?? "";
        label = "Email";
        break;
      case "phone":
        value = data.client.phone ?? "";
        label = "Phone";
        break;
      case "tax_id":
        value = data.client.tax_id ?? "";
        label = "Tax ID";
        break;
      case "address": {
        const a = data.client.address;
        if (!a) continue;
        const parts = [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean);
        value = parts.join(", ");
        break;
      }
    }
    if (!value) continue;
    const text = showLabels && label ? `${label}: ${escapeHtml(value)}` : escapeHtml(value);
    lines.push(`<div>${text}</div>`);
  }

  return `
    <div>
      <div style="font-size:8pt; text-transform:uppercase; letter-spacing:.5px; color:var(--t-muted); margin-bottom:3px;">${escapeHtml(heading)}</div>
      <div style="color:var(--t-text);">${lines.join("")}</div>
    </div>`;
}

function formatDocDate(value: string | undefined, format: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return format.replace(/DD/g, dd).replace(/MMM/g, months[date.getMonth()]).replace(/MM/g, mm).replace(/YYYY/g, yyyy);
}

function renderDocumentMeta(block: TemplateBlock, data: DocumentRenderData): string {
  const showLabel = cfg(block.config, "show_document_type_label", true);
  const customLabel = cfg<string | undefined>(block.config, "document_type_label", undefined);
  const fields = cfg<string[]>(block.config, "fields", ["number", "date", "due_date"]);
  const layout = cfg<string>(block.config, "layout", "stacked");
  const dateFormat = cfg(block.config, "date_format", "DD MMM YYYY");

  const rows: { label: string; value: string }[] = [];
  for (const field of fields) {
    let label = "";
    let value = "";
    switch (field) {
      case "number":
        label = "No.";
        value = data.document.number;
        break;
      case "date":
        label = "Date";
        value = formatDocDate(data.document.date, dateFormat);
        break;
      case "due_date":
        label = "Due Date";
        value = formatDocDate(data.document.due_date, dateFormat);
        break;
      case "expiry_date":
        label = "Valid Until";
        value = formatDocDate(data.document.expiry_date, dateFormat);
        break;
      case "version":
        label = "Version";
        value = data.document.version ? `v${data.document.version}` : "";
        break;
      case "status":
        label = "Status";
        value = data.document.status;
        break;
      case "reference":
        label = "Reference";
        value = "";
        break;
    }
    if (!value) continue;
    rows.push({ label, value });
  }

  const title = customLabel || DOCUMENT_TYPE_LABEL[data.document_type] || data.document_type.toUpperCase();
  const heading = showLabel
    ? `<div style="font-size:20pt; font-weight:var(--t-heading-weight); color:var(--t-primary); letter-spacing:1px;">${escapeHtml(title)}</div>`
    : "";

  const rowsHtml =
    layout === "table"
      ? `<table style="margin-left:auto; font-size:9pt;">${rows
          .map((r) => `<tr><td style="color:var(--t-muted); padding-right:8px; text-align:right;">${escapeHtml(r.label)}</td><td style="text-align:right; color:var(--t-text);">${escapeHtml(r.value)}</td></tr>`)
          .join("")}</table>`
      : rows.map((r) => `<div style="font-size:9pt; color:var(--t-muted);">${escapeHtml(r.value)}</div>`).join("");

  return `<div style="text-align:right;">${heading}${rowsHtml}</div>`;
}

const COLUMN_LABEL_DEFAULTS: Record<string, string> = {
  description: "Description",
  quantity: "Qty",
  unit: "Unit",
  unit_price: "Price",
  discount: "Discount",
  tax: "Tax",
  total: "Total",
};

function renderLineItemsTable(block: TemplateBlock, data: DocumentRenderData): string {
  const columns = cfg<string[]>(block.config, "columns", ["description", "quantity", "unit_price", "total"]);
  const columnLabels = cfg<Record<string, string>>(block.config, "column_labels", {});
  const showRowNumbers = cfg(block.config, "show_row_numbers", false);
  const alternateShading = cfg(block.config, "alternate_row_shading", false);
  const currency = data.document.currency;

  const cellValue = (item: RenderLineItem, column: string): string => {
    switch (column) {
      case "description":
        return escapeHtml(item.description);
      case "quantity":
        return String(item.quantity);
      case "unit":
        return escapeHtml(item.unit ?? "");
      case "unit_price":
        return formatCurrency(item.unit_price, currency);
      case "discount":
        return item.discount_percent ? `${item.discount_percent}%` : "";
      case "tax":
        return item.tax_percent ? `${item.tax_percent}%` : "";
      case "total":
        return formatCurrency(item.line_total, currency);
      default:
        return "";
    }
  };

  const alignRight = new Set(["quantity", "unit_price", "discount", "tax", "total"]);

  const headerCells = [
    showRowNumbers ? `<th style="width:24px;">#</th>` : "",
    ...columns.map(
      (c) =>
        `<th style="text-align:${alignRight.has(c) ? "right" : "left"}; font-size:8pt; text-transform:uppercase; color:var(--t-muted); padding:6px 4px;">${escapeHtml(columnLabels[c] ?? COLUMN_LABEL_DEFAULTS[c] ?? c)}</th>`
    ),
  ].join("");

  const bodyRows = data.line_items
    .map((item, index) => {
      const rowBg = alternateShading && index % 2 === 1 ? "background:var(--t-surface);" : "";
      const cells = [
        showRowNumbers ? `<td style="padding:6px 4px; color:var(--t-muted);">${index + 1}</td>` : "",
        ...columns.map((c) => `<td style="padding:6px 4px; text-align:${alignRight.has(c) ? "right" : "left"};">${cellValue(item, c)}</td>`),
      ].join("");
      return `<tr style="border-bottom:1px solid var(--t-border); ${rowBg}">${cells}</tr>`;
    })
    .join("");

  return `
    <table style="width:100%; border-collapse:collapse; font-size:9pt;">
      <thead><tr style="border-bottom:2px solid var(--t-primary);">${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

const TOTALS_ROW_DEFAULTS: Record<string, string> = {
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Tax",
  total: "Total",
  amount_paid: "Amount Paid",
  balance_due: "Balance Due",
};

function renderTotals(block: TemplateBlock, data: DocumentRenderData): string {
  const rows = cfg<string[]>(block.config, "rows", ["subtotal", "tax", "total"]);
  const rowLabels = cfg<Record<string, string>>(block.config, "row_labels", {});
  const widthPercent = cfg(block.config, "width_percent", 40);
  const currency = data.document.currency;

  const rowValue = (row: string): number | null => {
    switch (row) {
      case "subtotal":
        return data.document.subtotal;
      case "discount":
        return data.document.discount_amount || null; // hidden below when 0
      case "tax":
        return data.document.tax_amount || null;
      case "total":
        return data.document.total;
      case "amount_paid":
        return data.document.amount_paid ?? null;
      case "balance_due":
        return data.document.amount_due ?? null;
      default:
        return null;
    }
  };

  const html = rows
    .map((row) => {
      // Rows with an inherent "hide when zero/empty" business rule per
      // the architecture's two-levels-of-conditionality decision — the
      // whole totals block stays visible even when one row is empty.
      if (row === "discount" && !data.document.discount_amount) return "";
      if (row === "tax" && !data.document.tax_amount) return "";
      if (row === "amount_paid" && (data.document.amount_paid ?? 0) === 0) return "";
      if (row === "balance_due" && (data.document.amount_due ?? 0) === 0) return "";

      const value = rowValue(row);
      if (value === null) return "";

      const isTotal = row === "total";
      const label = rowLabels[row] ?? TOTALS_ROW_DEFAULTS[row] ?? row;
      const style = isTotal
        ? "font-weight:var(--t-heading-weight); font-size:11pt; padding:6px 0; border-top:2px solid var(--t-primary); margin-top:4px; color:var(--t-primary);"
        : "font-size:9pt; padding:3px 0; color:var(--t-text);";

      return `<div style="display:flex; justify-content:space-between; ${style}"><span style="color:var(--t-muted);">${escapeHtml(label)}</span><span>${formatCurrency(value, currency)}</span></div>`;
    })
    .join("");

  return `<div style="display:flex; justify-content:flex-end;"><div style="width:${widthPercent}%;">${html}</div></div>`;
}

function renderPaymentInfo(block: TemplateBlock, data: DocumentRenderData): string {
  const showTerms = cfg(block.config, "show_payment_terms", true);
  const showBankDetails = cfg(block.config, "show_bank_details", true);
  const showQris = cfg(block.config, "show_qris", true);
  const blockBank = cfg<Record<string, string> | undefined>(block.config, "bank_details", undefined);
  const blockInstructions = cfg<string | undefined>(block.config, "custom_instructions", undefined);
  const wp = data.workspace_payment_details;

  const parts: string[] = [];

  if (showTerms && data.document.payment_terms) {
    parts.push(`<div style="margin-bottom:6px;">${nl2br(data.document.payment_terms)}</div>`);
  }

  if (showBankDetails) {
    if (wp?.bank_accounts?.length) {
      const account = wp.bank_accounts.find((a) => a.is_primary) ?? wp.bank_accounts[0];
      const rows = [
        `Bank: ${account.bank_name}`,
        `Account Name: ${account.account_name}`,
        `Account No.: ${account.account_number}`,
        account.swift_code ? `SWIFT: ${account.swift_code}` : "",
      ].filter(Boolean);
      parts.push(`<div style="font-size:9pt; color:var(--t-muted);">${rows.map(escapeHtml).join("<br>")}</div>`);
    } else if (blockBank) {
      const rows = [
        blockBank.bank_name ? `Bank: ${blockBank.bank_name}` : "",
        blockBank.account_name ? `Account Name: ${blockBank.account_name}` : "",
        blockBank.account_number ? `Account No.: ${blockBank.account_number}` : "",
        blockBank.swift_code ? `SWIFT: ${blockBank.swift_code}` : "",
      ].filter(Boolean);
      parts.push(`<div style="font-size:9pt; color:var(--t-muted);">${rows.map(escapeHtml).join("<br>")}</div>`);
    }
  }

  if (showQris && wp?.qris_image_url) {
    parts.push(`<div style="text-align:center; margin-top:8px;"><img src="${escapeHtml(wp.qris_image_url)}" style="max-width:120px;" alt="QRIS" /></div>`);
  }

  const instructions = wp?.custom_instructions || blockInstructions;
  if (instructions) {
    parts.push(`<div>${resolvePlaceholders(instructions, data)}</div>`);
  }

  if (parts.length === 0) return "";

  return `<div><div style="font-size:8pt; text-transform:uppercase; color:var(--t-muted); margin-bottom:4px;">Payment Information</div>${parts.join("")}</div>`;
}

function renderPaymentSummary(block: TemplateBlock, data: DocumentRenderData): string {
  const columns = cfg<string[]>(block.config, "columns", ["date", "method", "amount"]);
  const showTotal = cfg(block.config, "show_total_paid", true);
  const payments = data.payments ?? [];
  if (payments.length === 0) return "";

  const currency = data.document.currency;
  const labelFor: Record<string, string> = { date: "Date", method: "Method", reference: "Reference", amount: "Amount" };

  const header = columns.map((c) => `<th style="text-align:${c === "amount" ? "right" : "left"}; font-size:8pt; color:var(--t-muted); padding:4px;">${labelFor[c]}</th>`).join("");
  const rows = payments
    .map((p) => {
      const cells = columns
        .map((c) => {
          const v = c === "amount" ? formatCurrency(p.amount, currency) : c === "date" ? p.date : c === "method" ? p.method : p.reference ?? "";
          return `<td style="padding:4px; text-align:${c === "amount" ? "right" : "left"};">${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr style="border-bottom:1px solid var(--t-border);">${cells}</tr>`;
    })
    .join("");

  const total = showTotal
    ? `<div style="text-align:right; font-weight:var(--t-heading-weight); margin-top:4px;">Total Paid: ${formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0), currency)}</div>`
    : "";

  return `<table style="width:100%; border-collapse:collapse; font-size:9pt;"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>${total}`;
}

function renderSignature(block: TemplateBlock, _data: DocumentRenderData): string {
  const signatures = cfg<{ label: string; show_name_line?: boolean; show_date_line?: boolean; show_title_line?: boolean }[]>(block.config, "signatures", []);
  const layout = cfg<string>(block.config, "layout", "side_by_side");

  const box = (sig: { label: string; show_name_line?: boolean; show_date_line?: boolean; show_title_line?: boolean }) => `
    <div style="flex:1;">
      <div style="border-bottom:1px solid var(--t-text); height:40px;"></div>
      <div style="font-size:9pt; color:var(--t-muted); margin-top:4px;">${escapeHtml(sig.label)}</div>
      ${sig.show_name_line ? `<div style="font-size:8pt; color:var(--t-muted);">Name</div>` : ""}
      ${sig.show_date_line ? `<div style="font-size:8pt; color:var(--t-muted);">Date</div>` : ""}
      ${sig.show_title_line ? `<div style="font-size:8pt; color:var(--t-muted);">Title</div>` : ""}
    </div>`;

  const wrapperStyle = layout === "side_by_side" ? "display:flex; gap:24px;" : "display:flex; flex-direction:column; gap:16px;";
  return `<div style="${wrapperStyle}">${signatures.map(box).join("")}</div>`;
}

const NOTES_HEADING_DEFAULTS: Record<string, string> = {
  notes: "Notes",
  terms_and_conditions: "Terms & Conditions",
  payment_terms: "Payment Terms",
  internal_notes: "Internal Notes",
  summary: "Summary",
  custom: "",
};

function renderNotes(block: TemplateBlock, data: DocumentRenderData): string {
  const source = cfg<string>(block.config, "source", "notes");
  const heading = cfg<string | undefined>(block.config, "heading", undefined);
  const customContent = cfg<string | undefined>(block.config, "custom_content", undefined);

  let content = "";
  switch (source) {
    case "notes":
      content = data.document.notes ?? "";
      break;
    case "terms_and_conditions":
      content = data.document.terms ?? "";
      break;
    case "payment_terms":
      content = data.document.payment_terms ?? "";
      break;
    case "summary":
      content = data.document.summary ?? "";
      break;
    case "custom":
      content = customContent ? resolvePlaceholders(customContent, data) : "";
      break;
  }
  // Note: workspace default terms are NOT used as fallback here because
  // they auto-populate into the document form at creation time (M4).
  // By the time the renderer sees the document, the defaults have
  // already been written into the document's own fields if applicable.
  if (!content) return "";

  const headingText = heading ?? NOTES_HEADING_DEFAULTS[source] ?? "";
  const headingHtml = headingText
    ? `<div style="font-size:8pt; text-transform:uppercase; color:var(--t-muted); margin-bottom:4px;">${escapeHtml(headingText)}</div>`
    : "";

  return `<div>${headingHtml}<div style="font-size:9pt; color:var(--t-text);">${nl2br(content)}</div></div>`;
}

function renderText(block: TemplateBlock, data: DocumentRenderData): string {
  const content = cfg(block.config, "content", "");
  const alignment = cfg<string>(block.config, "alignment", "left");
  if (!content) return "";
  return `<div style="text-align:${alignment};">${resolvePlaceholders(content, data)}</div>`;
}

function renderDivider(block: TemplateBlock, _data: DocumentRenderData): string {
  const lineStyle = cfg<string>(block.config, "line_style", "solid");
  const thickness = cfg(block.config, "thickness_px", 1);
  const color = cfg<string | undefined>(block.config, "color", undefined);
  return `<hr style="border:none; border-top:${thickness}px ${lineStyle} ${color ?? "var(--t-border)"}; margin:0;">`;
}

function renderSpacer(block: TemplateBlock, _data: DocumentRenderData): string {
  const height = cfg(block.config, "height_mm", 8);
  return `<div style="height:${height}mm;"></div>`;
}

function renderWatermark(block: TemplateBlock, _data: DocumentRenderData): string {
  const text = cfg(block.config, "text", "");
  const fontSize = cfg(block.config, "font_size_pt", 72);
  const rotation = cfg(block.config, "rotation_deg", -30);
  const opacity = cfg(block.config, "opacity", 0.06);
  const color = cfg<string | undefined>(block.config, "color", undefined);
  if (!text) return "";

  return `<div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(${rotation}deg); font-size:${fontSize}pt; font-weight:800; color:${color ?? "var(--t-muted)"}; opacity:${opacity}; pointer-events:none; z-index:0; white-space:nowrap;">${escapeHtml(text)}</div>`;
}

function renderFooter(block: TemplateBlock, data: DocumentRenderData): string {
  const content = cfg(block.config, "content", "");
  const showPageNumbers = cfg(block.config, "show_page_numbers", false);
  const format = cfg(block.config, "page_number_format", "Page {n} of {total}");
  const alignment = cfg<string>(block.config, "alignment", "center");
  const borderTop = cfg(block.config, "border_top", true);

  const pageNumberHtml = showPageNumbers
    ? `<div style="font-size:8pt; color:var(--t-muted);">${escapeHtml(format.replace("{n}", "1").replace("{total}", "1"))}</div>`
    : "";

  return `<div style="text-align:${alignment}; ${borderTop ? "border-top:1px solid var(--t-border); padding-top:8px;" : ""} font-size:8pt; color:var(--t-muted);">
    ${content ? `<div>${resolvePlaceholders(content, data)}</div>` : ""}
    ${pageNumberHtml}
  </div>`;
}

export const BLOCK_RENDERERS: Record<string, (block: TemplateBlock, data: DocumentRenderData) => string> = {
  logo: renderLogo,
  company_info: renderCompanyInfo,
  client_info: renderClientInfo,
  document_meta: renderDocumentMeta,
  line_items_table: renderLineItemsTable,
  totals: renderTotals,
  payment_info: renderPaymentInfo,
  payment_summary: renderPaymentSummary,
  signature: renderSignature,
  notes: renderNotes,
  text: renderText,
  divider: renderDivider,
  spacer: renderSpacer,
  watermark: renderWatermark,
  footer: renderFooter,
};

export function isBlockVisible(block: TemplateBlock, data: DocumentRenderData): boolean {
  return block.enabled && evaluateVisibility(block.visibility, data);
}
