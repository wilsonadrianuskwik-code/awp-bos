import { cn } from "@/lib/utils/cn";

// Shimmer sweep instead of opacity pulse: the moving highlight reads as
// "loading in progress" rather than "stuck blinking", and it's the
// loading treatment every modern SaaS (Linear/Stripe/Vercel) converged on.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.9s_var(--ease-in-out-soft)_infinite] motion-reduce:after:hidden after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
