"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CornerDownLeft,
  UserCheck,
  FileText,
  Receipt,
  Package,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV_GROUPS, BOTTOM_ITEMS } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils/cn";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
};

type Destination = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
};

// ⌘K navigation. Deliberately minimal: it searches the same destinations
// the sidebar shows (plus quick "create" jumps), so it never surprises —
// the palette is a faster path to places users already understand.
export function CommandPalette({ open, onOpenChange, workspaceSlug }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const basePath = `/${workspaceSlug}`;

  const destinations = useMemo<Destination[]>(() => {
    const nav: Destination[] = [];
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        nav.push({ ...item, group: group.label ?? "General" });
      }
    }
    for (const item of BOTTOM_ITEMS) {
      nav.push({ ...item, group: "General" });
    }
    const creates: Destination[] = [
      { label: "New Client", href: "/clients/new", icon: UserCheck, group: "Create" },
      { label: "New Quotation", href: "/quotations/new", icon: FileText, group: "Create" },
      { label: "New Invoice", href: "/invoices/new", icon: Receipt, group: "Create" },
      { label: "New Catalog Item", href: "/catalog/new", icon: Package, group: "Create" },
    ];
    return [...nav, ...creates];
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => d.label.toLowerCase().includes(q));
  }, [query, destinations]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Radix focuses the content after mount; queue the input focus behind it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function navigateTo(destination: Destination) {
    onOpenChange(false);
    router.push(`${basePath}${destination.href}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigateTo(results[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to page or create…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;
            </p>
          ) : (
            results.map((destination, index) => (
              <button
                key={`${destination.group}-${destination.label}`}
                type="button"
                onClick={() => navigateTo(destination)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-100",
                  index === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/80"
                )}
              >
                <destination.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{destination.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {destination.group}
                </span>
                {index === activeIndex && (
                  <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
