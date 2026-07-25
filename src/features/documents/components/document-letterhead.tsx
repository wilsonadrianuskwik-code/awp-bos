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
 * The masthead every printed document shares: logo and company details on
 * the left, document type and number on the right.
 *
 * Plain <img> rather than next/image because the logo is a user-supplied
 * Supabase Storage URL, and print output doesn't benefit from the
 * optimizer anyway.
 */
export function DocumentLetterhead({
  workspaceName,
  logoUrl,
  tagline,
  companyProfile,
  documentLabel,
  documentNumber,
}: DocumentLetterheadProps) {
  const address = companyProfile?.address;

  return (
    <div className="flex items-start justify-between gap-8 border-b pb-4">
      <div className="min-w-0">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={workspaceName}
            className="mb-2 h-14 max-w-[220px] object-contain"
          />
        )}
        <h1 className="text-xl font-bold">
          {companyProfile?.display_name || workspaceName}
        </h1>
        {tagline && <p className="text-sm text-gray-600">{tagline}</p>}
        {address?.line1 && <p className="text-xs text-gray-600">{address.line1}</p>}
        {(address?.city || address?.postal_code) && (
          <p className="text-xs text-gray-600">
            {[address.city, address.state, address.postal_code]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {companyProfile?.tax_id && (
          <p className="text-xs text-gray-600">NPWP {companyProfile.tax_id}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <h2 className="text-2xl font-bold uppercase tracking-wide">
          {documentLabel}
        </h2>
        <p className="font-mono text-sm">{documentNumber}</p>
      </div>
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
    <div className="mt-12 flex justify-end">
      <div className="w-64 text-center">
        <p className="text-sm font-semibold">
          {branding?.signature_label || "Approved by,"}
        </p>

        {/* The image overlaps the company line the way a wet signature
            does on paper: company name printed, signed across it. */}
        <div className="relative mt-2 h-24">
          {signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureUrl}
              alt={name ? `Signature of ${name}` : "Signature"}
              className="absolute inset-0 mx-auto h-24 object-contain"
            />
          )}
          {branding?.signatory_company && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 border border-gray-400 px-2 py-0.5 text-xs font-medium">
              {branding.signatory_company}
            </p>
          )}
        </div>

        {name && <p className="mt-1 text-sm font-semibold">({name})</p>}
        {branding?.signatory_title && (
          <p className="text-xs text-gray-600">{branding.signatory_title}</p>
        )}
      </div>
    </div>
  );
}
