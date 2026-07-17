import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { cn } from "@/lib/utils/cn";
import type { Activity } from "@/features/activities/types";

type RecentActivityCardProps = {
  activities: Activity[];
  className?: string;
};

// Built to run as a tall right-rail column: the header stays fixed and
// the timeline scrolls inside, so a long activity list never drags the
// page height down past the main content beside it.
export function RecentActivityCard({
  activities,
  className,
}: RecentActivityCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="shrink-0">
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <ActivityTimeline activities={activities} />
      </CardContent>
    </Card>
  );
}
