"use client";

import { Checkbox } from "@/components/ui/checkbox";

type SignatureToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/**
 * Whether this document prints the signature block configured in
 * Settings → Branding.
 *
 * Deliberately not folded into TaxBreakdownEditor even though it sits
 * beside it: that component is the tax breakdown, and the signature has
 * nothing to do with tax. Kept as its own component so all four builders
 * present the choice identically.
 *
 * On by default, per the document's own show_signature column — the
 * signature is the normal case and hiding it is the exception.
 */
export function SignatureToggle({
  checked,
  onChange,
  disabled,
}: SignatureToggleProps) {
  return (
    <label className="flex items-center gap-2 border-t pt-3 text-[13px]">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      Show signature
    </label>
  );
}
