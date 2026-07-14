import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type BackButtonProps = {
  href: string;
  label: string;
};

// Reused across every detail page's header — always navigates to the
// entity's canonical list route rather than router.back(), so it behaves
// the same regardless of how the user arrived at the page (deep link,
// dashboard activity feed, search, a different entity's card, etc.).
export function BackButton({ href, label }: BackButtonProps) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground" asChild>
      <Link href={href}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
