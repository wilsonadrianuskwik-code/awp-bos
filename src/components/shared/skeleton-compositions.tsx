import { Skeleton } from "@/components/ui/skeleton";

export function SummaryHeroSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2.5 h-10 w-48" />
          </div>
          <div className="flex gap-x-10">
            <div>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2.5 h-6 w-28" />
            </div>
            <div>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-2.5 h-6 w-28" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full rounded-none" />
    </div>
  );
}

export function MetricsRibbonSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl bg-card shadow-card sm:grid-cols-3 lg:flex lg:divide-y-0">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="min-w-0 p-4 lg:flex-1 lg:p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-7 w-32" />
          <Skeleton className="mt-1.5 h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3.5 w-24" />
          <Skeleton className="mt-2 h-3.5 w-40" />
          <div className="mt-4 flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="border-b px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-20" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b px-4 py-3 last:border-b-0">
          <div className="flex gap-6">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton
                key={j}
                className="h-4"
                style={{ width: `${j === 0 ? 160 : 80 + Math.random() * 40}px` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KanbanBoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-5" />
          </div>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="rounded-2xl bg-card p-5 shadow-card">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-2 h-4 w-32" />
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <SummaryHeroSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <Skeleton className="h-4 w-20" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
