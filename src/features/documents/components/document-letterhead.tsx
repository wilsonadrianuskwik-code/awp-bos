import type { BrandingSettings, CompanyProfile } from "@/features/templates/types";

type DocumentLetterheadProps = {
  workspaceName: string;
  logoUrl?: string | null;
  tagline?: string;
  companyProfile?: CompanyProfile;
  /** e.g. "PROFORMA INVOICE", "PURCHASE ORDER". */
  documentLabel: string;
};

/**
 * The masthead from the company's existing paper documents: logo at far
 * left, document title set large beside it, the whole band framed by a
 * heavy rule above and a double rule below.
 *
 * The title is the only thing in the band — company address/contact
 * details deliberately don't appear here, matching the reference, where
 * the letterhead is the logo and nothing else.
 *
 * Plain <img> rather than next/image because the logo is a user-supplied
 * Supabase Storage URL and print output gains nothing from the optimizer.
 */
export function DocumentLetterhead({
  workspaceName,
  logoUrl,
  documentLabel,
}: DocumentLetterheadProps) {
  return (
    <div className="border-t-[3px] border-black pt-4">
      <div className="flex items-center gap-6 pb-4">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={workspaceName}
            className="h-20 w-20 shrink-0 object-contain"
          />
        )}
        <h1 className="text-[26px] font-bold uppercase tracking-tight">
          {documentLabel}
        </h1>
      </div>
      {/* Double rule, as on the reference. */}
      <div className="border-b-[3px] border-double border-black" />
    </div>
  );
}

export type MetaRow = { label: string; value: string };

/**
 * The "Nomor : ... / Tanggal : ... / Kepada : ..." block. Labels are a
 * fixed-width column so every colon lines up vertically, which is what
 * makes it read as the same document as the paper original.
 */
export function DocumentMeta({ rows }: { rows: MetaRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="mt-6 text-[13px]">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="w-24 py-[3px] align-top font-bold">{row.label}</td>
            <td className="py-[3px] pr-2 align-top font-bold">:</td>
            <td className="py-[3px] align-top font-bold">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * "Pembayaran mohon ditransfer ke rekening :" followed by the account
 * line, bold and left-aligned exactly as on the reference. Renders
 * nothing when the workspace has no bank account configured, rather than
 * printing a heading with nothing under it.
 */
export function DocumentPaymentInfo({
  bankAccounts,
  heading = "Pembayaran mohon ditransfer ke rekening :",
}: {
  bankAccounts?: {
    label: string;
    bank_name: string;
    account_name: string;
    account_number: string;
    is_primary: boolean;
  }[];
  heading?: string;
}) {
  if (!bankAccounts || bankAccounts.length === 0) return null;

  // Primary first — that's the account the company actually wants paid.
  const ordered = [...bankAccounts].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary)
  );

  return (
    <div className="mt-8 text-[13px]">
      <p className="font-bold">{heading}</p>
      {ordered.map((account, i) => (
        <p key={i} className="mt-1.5 font-bold uppercase">
          {account.bank_name} NO. {account.account_number} A/N :{" "}
          {account.account_name}
        </p>
      ))}
    </div>
  );
}

/**
 * "Hormat kami, / <signature over boxed company name> / (Suhardjono)" —
 * left-aligned, matching the reference rather than the right-aligned
 * placement common on Western invoices.
 *
 * Renders nothing when no signatory is configured, so a workspace that
 * hasn't set one up doesn't print a stray empty signature area.
 */
export function DocumentSignature({ branding }: { branding?: BrandingSettings }) {
  const name = branding?.signatory_name?.trim();
  const signatureUrl = branding?.signature_url?.trim();
  const company = branding?.signatory_company?.trim();

  if (!name && !signatureUrl) return null;

  return (
    <div className="mt-10">
      <div className="w-72 text-center">
        <p className="text-[13px] font-bold">
          {branding?.signature_label || "Hormat kami,"}
        </p>

        {/* The signature image sits across the boxed company name the way
            a wet signature does on paper — hence the overlap rather than
            stacking them. */}
        <div className="relative mt-1 h-[86px]">
          {signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureUrl}
              alt={name ? `Signature of ${name}` : "Signature"}
              className="absolute inset-0 z-10 mx-auto h-[86px] object-contain"
            />
          )}
          {company && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 border border-black px-2 py-0.5 text-[12px] font-semibold">
              {company}
            </p>
          )}
        </div>

        {name && <p className="mt-1 text-[13px] font-bold">({name})</p>}
        {branding?.signatory_title && (
          <p className="text-[11px]">{branding.signatory_title}</p>
        )}
      </div>
    </div>
  );
}

const ID_MONTHS = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
];

/**
 * "24 JULI 2026" — the date format on the company's paper documents.
 * Parsed from the stored YYYY-MM-DD rather than via Date so a UTC-stored
 * date can't shift a day in a negative-offset timezone.
 */
export function formatIndonesianDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${day} ${ID_MONTHS[month - 1]} ${year}`;
}
