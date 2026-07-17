"use client";

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

export function GreetingHeader({ firstName }: GreetingHeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
        {today}
      </p>
      <h1
        className="mt-1 text-2xl font-semibold tracking-tight"
        suppressHydrationWarning
      >
        {greetingForNow()}, {firstName}
      </h1>
    </div>
  );
}
