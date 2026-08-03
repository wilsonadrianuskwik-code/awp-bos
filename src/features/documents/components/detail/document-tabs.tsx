"use client";

import { useState, useSyncExternalStore } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";

export type DocumentTab = {
  value: string;
  label: string;
  /** Rendered as a small pill after the label. 0 and undefined show none. */
  count?: number;
};

/**
 * The tab strip for document detail pages.
 *
 * Opens on the tab named by the URL hash when there is one, which is what
 * keeps the invoice list's "View Payment History" action working: it
 * navigates to `#payments`, which used to scroll to a card that no longer
 * exists as a separate section. Same for `#deliveries`.
 *
 * The hash is read once on mount rather than subscribed to, so clicking
 * a tab afterwards doesn't fight the URL.
 */
export function DocumentTabsList({
  tabs,
  value,
  className,
}: {
  tabs: DocumentTab[];
  /** The active tab — used only to style the count pills. */
  value: string;
  className?: string;
}) {
  return (
    // Scrolls rather than wraps on phones: a wrapped tab bar reflows the
    // whole page every time the active tab changes width.
    <div
      className={cn(
        "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <TabsList className="w-max">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {tab.count ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums",
                  value === tab.value
                    ? "bg-primary/10 text-primary"
                    : "bg-muted-foreground/15 text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

/** Server render has no location, so it always starts on the fallback. */
const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/**
 * The active tab: the URL hash when it names a real tab, otherwise
 * `fallback`, and whatever the user last clicked once they have clicked.
 *
 * useSyncExternalStore rather than reading the hash in an effect — it
 * gives React a server snapshot to render, so an incoming `#payments`
 * link resolves during hydration instead of flashing the default tab
 * first and swapping a frame later.
 */
export function useHashTab(valid: string[], fallback: string) {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash.replace("#", ""),
    () => ""
  );
  const [picked, setPicked] = useState<string | null>(null);

  const tab = picked ?? (valid.includes(hash) ? hash : fallback);
  return [tab, setPicked as (value: string) => void] as const;
}
