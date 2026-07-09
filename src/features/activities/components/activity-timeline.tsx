"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Activity } from "@/features/activities/types";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ActivityTimelineProps = {
  activities: Activity[];
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const initials =
          activity.actor?.full_name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) ?? "?";

        return (
          <div key={activity.id} className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-sm">
              <p>
                <span className="font-medium">
                  {activity.actor?.full_name ?? "Unknown"}
                </span>{" "}
                {activity.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(activity.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
