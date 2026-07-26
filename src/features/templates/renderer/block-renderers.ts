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
import { STATUS_TONE, TONE_HEX } from "@/components/shared/status-badge";

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

// Semantic status colors, deliberately fixed (not theme-driven) — a
// "paid" badge should read as unambiguously green regardless of which
// brand accent a workspace has chosen, the same convention Xero/Zoho use.
// Derived from the app's own STATUS_TONE/TONE_HEX (status-badge.tsx)
// instead of a second hardcoded map, so a print doc and the app UI can
// never disagree on what color a status is.
const STATUS_BADGE: Record<string, { bg: string; text: string }> = Object.fromEntries(
  Object.entries(STATUS_TONE).map(([status, tone]) => [status, TONE_HEX[tone]])
);

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
      ? "font-family:var(--t-heading-font); font-size:12.5pt; font-weight:var(--t-heading-weight); color:var(--t-text); margin-bottom:2px;"
      : field === "tagline"
        ? "font-style:italic; color:var(--t-muted); font-size:9pt; margin-bottom:4px;"
        : "color:var(--t-muted); font-size:9pt; line-height:1.5;";
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
    const lineStyle =
      field === "name"
        ? "font-weight:600; color:var(--t-text); margin-bottom:1px;"
        : "color:var(--t-text); font-size:9pt; line-height:1.5;";
    lines.push(`<div style="${lineStyle}">${text}</div>`);
  }

  const headingHtml = heading
    ? `<div style="font-size:8pt; text-transform:uppercase; letter-spacing:.5px; color:var(--t-muted); margin-bottom:4px;">${escapeHtml(heading)}</div>`
    : "";

  return `
    <div>
      ${headingHtml}
      <div>${lines.join("")}</div>
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

// Full document-type word used for verbose metadata labels
// ("Invoice Number" / "Quotation Date"), matching how Xero/Zoho label
// their header metadata — distinct from the short DOCUMENT_TYPE_LABEL
// used for the big all-caps title.
const DOC_WORD: Record<string, string> = {
  invoice: "Invoice",
  quotation: "Quotation",
  receipt: "Receipt",
  purchase_order: "Purchase Order",
  delivery_order: "Delivery Order",
};

function renderDocumentMeta(block: TemplateBlock, data: DocumentRenderData): string {
  const showLabel = cfg(block.config, "show_document_type_label", true);
  const customLabel = cfg<string | undefined>(block.config, "document_type_label", undefined);
  const showStatus = cfg(block.config, "show_status_badge", true);
  const fields = cfg<string[]>(block.config, "fields", ["number", "date", "due_date"]);
  const layout = cfg<string>(block.config, "layout", "stacked");
  const align = cfg<string>(block.config, "align", "right");
  const titleSize = cfg(block.config, "title_size_pt", 20);
  const dateFormat = cfg(block.config, "date_format", "DD MMM YYYY");

  const docWord = DOC_WORD[data.document_type] ?? "Document";
  // Verbose labels for the "labeled" layout, terse ones otherwise.
  const labeled = layout === "labeled";
  const rows: { label: string; value: string }[] = [];
  for (const field of fields) {
    let label = "";
    let value = "";
    switch (field) {
      case "number":
        label = labeled ? `${docWord} Number` : "No.";
        value = data.document.number;
        break;
      case "date":
        label = labeled ? `${docWord} Date` : "Date";
        value = formatDocDate(data.document.date, dateFormat);
        break;
      case "due_date":
        label = "Due Date";
        value = formatDocDate(data.document.due_date, dateFormat);
        break;
      case "expiry_date":
        label = labeled ? "Valid Until" : "Valid Until";
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

  // Title mirrors Xero: draft documents read "DRAFT INVOICE"; issued
  // ones just "INVOICE". The status pill is only shown for issued docs
  // (a draft badge would be redundant with the title word).
  const baseTitle = customLabel || DOCUMENT_TYPE_LABEL[data.document_type] || data.document_type.toUpperCase();
  const isDraft = data.document.status === "draft";
  const titleText = isDraft ? `DRAFT ${baseTitle}` : baseTitle;
  const badge = STATUS_BADGE[data.document.status];
  const statusHtml =
    showStatus && !isDraft && badge
      ? `<span class="tpl-badge" style="background:${badge.bg}; color:${badge.text};">${escapeHtml(data.document.status.replace(/_/g, " "))}</span>`
      : "";

  const justify = align === "right" ? "flex-end" : "flex-start";
  const heading = showLabel
    ? `<div style="display:flex; align-items:center; gap:10px; justify-content:${justify}; flex-wrap:wrap;"><span style="font-family:var(--t-heading-font); font-size:${titleSize}pt; font-weight:var(--t-heading-weight); color:var(--t-primary); letter-spacing:.5px; line-height:1.1;">${escapeHtml(titleText)}</span>${statusHtml}</div>`
    : "";

  let rowsHtml = "";
  if (labeled) {
    rowsHtml = rows
      .map(
        (r) =>
          `<div style="margin-bottom:9px;"><div style="font-size:8.5pt; font-weight:600; color:var(--t-text);">${escapeHtml(r.label)}</div><div class="tpl-num" style="font-size:9.5pt; color:var(--t-muted);">${escapeHtml(r.value)}</div></div>`
      )
      .join("");
  } else if (layout === "table") {
    const mlAuto = align === "right" ? "margin-left:auto;" : "";
    rowsHtml = `<table class="tpl-num" style="${mlAuto} font-size:9pt;">${rows
      .map(
        (r) =>
          `<tr><td style="color:var(--t-muted); padding-right:8px; padding-top:2px; text-align:${align};">${escapeHtml(r.label)}</td><td style="text-align:${align}; padding-top:2px; color:var(--t-text);">${escapeHtml(r.value)}</td></tr>`
      )
      .join("")}</table>`;
  } else {
    rowsHtml = rows.map((r) => `<div style="font-size:9pt; color:var(--t-muted);">${escapeHtml(r.value)}</div>`).join("");
  }

  const spacer = heading && rowsHtml ? `<div style="margin-top:${labeled ? 14 : 8}px;">${rowsHtml}</div>` : rowsHtml;
  return `<div style="text-align:${align};">${heading}${spacer}</div>`;
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
  const alternateShadingConfig = cfg(block.config, "alternate_row_shading", false);
  const currency = data.document.currency;
  const tableStyle = data.theme_style?.table_style ?? "lined";
  const headerBorder = data.theme_style?.header_border ?? true;
  const alternateShading = alternateShadingConfig || tableStyle === "striped";

  const showCurrencyInAmountHeader = cfg(block.config, "show_currency_in_amount_header", false);

  const cellValue = (item: RenderLineItem, column: string): string => {
    switch (column) {
      case "description": {
        // Descriptions are often multi-line (e.g. a headline plus
        // "Duration / Date / Time" detail lines, as in a court-rental
        // invoice). The first line reads as the item; the rest render as
        // muted supporting detail, the way Xero/Zoho stack line notes.
        const lines = item.description.split("\n");
        const first = escapeHtml(lines[0] ?? "");
        const rest = lines.slice(1).filter((l) => l.trim() !== "");
        const firstHtml = `<div style="color:var(--t-text);">${first}</div>`;
        const restHtml = rest.length
          ? `<div style="margin-top:2px; font-size:8.5pt; line-height:1.5; color:var(--t-muted);">${rest.map(escapeHtml).join("<br>")}</div>`
          : "";
        return firstHtml + restHtml;
      }
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

  const headerLabel = (c: string): string => {
    const custom = columnLabels[c];
    if (custom) return custom;
    if (c === "total" && showCurrencyInAmountHeader) return `Amount ${currency}`;
    return COLUMN_LABEL_DEFAULTS[c] ?? c;
  };

  const alignRight = new Set(["quantity", "unit_price", "discount", "tax", "total"]);
  const isNumeric = new Set(["quantity", "unit_price", "total"]);

  // table_style shapes the whole table's structure, not just its color —
  // this is the one place a theme's `borders.table_style` choice actually
  // changes markup, everything else is CSS-variable repaint only.
  const headerBg = tableStyle === "bordered" || tableStyle === "striped" ? "background:var(--t-surface);" : "";
  const headerBorderBottom =
    tableStyle === "none"
      ? "none"
      : tableStyle === "minimal"
        ? "1px solid var(--t-border)"
        : headerBorder
          ? "2px solid var(--t-primary)"
          : "1px solid var(--t-border)";
  const cellBorder = tableStyle === "bordered" ? "border:1px solid var(--t-border);" : "";
  const rowBorderBottom = tableStyle === "lined" || tableStyle === "striped" ? "border-bottom:1px solid var(--t-border);" : "";
  const tableBorder = tableStyle === "bordered" ? "border:1px solid var(--t-border);" : "";
  const cellPadding = tableStyle === "none" || tableStyle === "minimal" ? "10px 6px" : "9px 6px";

  const headerCells = [
    showRowNumbers ? `<th style="width:24px; padding:${cellPadding}; ${headerBg} border-bottom:${headerBorderBottom};">#</th>` : "",
    ...columns.map(
      (c) =>
        `<th style="text-align:${alignRight.has(c) ? "right" : "left"}; font-size:8pt; text-transform:uppercase; letter-spacing:.4px; color:var(--t-muted); font-weight:600; padding:${cellPadding}; ${headerBg} border-bottom:${headerBorderBottom};">${escapeHtml(headerLabel(c))}</th>`
    ),
  ].join("");

  const colCount = (showRowNumbers ? 1 : 0) + columns.length;

  // Package breakdown: indented sub-rows under a package's own line,
  // read-only and priced entirely via the package line above — per the
  // product decision only "Termasuk dalam paket" (included) shows, never a
  // per-item price, so this never affects the total column above it.
  const breakdownRow = (item: RenderLineItem): string => {
    if (!item.package_breakdown || item.package_breakdown.length === 0) return "";
    const rows = item.package_breakdown
      .map((b) => {
        const noteHtml = b.note ? ` <span style="color:var(--t-muted);">— ${escapeHtml(b.note)}</span>` : "";
        return `
          <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:3px 0;">
            <span style="color:var(--t-text); opacity:.85;">↳ ${b.quantity}x ${escapeHtml(b.name)}${noteHtml}</span>
            <span style="flex-shrink:0; font-style:italic; font-size:8pt; color:var(--t-muted);">Termasuk dalam paket</span>
          </div>`;
      })
      .join("");
    return `
      <tr style="${rowBorderBottom}">
        <td colspan="${colCount}" style="padding:2px ${cellPadding.split(" ")[1]} 8px calc(${cellPadding.split(" ")[1]} + 14px); ${cellBorder}">
          <div style="font-size:8.5pt; line-height:1.5;">${rows}</div>
        </td>
      </tr>`;
  };

  const bodyRows = data.line_items
    .map((item, index) => {
      const rowBg = alternateShading && index % 2 === 1 ? "background:var(--t-surface);" : "";
      const cells = [
        showRowNumbers ? `<td style="padding:${cellPadding}; color:var(--t-muted); vertical-align:top; ${cellBorder}">${index + 1}</td>` : "",
        ...columns.map(
          (c) =>
            `<td class="${isNumeric.has(c) ? "tpl-num" : ""}" style="padding:${cellPadding}; text-align:${alignRight.has(c) ? "right" : "left"}; vertical-align:top; ${cellBorder}">${cellValue(item, c)}</td>`
        ),
      ].join("");
      return `<tr style="${rowBorderBottom} ${rowBg}">${cells}</tr>` + breakdownRow(item);
    })
    .join("");

  return `
    <table style="width:100%; border-collapse:collapse; font-size:9pt; ${tableBorder} border-radius:var(--t-radius); overflow:hidden;">
      <thead><tr>${headerCells}</tr></thead>
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
  // Indonesian breakdown (00082/00084). DPP/PPH/Retensi labels carry
  // their rate because it varies per document; PPN deliberately doesn't,
  // since it's a regulation constant.
  harga_jual: "Total Harga Jual",
  dpp: "DPP",
  ppn: "PPN",
  pph: "Potong PPH",
  retensi: "Potong Retensi",
};

// Withholdings print in parentheses — the accounting convention for a
// deduction, matching the paper document.
const NEGATIVE_TOTALS_ROWS = new Set(["pph", "retensi"]);

function renderTotals(block: TemplateBlock, data: DocumentRenderData): string {
  const rows = cfg<string[]>(block.config, "rows", ["subtotal", "tax", "total"]);
  const rowLabels = cfg<Record<string, string>>(block.config, "row_labels", {});
  const widthPercent = cfg(block.config, "width_percent", 42);
  const currencyInTotal = cfg(block.config, "show_currency_in_total_label", false);
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
      case "harga_jual":
        return data.document.harga_jual ?? null;
      case "dpp":
        return data.document.dpp_amount ?? null;
      case "ppn":
        return data.document.ppn_amount ?? null;
      case "pph":
        return data.document.pph_amount ?? null;
      case "retensi":
        return data.document.retensi_amount ?? null;
      default:
        return null;
    }
  };

  // The rate-bearing labels are built from the document's own stored
  // rates rather than hardcoded, so a document issued under a different
  // rate keeps printing the rate it was issued under.
  const dynamicLabel = (row: string, base: string): string => {
    if (row === "dpp") {
      const n = data.document.dpp_numerator;
      const d = data.document.dpp_denominator;
      return n && d ? `${base} ${n}/${d}` : base;
    }
    if (row === "pph" && data.document.pph_percent != null) {
      return `${base} ${Number(data.document.pph_percent)}%`;
    }
    if (row === "retensi" && data.document.retensi_percent != null) {
      return `${base} ${Number(data.document.retensi_percent)}%`;
    }
    return base;
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
      // "Not applicable" and "0%" are different statements on a printed
      // document, so an unset withholding is omitted entirely rather than
      // printing a misleading zero row.
      if (row === "pph" && data.document.pph_percent == null) return "";
      if (row === "retensi" && data.document.retensi_percent == null) return "";
      if (row === "dpp" && data.document.show_dpp === false) return "";

      const value = rowValue(row);
      if (value === null) return "";

      const isTotal = row === "total";
      let label = dynamicLabel(row, rowLabels[row] ?? TOTALS_ROW_DEFAULTS[row] ?? row);
      if (isTotal && currencyInTotal) label = `${label} ${currency}`;
      const displayValue = NEGATIVE_TOTALS_ROWS.has(row)
        ? `(${formatCurrency(value, currency)})`
        : formatCurrency(value, currency);

      // Grand total gets a strong rule above it and the heading font,
      // matching the reference's "TOTAL MYR" treatment; the other rows
      // are quiet muted-label / dark-value pairs.
      if (isTotal) {
        return `<div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; padding-top:10px; border-top:2px solid var(--t-primary);"><span style="font-family:var(--t-heading-font); font-weight:var(--t-heading-weight); font-size:12.5pt; text-transform:uppercase; letter-spacing:.5px; color:var(--t-primary);">${escapeHtml(label)}</span><span style="font-family:var(--t-heading-font); font-weight:var(--t-heading-weight); font-size:12.5pt; color:var(--t-primary);">${formatCurrency(value, currency)}</span></div>`;
      }
      return `<div style="display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; font-size:9.5pt;"><span style="color:var(--t-muted);">${escapeHtml(label)}</span><span style="color:var(--t-text);">${displayValue}</span></div>`;
    })
    .join("");

  return `<div style="display:flex; justify-content:flex-end;"><div class="tpl-num" style="width:${widthPercent}%; min-width:240px;">${html}</div></div>`;
}

