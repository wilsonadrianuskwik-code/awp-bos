import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type DocumentToolbarProps = {
  backHref: string;
  backLabel: string;
  title: string;
  /** Status badge, version chip — sits inline with the title. */
  badges?: React.ReactNode;
  /** Number · client · project chips. One line, wraps on narrow screens. */
  subtitle?: React.ReactNode;
  /** Primary buttons, then the overflow menu. */
  actions?: React.ReactNode;
};

/**
 * The header every document detail page opens with.
 *
 * Deliberately not DetailHeader: that one stacks a full-width back
 * button above the title, giving three rows before any content. Here the
 * back control is an icon in the title row, so the whole header is one
 * band — on a 1080p screen that difference is most of what decides
 * whether the line items are visible without scrolling.
 *
 * DetailHeader is untouched and still used by Clients, Leads, Catalog,
 * Projects and Suppliers; this is the document-specific variant.
 */
export function DocumentToolbar({
  backHref,
  backLabel,
  title,
  badges,
  subtitle,
  actions,
}: DocumentToolbarProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <Link
        href={backHref}
        title={backLabel}
        aria-label={backLabel}
        className="mt-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="truncate text-[17px] font-semibold tracking-tight">
            {title}
          </h1>
          {badges}
        </div>
        {subtitle && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * A linked pill in the subtitle row — source quotation, project, the
 * invoice a delivery order belongs to. Same shape everywhere so the
 * relationships read as one class of thing.
 */
export function DocumentChip({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

/**
 * "Name · Company", collapsed to just the name when the two are the same
 * — clients are often entered with the company repeated in both fields,
 * and "PT Persada Bumi Etam · PT Persada Bumi Etam" is noise.
 */
export function partyLabel(
  name?: string | null,
  company?: string | null,
  fallback = "—"
): string {
  const n = name?.trim();
  const c = company?.trim();
  if (!n) return fallback;
  return c && c.toLowerCase() !== n.toLowerCase() ? `${n} · ${c}` : n;
}
