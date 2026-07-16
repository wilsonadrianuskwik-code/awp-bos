import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
};

// KPI tile: quiet uppercase label above a prominent tabular-nums value —
// the number is the content, the label is orientation. The hover lift is
// subtle (border tint, no translate) since these tiles aren't clickable;
// it just makes the dashboard feel alive under the cursor.
export function StatCard({ title, value, description }: StatCardProps) {
  return (
    <Card className="transition-colors duration-150 hover:border-primary/25">
      <CardContent className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
