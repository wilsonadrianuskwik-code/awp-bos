import { cn } from "@/lib/utils/cn";

// The read-only key/value pattern used on entity detail pages. FieldList
// is the responsive definition-list container; DetailItem is one
// label/value pair, with an em-dash fallback for empty values — so every
// detail page presents record fields identically.

export function FieldList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</dl>
  );
}

export function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "-"}</dd>
    </div>
  );
}
