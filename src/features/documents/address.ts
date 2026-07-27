/**
 * Postal addresses across the app are stored as the same loose JSONB
 * shape (clients, suppliers, project sites, delivery orders). Three
 * copies of a formatAddress() helper had already grown in feature
 * folders; this is the one every new caller should use.
 */
export type PostalAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  /**
   * A free-typed address, used when someone writes the destination out
   * by hand rather than filling structured fields — the common case for
   * a delivery site ("Proyek Gedung B, Jl. Ahmad Yani KM 5, samping
   * pos satpam"). When present it wins: it is what the user actually
   * wrote, and re-deriving it from the structured parts would lose
   * detail like landmarks and gate instructions.
   */
  formatted?: string;
} | null;

/** One-line rendering, e.g. for a table cell or subtitle. */
export function formatAddress(address: PostalAddress): string | null {
  if (!address) return null;
  if (address.formatted?.trim()) {
    return address.formatted.trim().replace(/\s*\n\s*/g, ", ");
  }
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter((part) => part && part.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Multi-line rendering for printed documents, where an address should
 * occupy the two or three lines an envelope would.
 */
export function addressLines(address: PostalAddress): string[] {
  if (!address) return [];
  if (address.formatted?.trim()) {
    return address.formatted
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const cityLine = [address.city, address.state, address.postal_code]
    .filter((part) => part && part.trim() !== "")
    .join(", ");
  return [address.line1, address.line2, cityLine, address.country].filter(
    (line): line is string => !!line && line.trim() !== ""
  );
}
