import type {
  BrandingSettings,
  CompanyProfile,
  CompanyProfileAddress,
  PaymentDetails,
} from "@/features/templates/types";

/**
 * The one place the document accent colour is defined. Every rule, label
 * and band below reads from here, so re-branding is a one-line change
 * rather than a hunt through five print views.
 */
export const DOC_ACCENT = "#00A651";

/**
 * Backgrounds and coloured rules are stripped by browsers when printing
 * unless colour adjustment is forced. Every element that carries a fill
 * gets this, otherwise the accent bands silently vanish on paper.
 */
const EXACT_COLOR = "[print-color-adjust:exact] [-webkit-print-color-adjust:exact]";

/**
 * The solid accent band that frames the top and bottom of every document.
 */
function AccentBand() {
  return (
    <div
      className={`h-[7px] w-full ${EXACT_COLOR}`}
      style={{ backgroundColor: DOC_ACCENT }}
    />
  );
}

/**
 * The company's own address, collapsed to the single line that sits under
 * the masthead. Reads the structured fields Settings → Company Profile
 * already collects rather than a separate hardcoded string, so correcting
 * the address is done in the app and every document follows.
 *
 * Empty parts are dropped, so a partly-filled profile degrades to whatever
 * it does have instead of rendering stray commas. Postal code joins its
 * province with a space, not a comma ("RIAU 28254"), which is how an
 * Indonesian address is written.
 */
export function formatCompanyAddress(
  address?: CompanyProfileAddress
): string | null {
  if (!address) return null;
  const region = [address.state, address.postal_code]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const parts = [
    address.line1,
    address.line2,
    address.city,
    region,
    address.country,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

type DocumentShellProps = {
  /** e.g. "INVOICE", "PURCHASE ORDER" — set small above the company name. */
  documentLabel: string;
  companyName: string;
  logoUrl?: string | null;
  /** Supplies the address line under the company name. */
  companyProfile?: CompanyProfile;
  children: React.ReactNode;
};

/**
 * The frame every printed document shares: logo and masthead, an accent
 * band, the document body, and a mirrored band at the foot.
 *
 * All five document types render through this, so they cannot drift
 * apart — the previous split between the template renderer and the print
 * views is exactly how they diverged.
 *
 * Plain <img> rather than next/image: the logo is a user-supplied
 * Supabase Storage URL and print output gains nothing from the optimizer.
 */
export function DocumentShell({
  documentLabel,
  companyName,
  logoUrl,
  companyProfile,
  children,
}: DocumentShellProps) {
  const companyAddress = formatCompanyAddress(companyProfile?.address);

  return (
    <div className="hidden text-[#1f2933] print:block">
      <div className="flex items-center gap-5 pb-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={companyName}
            className="h-[82px] w-[82px] shrink-0 object-contain"
          />
        )}
        <div className="min-w-0">
          <p
            className={`text-[29px] font-extrabold uppercase leading-tight tracking-tight ${EXACT_COLOR}`}
            style={{ color: DOC_ACCENT }}
          >
            {documentLabel}
          </p>
          <h1 className="text-[29px] font-extrabold uppercase leading-tight tracking-tight">
            {companyName}
          </h1>
          {/* One line, deliberately: the masthead is an identifier, not a
              contact block, and wrapping it would push the accent band
              down and unbalance the header. Long addresses ellipsise
              rather than reflow. */}
          {companyAddress && (
            <p className="mt-0.5 truncate text-[9px] uppercase leading-tight tracking-wide text-gray-600">
              {companyAddress}
            </p>
          )}
        </div>
      </div>

      <AccentBand />

      <div className="pt-6">{children}</div>

      <div className="mt-6">
        <AccentBand />
      </div>
    </div>
  );
}

export type DocumentMetaField = { label: string; value: string };

/**
 * The band under the masthead: who the document is for on the left, and
 * up to a couple of dated identifiers on the right, separated by accent
 * rules the way the reference does.
 */
