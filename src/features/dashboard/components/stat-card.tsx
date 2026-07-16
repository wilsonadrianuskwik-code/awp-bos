import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
};

// KPI tile: quiet 13px label above a prominent tabular-nums value —
// the number is the content, the label is orientation.
export function StatCard({ title, value, description }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
        <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>
          {value}
        </p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
