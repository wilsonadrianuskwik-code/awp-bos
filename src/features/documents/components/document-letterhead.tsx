import type { BrandingSettings, CompanyProfile } from "@/features/templates/types";

type DocumentLetterheadProps = {
  workspaceName: string;
  logoUrl?: string | null;
  tagline?: string;
  companyProfile?: CompanyProfile;
  /** e.g. "Invoice", "Purchase Order". */
  documentLabel: string;
  documentNumber: string;
};

/**
 * The masthead every printed document shares, following the company's
 * existing paper documents: logo at far left with the document title set
 * large beside it, the band framed by a heavy rule above and a double
 * rule below. The document number sits at the right of the same band.
 *
 * Company address/contact details deliberately don't appear here — on the
 * reference the letterhead is the logo and the title, nothing else.
 *
 * Plain <img> rather than next/image because the logo is a user-supplied
 * Supabase Storage URL, and print output doesn't benefit from the
 * optimizer anyway.
 */
export function DocumentLetterhead({
  workspaceName,
  logoUrl,
  documentLabel,
  documentNumber,
}: DocumentLetterheadProps) {
  return (
    <div className="border-t-[3px] border-black pt-3">
      <div className="flex items-center justify-between gap-6 pb-3">
        <div className="flex min-w-0 items-center gap-5">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={workspaceName}
              className="h-[72px] w-[72px] shrink-0 object-contain"
            />
          )}
          <h1 className="text-[26px] font-bold uppercase tracking-tight">
            {documentLabel}
          </h1>
        </div>
        <p className="shrink-0 font-mono text-sm">{documentNumber}</p>
      </div>
      {/* Double rule, as on the reference. */}
      <div className="border-b-[3px] border-double border-black" />
    </div>
  );
}

/**
 * "Approved by, / <company> / <signature image> / (<name>) / <title>" —
 * the block Indonesian documents carry so a PDF goes out already signed.
 *
 * Renders nothing when no signatory is configured, rather than an empty
 * frame, so a workspace that hasn't set one up doesn't print a stray
 * signature line.
 */
export function DocumentSignature({ branding }: { branding?: BrandingSettings }) {
  const name = branding?.signatory_name?.trim();
  const signatureUrl = branding?.signature_url?.trim();

  if (!name && !signatureUrl) return null;

  return (
    <div className="mt-12">
      {/* Fixed width, left-aligned — matching the company's paper
          documents. A stretch-to-fit box would run the company name and
          its rule across the whole page. */}
      <div className="w-[240px] text-center">
        <p className="text-[13px] font-bold">
          {branding?.signature_label || "Hormat kami,"}
        </p>

        {/* Stacked rather than overlapped. On paper the stamp is applied
            across the printed company name, but reproducing that overlap
            digitally strikes the text through — and a scanned signature
            often already contains the company stamp, so it doubled up.
            Leave the company line blank if the image includes it. */}
        {signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signatureUrl}
            alt={name ? `Signature of ${name}` : "Signature"}
            className="mx-auto mt-1 h-[80px] w-auto max-w-[240px] object-contain"
          />
        )}

        {branding?.signatory_company && (
          <p className="mt-1 truncate text-[12px] font-semibold">
            {branding.signatory_company}
          </p>
        )}

        {name && (
          <p className="mt-0.5 text-[13px] font-bold underline decoration-black underline-offset-4">
            ({name})
          </p>
        )}
        {branding?.signatory_title && (
          <p className="mt-0.5 text-[11px] text-gray-600">
            {branding.signatory_title}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "Pembayaran mohon ditransfer ke rekening :" followed by the account
 * line, bold and left-aligned as on the company's paper documents.
 *
 * Renders nothing when no bank account is configured, rather than a
 * heading with nothing under it.
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
        <p key={i} className="mt-1 font-bold uppercase">
          {account.bank_name} NO. {account.account_number} A/N :{" "}
          {account.account_name}
        </p>
      ))}
    </div>
  );
}
