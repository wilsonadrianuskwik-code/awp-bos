import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  totalPages: number;
  count: number;
  /** Singular noun for the summary line, e.g. "invoice". Pluralized with +s. */
  noun: string;
  onPageChange: (page: number) => void;
};

// Shared list pagination footer. Only renders when there's more than one
// page; the summary uses tabular figures so the count doesn't shift.
export function Pagination({
  page,
  totalPages,
  count,
  noun,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <p className="text-xs text-muted-foreground tabular-nums">
        Page {page} of {totalPages} · {count} {noun}
        {count === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