export function DocumentParties({
  partyHeading,
  partyName,
  partyLines = [],
  fields,
}: {
  partyHeading: string;
  partyName: string;
  partyLines?: (string | null | undefined)[];
  fields: DocumentMetaField[];
}) {
  return (
    <div className="flex items-start justify-between gap-10">
      <div className="min-w-0">
        <p
          className={`text-[11px] font-bold uppercase tracking-[0.1em] ${EXACT_COLOR}`}
          style={{ color: DOC_ACCENT }}
        >
          {partyHeading}
        </p>
        <p className="mt-1.5 text-[15px] font-bold">{partyName}</p>
        {partyLines.filter(Boolean).map((line, i) => (
          <p key={i} className="text-[12px] text-gray-600">
            {line}
          </p>
        ))}
      </div>

      <div className="flex shrink-0 items-start">
        {fields.map((field, i) => (
          <div
            key={field.label}
            className={i > 0 ? "pl-6" : ""}
            style={
              i > 0
                ? { borderLeft: `2px solid ${DOC_ACCENT}`, marginLeft: "1.5rem" }
                : undefined
            }
          >
            <p className="text-[12px] font-bold">{field.label}</p>
            <p className="mt-1 text-[13px] text-gray-700">{field.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export type DocumentTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-28". */
  className?: string;
};

/**
 * The line-items table. Accent rule under the header, hairline rules
 * between rows, nothing boxed — matching the reference's open look.
 */
export function DocumentTable({
  columns,
  children,
}: {
  columns: DocumentTableColumn[];
  children: React.ReactNode;
}) {
  return (
    <table className="mt-10 w-full border-collapse">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`pb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-600 ${
                col.align === "right"
                  ? "text-right"
                  : col.align === "center"
                    ? "text-center"
                    : "text-left"
              } ${col.className ?? ""} ${EXACT_COLOR}`}
              style={{ borderBottom: `2.5px solid ${DOC_ACCENT}` }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function DocumentTableRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-gray-200">{children}</tr>;
}

export function DocumentTableCell({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={`py-2 text-[13px] ${alignClass} ${className}`}>{children}</td>
  );
}

/**
 * Right-aligned totals stack. `emphasis` marks the grand total, which
 * gets the accent rule above it and accent-coloured label.
 */
export function DocumentTotals({
  rows,
  total,
}: {
  rows: { label: string; value: string; muted?: boolean }[];
  total?: { label: string; value: string };
}) {
  return (
    <div className="mt-6 flex justify-end break-inside-avoid">
      <div className="w-[52%] min-w-[280px]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between py-1.5 text-[13px]"
          >
            <span className={row.muted ? "text-gray-500" : "text-gray-800"}>
              {row.label}
            </span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
        {total && (
          <div
            className={`mt-1.5 flex items-baseline justify-between pt-2.5 ${EXACT_COLOR}`}
            style={{ borderTop: `2.5px solid ${DOC_ACCENT}` }}
          >
            <span
              className={`text-[17px] font-extrabold uppercase ${EXACT_COLOR}`}
              style={{ color: DOC_ACCENT }}
            >
              {total.label}
            </span>
            <span className="text-[17px] font-extrabold tabular-nums">
              {total.value}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The foot of the document: payment details on the left, signature on
 * the right, above an accent rule.
 *
 * Either side renders independently — a Purchase Order carries a
 * signature but no bank details (we're the buyer there), and both sides
 * simply collapse when nothing is configured.
 */
export function DocumentFootnote({
  paymentDetails,
  branding,
  notes,
  terms,
  showSignature = true,
}: {
  paymentDetails?: PaymentDetails;
  branding?: BrandingSettings;
  notes?: string | null;
  terms?: string | null;
  /**
   * Whether to stamp the saved signature image (documents.show_signature,
   * 00104). Off leaves the space empty for a wet signature; the label,
   * signatory name and company still print either way, since they're what
   * identifies who is meant to be signing.
   *
   * Defaults to true so a caller that doesn't pass it — and every document
   * created before the flag existed — keeps printing as before.
   */
  showSignature?: boolean;
}) {
  const accounts = paymentDetails?.bank_accounts ?? [];
  const hasPayment = accounts.length > 0;
  const signatoryName = branding?.signatory_name?.trim();
  const signatureUrl = branding?.signature_url?.trim();
  // The block itself renders whenever there's anything to anchor it. The
  // toggle decides only whether the saved signature image is stamped into
  // it — with it off, the label, name and company still print and the
  // space where the image would go is left empty to be signed by hand.
  const hasSignature = !!(signatoryName || signatureUrl);

  // Primary first — that's the account the company actually wants paid.
  const ordered = [...accounts].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary)
  );

  return (
    <>
      {(notes || terms) && (
        <div className="mt-6 space-y-3 break-inside-avoid text-[12px]">
          {notes && (
            <div>
              <p
                className={`text-[11px] font-bold uppercase tracking-[0.1em] ${EXACT_COLOR}`}
                style={{ color: DOC_ACCENT }}
              >
                Notes
              </p>
              <div
                className="mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: notes }}
              />
            </div>
          )}
          {terms && (
            <div>
              <p
                className={`text-[11px] font-bold uppercase tracking-[0.1em] ${EXACT_COLOR}`}
                style={{ color: DOC_ACCENT }}
              >
                Terms &amp; Conditions
              </p>
              <div
                className="mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: terms }}
              />
            </div>
          )}
        </div>
      )}

      {(hasPayment || hasSignature) && (
        <>
          <div className="mt-10 flex items-start justify-between gap-10 break-inside-avoid">
            <div className="min-w-0">
              {hasPayment && (
                <>
                  <p
                    className={`text-[11px] font-bold uppercase tracking-[0.1em] ${EXACT_COLOR}`}
                    style={{ color: DOC_ACCENT }}
                  >
                    Payment Details
                  </p>
                  {ordered.map((account, i) => (
                    <table
                      key={i}
                      className={i > 0 ? "mt-3 text-[12px]" : "mt-2 text-[12px]"}
                    >
                      <tbody>
                        <tr>
                          <td className="py-[3px] pr-6 text-gray-600">Bank</td>
                          <td className="py-[3px]">{account.bank_name}</td>
                        </tr>
                        <tr>
                          <td className="py-[3px] pr-6 text-gray-600">
                            Account Name
                          </td>
                          <td className="py-[3px]">{account.account_name}</td>
                        </tr>
                        <tr>
                          <td className="py-[3px] pr-6 text-gray-600">
                            Account No.
                          </td>
                          <td className="py-[3px] tabular-nums">
                            {account.account_number}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ))}
                </>
              )}
            </div>

            {hasSignature && (
              <div className="w-[240px] shrink-0 text-center">
                <p className="text-[12px] font-bold">
                  {branding?.signature_label || "Approved by,"}
                </p>

                {/* Stacked, not overlapped: reproducing the paper overlap
                    digitally strikes a rule through the name, and a
                    scanned signature often already carries the company
                    stamp. Leave the company line blank when it does.

                    The empty box is the same height as the image, so a
                    hand-signed document and a stamped one occupy exactly
                    the same space and paginate identically — and the room
                    left for the pen is, by definition, the room the real
                    signature takes. */}
                {showSignature && signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatureUrl}
                    alt={signatoryName ? `Signature of ${signatoryName}` : "Signature"}
                    className="mx-auto mt-1.5 h-[62px] w-auto max-w-[220px] object-contain"
                  />
                ) : (
                  <div className="h-[62px]" />
                )}

                {signatoryName && (
                  <p className="mt-1.5 text-[13px] font-bold">{signatoryName}</p>
                )}
                {branding?.signatory_company && (
                  <p className="text-[12px] text-gray-600">
                    {branding.signatory_company}
                  </p>
                )}
                {branding?.signatory_title && (
                  <p className="text-[11px] text-gray-500">
                    {branding.signatory_title}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
