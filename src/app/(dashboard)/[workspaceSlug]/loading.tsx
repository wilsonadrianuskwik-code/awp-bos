import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading state for every workspace page. Shapes roughly
// like a module page (title row, stat band, list block) so the swap to
// real content doesn't jump — shown by Next.js while server components
// fetch.
export default function WorkspaceLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-card p-5 shadow-2xs">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-2xs">
        <div className="border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="space-y-0 divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
