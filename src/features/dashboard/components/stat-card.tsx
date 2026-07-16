import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedValue } from "@/components/shared/animated-value";
import { cn } from "@/lib/utils/cn";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
  /** Makes the tile a navigation target — hover lift + corner arrow. */
  href?: string;
  /** "danger" tints the value red — for actionable alerts (overdue). */
  tone?: "default" | "danger";
};

// KPI tile: quiet uppercase label above a prominent counting value — the
// number is the content, the label is orientation. Linked tiles lift and
// reveal a corner arrow so "this goes somewhere" is legible before the
// click.
export function StatCard({
  title,
  value,
  description,
  href,
  tone = "default",
}: StatCardProps) {
  const inner = (
    <Card
      className={cn(
        "h-full transition-all duration-150",
        href
          ? "group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md"
          : "hover:border-primary/25"
      )}
    >
      <CardContent className="relative p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <AnimatedValue
          value={value}
          className={cn(
            "mt-2 block truncate text-2xl font-semibold tracking-tight tabular-nums",
            tone === "danger" && "text-red-600 dark:text-red-400"
          )}
        />
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {href && (
          <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-muted-foreground/50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="group block outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring/50">
        {inner}
      </Link>
    );
  }
  return inner;
}
