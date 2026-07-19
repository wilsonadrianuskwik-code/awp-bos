import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PackageItem } from "@/features/catalog/types";

// The read-only breakdown of what's inside a package — shared by the
// document builder (under a package line item) and the catalog detail
// view. Each line reads "↳ 10x Single Post Foto … Termasuk dalam paket":
// quantity + unit + name on the left, the "included" marker on the right.
// No prices: per the product decision only the package price counts, so
// breakdown lines never show a rupiah figure.
//
// This is the React surface. The print/PDF renderer draws the same
// information from the same PackageItem[] shape in raw HTML (it can't
// import React), so the two are kept intentionally parallel.
type PackageBreakdownProps = {
  items: PackageItem[];
  className?: string;
  /** Compact spacing for dense contexts like a builder row. */
  dense?: boolean;
};

export function PackageBreakdown({ items, className, dense }: PackageBreakdownProps) {
  if (items.length === 0) return null;

  return (
    <ul className={cn("space-y-0.5", className)}>
      {items.map((item, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 text-muted-foreground",
            dense ? "text-[12px]" : "text-[13px]"
          )}
        >
          <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1">
            <span className="text-foreground/80">
              {qtyPrefix(item.quantity)} {item.name}
            </span>
            {item.note ? (
              <span className="text-muted-foreground/70"> — {item.note}</span>
            ) : null}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[11px] italic text-muted-foreground/70">
            Termasuk dalam paket
          </span>
        </li>
      ))}
    </ul>
  );
}

// "10x", "2x" — the multiplier prefix on a breakdown line. Quantities are
// whole numbers in practice; a fractional value still renders literally.
export function qtyPrefix(quantity: number): string {
  return `${quantity}x`;
}