function renderPaymentInfo(block: TemplateBlock, data: DocumentRenderData): string {
  const showTerms = cfg(block.config, "show_payment_terms", true);
  const showBankDetails = cfg(block.config, "show_bank_details", true);
  const showQris = cfg(block.config, "show_qris", true);
  const blockBank = cfg<Record<string, string> | undefined>(block.config, "bank_details", undefined);
  const blockInstructions = cfg<string | undefined>(block.config, "custom_instructions", undefined);
  const wp = data.workspace_payment_details;

  const heading = cfg<string>(block.config, "heading", "Payment Details");

  const termsHtml =
    showTerms && data.document.payment_terms
      ? `<div style="margin-bottom:12px;"><div style="font-weight:600; font-size:9pt; margin-bottom:2px; color:var(--t-text);">Payment Terms</div><div style="font-size:9pt; color:var(--t-text);">${nl2br(data.document.payment_terms)}</div></div>`
      : "";

  const bankField = (label: string, value: string, numeric = false) =>
    `<div style="color:var(--t-muted);">${label}</div><div class="${numeric ? "tpl-num" : ""}" style="color:var(--t-text);">${escapeHtml(value)}</div>`;

  let bankGrid = "";
  const account = wp?.bank_accounts?.length ? wp.bank_accounts.find((a) => a.is_primary) ?? wp.bank_accounts[0] : null;
  const bank = account ?? blockBank;
  if (showBankDetails && bank) {
    const rows = [
      bank.bank_name ? bankField("Bank", bank.bank_name) : "",
      bank.account_name ? bankField("Account Name", bank.account_name) : "",
      bank.account_number ? bankField("Account No.", bank.account_number, true) : "",
      bank.swift_code ? bankField("SWIFT", bank.swift_code) : "",
    ].join("");
    bankGrid = `<div style="display:grid; grid-template-columns:auto 1fr; gap:4px 16px; font-size:9pt; max-width:340px;">${rows}</div>`;
  }

  const qrisHtml =
    showQris && wp?.qris_image_url
      ? `<div style="margin-top:12px;"><img src="${escapeHtml(wp.qris_image_url)}" style="max-width:110px;" alt="QRIS" /></div>`
      : "";

  const instructions = wp?.custom_instructions || blockInstructions;
  const instructionsHtml = instructions
    ? `<div style="margin-top:10px; font-size:9pt; color:var(--t-muted); line-height:1.5;">${resolvePlaceholders(instructions, data)}</div>`
    : "";

  const detailBody = [bankGrid, qrisHtml, instructionsHtml].join("");
  if (!termsHtml && !detailBody) return "";

  // Plain, un-boxed section (no card) with a subtle top rule — matching
  // the reference invoice's clean footer treatment rather than a
  // shaded panel.
  const detail = detailBody
    ? `<div style="font-size:8pt; text-transform:uppercase; letter-spacing:.5px; color:var(--t-muted); margin-bottom:6px;">${escapeHtml(heading)}</div>${detailBody}`
    : "";

  return `<div style="border-top:1px solid var(--t-border); padding-top:12px;">${termsHtml}${detail}</div>`;
}

