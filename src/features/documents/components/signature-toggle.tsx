"use client";

import { Checkbox } from "@/components/ui/checkbox";

type SignatureToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/**
 * Whether this document stamps the signature image saved in
 * Settings → Branding, or leaves the space empty to be signed by hand.
 *
 * Not a choice about whether the document is signed at all: the label,
 * signatory name and company print either way, so an unstamped document
 * still says who is meant to sign it — it just arrives with room for a
 * pen instead of an image.
 *
 * Deliberately not folded into TaxBreakdownEditor even though it sits
 * beside it: that component is the tax breakdown, and the signature has
 * nothing to do with tax. Kept as its own component so all four builders
 * present the choice identically.
 */
export function SignatureToggle({
  checked,
  onChange,
  disabled,
}: SignatureToggleProps) {
  return (
    <div className="border-t pt-3">
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onChange(next === true)}
        />
        Stamp saved signature
      </label>
      <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
        Off leaves the space blank to sign by hand.
      </p>
    </div>
  );
}
