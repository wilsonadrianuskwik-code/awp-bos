// The lightweight "your filters matched nothing" state for list views —
// distinct from EmptyState (which onboards a truly empty module). Shared
// so every list's no-results block reads identically.
export function ListEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/50 py-16 text-center text-[13px] text-muted-foreground">
      {message}
    </div>
  );
}