function renderPaymentSummary(block: TemplateBlock, data: DocumentRenderData): string {
  const columns = cfg<string[]>(block.config, "columns", ["date", "method", "amount"]);
  const showTotal = cfg(block.config, "show_total_paid", true);
  const payments = data.payments ?? [];
  if (payments.length === 0) return "";

  const currency = data.document.currency;
  const labelFor: Record<string, string> = { date: "Date", method: "Method", reference: "Reference", amount: "Amount" };

  const header = columns.map((c) => `<th style="text-align:${c === "amount" ? "right" : "left"}; font-size:8pt; text-transform:uppercase; letter-spacing:.4px; color:var(--t-muted); padding:8px 6px; border-bottom:1px solid var(--t-border);">${labelFor[c]}</th>`).join("");
  const rows = payments
    .map((p) => {
      const cells = columns
        .map((c) => {
          const v = c === "amount" ? formatCurrency(p.amount, currency) : c === "date" ? p.date : c === "method" ? p.method : p.reference ?? "";
          return `<td class="${c === "amount" ? "tpl-num" : ""}" style="padding:7px 6px; text-align:${c === "amount" ? "right" : "left"};">${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr style="border-bottom:1px solid var(--t-border);">${cells}</tr>`;
    })
    .join("");

  const total = showTotal
    ? `<div class="tpl-num" style="text-align:right; font-family:var(--t-heading-font); font-weight:var(--t-heading-weight); margin-top:6px; color:var(--t-primary);">Total Paid: ${formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0), currency)}</div>`
    : "";

  return `<table style="width:100%; border-collapse:collapse; font-size:9pt;"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>${total}`;
}

function renderSignature(block: TemplateBlock, data: DocumentRenderData): string {
  const signatures = cfg<{ label: string; show_name_line?: boolean; show_date_line?: boolean; show_title_line?: boolean }[]>(block.config, "signatures", []);
  const layout = cfg<string>(block.config, "layout", "side_by_side");
  const branding = data.workspace_branding;

  // When the workspace has configured a signatory (Settings > Branding),
  // the block renders the real thing — signature image over the company
  // name, the way a wet signature sits on paper — instead of the blank
  // ruled lines it used to always draw. The blank-line form is kept for
  // extra signature boxes the template asks for beyond the configured
  // one (e.g. a "Received By" counterpart the customer fills in).
  const hasConfiguredSignatory = !!(branding?.signatory_name || branding?.signature_url);

  const configuredBox = () => `
    <div style="flex:1; text-align:center;">
      <div style="font-size:9pt; font-weight:600; color:var(--t-text);">${escapeHtml(branding?.signature_label || "Approved by,")}</div>
      <div style="position:relative; height:70px; margin-top:6px;">
        ${branding?.signature_url ? `<img src="${escapeHtml(branding.signature_url)}" alt="${escapeHtml(branding?.signatory_name ?? "Signature")}" style="position:absolute; left:0; right:0; margin:0 auto; height:70px; max-width:100%; object-fit:contain;">` : ""}
        ${branding?.signatory_company ? `<div style="position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); border:1px solid var(--t-muted); padding:2px 6px; font-size:8.5pt; font-weight:500; color:var(--t-text);">${escapeHtml(branding.signatory_company)}</div>` : ""}
      </div>
      ${branding?.signatory_name ? `<div style="font-size:9pt; font-weight:600; margin-top:4px; color:var(--t-text);">(${escapeHtml(branding.signatory_name)})</div>` : ""}
      ${branding?.signatory_title ? `<div style="font-size:8pt; color:var(--t-muted);">${escapeHtml(branding.signatory_title)}</div>` : ""}
    </div>`;

  const blankBox = (sig: { label: string; show_name_line?: boolean; show_date_line?: boolean; show_title_line?: boolean }) => `
    <div style="flex:1;">
      <div style="border-bottom:1px solid var(--t-text); height:40px;"></div>
      <div style="font-size:9pt; color:var(--t-muted); margin-top:4px;">${escapeHtml(sig.label)}</div>
      ${sig.show_name_line ? `<div style="font-size:8pt; color:var(--t-muted);">Name</div>` : ""}
      ${sig.show_date_line ? `<div style="font-size:8pt; color:var(--t-muted);">Date</div>` : ""}
      ${sig.show_title_line ? `<div style="font-size:8pt; color:var(--t-muted);">Title</div>` : ""}
    </div>`;

  // The configured signatory takes the first slot; any further slots the
  // template defines stay blank lines for the other party to sign.
  const boxes = hasConfiguredSignatory
    ? [configuredBox(), ...signatures.slice(1).map(blankBox)]
    : signatures.map(blankBox);

  if (boxes.length === 0) return "";

  const wrapperStyle = layout === "side_by_side" ? "display:flex; gap:24px;" : "display:flex; flex-direction:column; gap:16px;";
  return `<div style="${wrapperStyle}">${boxes.join("")}</div>`;
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
