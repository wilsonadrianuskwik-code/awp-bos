"use client";

import { Textarea } from "@/components/ui/textarea";
import { formatAddress, type PostalAddress } from "@/features/documents/address";

export type AddressSuggestion = {
  /** e.g. "Project site — PRJ-001 Villa Bali" */
  label: string;
  address: PostalAddress;
};

/**
 * Where the goods are actually going.
 *
 * Free text rather than structured line1/city/postcode fields, on
 * purpose: a construction delivery destination is rarely a tidy postal
 * address. It's a site with a gate, a block, a foreman to ask for. The
 * driver needs what someone would write on a note, and forcing that into
 * six inputs loses it.
 *
 * Suggestions (project site, client address) fill the box in one click
 * so the common cases stay fast, but nothing is locked to them.
 */
export function DeliveryAddressField({
  value,
  onChange,
  suggestions = [],
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions?: AddressSuggestion[];
  disabled?: boolean;
}) {
  const usable = suggestions.filter((s) => formatAddress(s.address));

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        placeholder="Where the goods are delivered — site name, street, landmark"
      />
      {usable.length > 0 && !disabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Use:</span>
          {usable.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onChange(formatAddress(suggestion.address) ?? "")}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The stored shape. Empty input clears the override entirely rather than
 * storing a blank string, so the printed document falls back to the
 * client's own address the way it did before this field existed.
 */
export function toDeliveryAddress(value: string): PostalAddress {
  const trimmed = value.trim();
  return trimmed === "" ? null : { formatted: trimmed };
}
