"use client";

import { useEffect, useState } from "react";

type GreetingHeaderProps = {
  firstName: string;
};

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Both strings depend on the viewer's local clock, which the server
 * can't know — it renders in its own timezone (Vercel's is UTC), not
 * the workspace's. Computing them during render made the server's guess
 * appear first and, because of suppressHydrationWarning below, that
 * guess never got corrected: React skips reconciling a text-only
 * mismatch once told not to warn about it, so a request rendered during
 * UTC 0-4am — the whole Pekanbaru morning, UTC+7 — permanently stuck
 * users with "Working late".
 *
 * Rendering nothing until mount sidesteps the mismatch entirely: the
 * first real paint is the browser's own Date(), computed once client-side,
 * so there's nothing for hydration to get wrong and no warning to
 * suppress.
 */
export function GreetingHeader({ firstName }: GreetingHeaderProps) {
  const [now, setNow] = useState<{ greeting: string; today: string } | null>(
    null
  );

  useEffect(() => {
    setNow({ greeting: greetingForNow(), today: todayLabel() });
  }, []);

  return (
    <div>
      <p className="text-xs text-muted-foreground">{now?.today ?? " "}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {now ? `${now.greeting}, ${firstName}` : " "}
      </h1>
    </div>
  );
}
