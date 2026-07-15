import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type BackButtonProps = {
  label: string;
} & (
  | { href: string; onClick?: never }
  // Builders (invoice/quotation) need a guarded exit that can prompt on
  // unsaved changes — a plain Link would bypass that, so onClick is
  // supported as an alternative to href, not a Link at all in that case.
  | { href?: never; onClick: () => void }
);

// Reused across every detail/edit page's header — by default navigates to
// the entity's canonical list/detail route rather than router.back(), so it
// behaves the same regardless of how the user arrived at the page (deep
// link, dashboard activity feed, search, a different entity's card, etc.).
// Styled as a clearly-bordered button (not a faint ghost link) so it reads
// as an obvious, clickable control rather than blending into the header.
export function BackButton({ href, label, onClick }: BackButtonProps) {
  const content = (
    <>
      <ArrowLeft className="mr-1.5 h-4 w-4" />
      {label}
    </>
  );

  if (onClick) {
    return (
      <Button variant="outline" size="sm" onClick={onClick}>
        {content}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{content}</Link>
    </Button>
  );
}
