import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import type { Activity } from "@/features/activities/types";

type RecentActivityCardProps = {
  activities: Activity[];
};

export function RecentActivityCard({ activities }: RecentActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityTimeline activities={activities} />
      </CardContent>
    </Card>
  );
}
