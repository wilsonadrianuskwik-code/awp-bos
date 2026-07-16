"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  ArrowLeft,
  AlertTriangle,
  Clock,
  CircleDot,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import {
  ATTENTION_REASONS,
  isActive,
  trackerReasons,
  type AttentionReason,
} from "@/features/fulfillment/attention";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";

type View = "attention" | "active" | "completed" | "all";

type ClientGroup = {
  clientId: string;
  clientName: string;
  trackers: FulfillmentItemWithProgress[];
};

type ClientStats = {
  activeCount: number;
  purchased: number;
  delivered: number;
  remaining: number;
  pct: number;
  reasons: Set<AttentionReason>;
  maxIdleDays: number;
  allDone: boolean;
  urgency: number;
};

type EnrichedClient = ClientGroup & { stats: ClientStats };

const VIEWS: View[] = ["attention", "active", "completed", "all"];

function groupByClient(items: FulfillmentItemWithProgress[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();
  for (const t of items) {
    const g = map.get(t.client_id);
    if (g) g.trackers.push(t);
    else map.set(t.client_id, { clientId: t.client_id, clientName: t.client_name, trackers: [t] });
  }
  return [...map.values()];
}

function computeStats(g: ClientGroup, stalledAfterDays: number): ClientStats {
  const reasons = new Set<AttentionReason>();
  let purchased = 0;
  let delivered = 0;
  let remaining = 0;
  let activeCount = 0;
  let maxIdleDays = 0;
  let allDone = true;

  for (const t of g.trackers) {
    purchased += t.purchased;
    delivered += Math.min(t.delivered, t.purchased);
    remaining += t.remaining;
    if (isActive(t)) activeCount += 1;
    if (t.status !== "completed") allDone = false;
    for (const r of trackerReasons(t, stalledAfterDays)) reasons.add(r);
    const idle = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86_400_000);
    if (isActive(t) && idle > maxIdleDays) maxIdleDays = idle;
  }

  // Higher = more urgent; drives the queue's default sort so "who to serve
  // today" sits at the top.
  const urgency =
    (reasons.has("stalled") ? 10_000 : 0) +
    (reasons.has("over") ? 1_000 : 0) +
    reasons.size * 100 +
    activeCount * 10 +
    remaining;

  return {
    activeCount,
    purchased,
    delivered,
    remaining,
    pct: purchased > 0 ? Math.round((delivered / purchased) * 100) : 100,
    reasons,
    maxIdleDays,
    allDone,
    urgency,
  };
}

type QueueSignal = {
  tone: "crit" | "warn" | "accent" | "muted" | "good";
  Icon: typeof AlertTriangle;
  text: string;
};

function signalFor(c: EnrichedClient): QueueSignal {
  const s = c.stats;
  if (s.reasons.has("stalled"))
    return { tone: "crit", Icon: AlertTriangle, text: `Stalled · ${s.maxIdleDays}d idle` };
  if (s.reasons.has("over"))
    return { tone: "warn", Icon: AlertTriangle, text: "Over-delivered" };
  if (s.allDone)
    return { tone: "good", Icon: CheckCircle2, text: "All work complete" };
  if (s.reasons.has("today"))
    return { tone: "muted", Icon: Clock, text: "Updated today" };
  return { tone: "accent", Icon: CircleDot, text: `${s.remaining} remaining` };
}

const TONE_TEXT: Record<QueueSignal["tone"], string> = {
  crit: "text-red-600 dark:text-red-400",
  warn: "text-amber-700 dark:text-amber-400",
  accent: "text-muted-foreground",
  muted: "text-muted-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
};

const RING_COLOR: Record<QueueSignal["tone"], string> = {
  crit: "#ef4444",
  warn: "#f59e0b",
  accent: "hsl(var(--primary))",
  muted: "hsl(var(--primary))",
  good: "#10b981",
};

type FulfillmentCockpitProps = {
  items: FulfillmentItemWithProgress[];
  stalledAfterDays: number;
};

export function FulfillmentCockpit({ items, stalledAfterDays }: FulfillmentCockpitProps) {
  const searchParams = useSearchParams();

  const enriched = useMemo<EnrichedClient[]>(
    () =>
      groupByClient(items).map((g) => ({ ...g, stats: computeStats(g, stalledAfterDays) })),
    [items, stalledAfterDays]
  );

  const counts = useMemo(
    () => ({
      attention: enriched.filter((c) => c.stats.reasons.size > 0).length,
      active: enriched.filter((c) => c.stats.activeCount > 0).length,
      completed: enriched.filter((c) => c.stats.allDone).length,
      all: enriched.length,
    }),
    [enriched]
  );

  // Default to the view that has work in it, so opening the page always
  // lands on something actionable: attention first, then active, then all.
  const initialView: View =
    (VIEWS.includes(searchParams.get("view") as View)
      ? (searchParams.get("view") as View)
      : null) ??
    (counts.attention > 0 ? "attention" : counts.active > 0 ? "active" : "all");

  const [view, setView] = useState<View>(initialView);
  const [reason, setReason] = useState<AttentionReason | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("client"));
  const [mobileDetail, setMobileDetail] = useState(false);
  const [recording, setRecording] = useState<FulfillmentItemWithProgress | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo<EnrichedClient[]>(() => {
    const term = search.trim().toLowerCase();
    return enriched
      .filter((c) => {
        if (term && !c.clientName.toLowerCase().includes(term)) return false;
        if (view === "attention") {
          if (c.stats.reasons.size === 0) return false;
          if (reason !== "all" && !c.stats.reasons.has(reason)) return false;
        }
        if (view === "active" && c.stats.activeCount === 0) return false;
        if (view === "completed" && !c.stats.allDone) return false;
        return true;
      })
      .sort((a, b) =>
        b.stats.urgency !== a.stats.urgency
          ? b.stats.urgency - a.stats.urgency
          : a.clientName.localeCompare(b.clientName)
      );
  }, [enriched, view, reason, search]);

  const selected =
    filtered.find((c) => c.clientId === selectedId) ?? filtered[0] ?? null;

  // Keep the URL in sync without triggering a Next navigation (which would
  // re-run the server component on every arrow-key press). history.replace
  // keeps refresh/back working and the link shareable at zero render cost.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    if (selected) params.set("client", selected.clientId);
    else params.delete("client");
    window.history.replaceState(null, "", `?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selected?.clientId]);

  // Keyboard-first: ↑/↓ or j/k walk the queue, / focuses search, 1–4 switch
  // views, Esc clears search. Suppressed while typing or a dialog is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
        return;
      }
      if (typing || recording) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        setView(VIEWS[Number(e.key) - 1]);
        setReason("all");
        return;
      }
      if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) {
        e.preventDefault();
        if (filtered.length === 0) return;
        const dir = e.key === "ArrowDown" || e.key === "j" ? 1 : -1;
        const idx = filtered.findIndex((c) => c.clientId === selected?.clientId);
        const next = Math.max(0, Math.min(filtered.length - 1, (idx < 0 ? 0 : idx) + dir));
        setSelectedId(filtered[next].clientId);
        document
          .getElementById(`qrow-${filtered[next].clientId}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected?.clientId, recording]);

  function selectClient(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  return (
    <div className="space-y-4">
      {/* Operational summary — each tile is the primary filter */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Needs attention"
          value={counts.attention}
          hint="stalled, over-delivered or in progress"
          tone="crit"
          active={view === "attention"}
          onClick={() => {
            setView("attention");
            setReason("all");
          }}
        />
        <KpiTile
          label="Active work"
          value={counts.active}
          hint="clients with deliveries in progress"
          tone="accent"
          active={view === "active"}
          onClick={() => setView("active")}
        />
        <KpiTile
          label="Completed"
          value={counts.completed}
          hint="fully delivered, nothing outstanding"
          tone="good"
          active={view === "completed"}
          onClick={() => setView("completed")}
        />
        <KpiTile
          label="All clients"
          value={counts.all}
          hint={`${items.length} trackers total`}
          tone="muted"
          active={view === "all"}
          onClick={() => setView("all")}
        />
      </div>

      {/* Operations Inbox reason chips — only while triaging attention */}
      {view === "attention" && (
        <div className="flex flex-wrap items-center gap-2">
          <ReasonChip label="All reasons" active={reason === "all"} onClick={() => setReason("all")} />
          {ATTENTION_REASONS.map((r) => (
            <ReasonChip
              key={r.key}
              label={r.label}
              active={reason === r.key}
              onClick={() => setReason(r.key)}
            />
          ))}
          {/* Reserved for the future Scheduling extension */}
          <span
            className="cursor-not-allowed rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground/50"
            title="Available once Scheduling is added"
          >
            Due soon
          </span>
          <span className="ml-auto hidden text-xs text-muted-foreground lg:block">
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">↑↓</kbd> move ·{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">/</kbd> search ·{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">1–4</kbd> views
          </span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
        {/* LEFT — prioritized client queue */}
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-card lg:sticky lg:top-4",
            mobileDetail && "hidden lg:block"
          )}
        >
          <div className="border-b p-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a client…"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-260px)] min-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {view === "attention"
                  ? "Nothing needs attention. You're all caught up."
                  : "No clients match these filters."}
              </div>
            ) : (
              filtered.map((c) => {
                const sig = signalFor(c);
                const isSel = c.clientId === selected?.clientId;
                return (
                  <button
                    key={c.clientId}
                    id={`qrow-${c.clientId}`}
                    type="button"
                    onClick={() => selectClient(c.clientId)}
                    className={cn(
                      "relative flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/50",
                      isSel && "bg-accent"
                    )}
                  >
                    {isSel && (
                      <span
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: RING_COLOR[sig.tone] }}
                      />
                    )}
                    <div
                      className="relative h-9 w-9 shrink-0 rounded-full"
                      style={{
                        background: `conic-gradient(${RING_COLOR[sig.tone]} ${c.stats.pct * 3.6}deg, hsl(var(--muted)) 0)`,
                      }}
                    >
                      <div className="absolute inset-[3px] grid place-items-center rounded-full bg-card">
                        <span className="font-mono text-[9px] font-bold tabular-nums">
                          {c.stats.pct}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold">
                        {c.clientName}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 flex items-center gap-1.5 text-xs",
                          TONE_TEXT[sig.tone]
                        )}
                      >
                        <sig.Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sig.text}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT — client work panel */}
        <div
          className={cn(
            "rounded-lg border bg-card",
            !mobileDetail && "hidden lg:block"
          )}
        >
          {!selected ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <PackageCheck className="h-10 w-10 text-muted-foreground/40" />
              <strong className="text-foreground">Select a client to manage</strong>
              <span className="text-sm">Their outstanding deliveries appear here.</span>
            </div>
          ) : (
            <ClientWorkPanel
              key={selected.clientId}
              client={selected}
              stalledAfterDays={stalledAfterDays}
              onBack={() => setMobileDetail(false)}
              onRecordDelivery={setRecording}
            />
          )}
        </div>
      </div>

      {recording && (
        <RecordDeliveryDialog
          open={!!recording}
          onOpenChange={(open) => !open && setRecording(null)}
          fulfillmentItemId={recording.id}
          description={recording.description}
          invoiceId={recording.invoice_id}
          invoiceNumber={recording.invoice_number}
          clientId={recording.client_id}
          clientName={recording.client_name}
          purchased={recording.purchased}
          delivered={recording.delivered}
          remaining={recording.remaining}
          unitLabel={recording.unit}
        />
      )}
    </div>
  );
}

function ClientWorkPanel({
  client,
  stalledAfterDays,
  onBack,
  onRecordDelivery,
}: {
  client: EnrichedClient;
  stalledAfterDays: number;
  onBack: () => void;
  onRecordDelivery: (t: FulfillmentItemWithProgress) => void;
}) {
  const { workspace } = useWorkspace();
  const s = client.stats;
  const outstanding = client.trackers.filter((t) => t.status !== "completed");
  const completed = client.trackers.filter((t) => t.status === "completed");

  return (
    <div>
      <div className="border-b p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          All clients
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{client.clientName}</h2>
            <Link
              href={`/${workspace.slug}/clients/${client.clientId}`}
              className="text-sm text-primary hover:underline"
            >
              View client record →
            </Link>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${workspace.slug}/clients/${client.clientId}`}>View client</Link>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 rounded-lg border bg-muted/30 p-3.5">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Overall delivery progress</span>
              <span>
                <b className="font-mono tabular-nums text-foreground">{s.delivered}</b> of{" "}
                <b className="font-mono tabular-nums text-foreground">{s.purchased}</b> units
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${s.purchased > 0 ? (s.delivered / s.purchased) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex gap-5">
            <div className="text-right">
              <div className="font-mono text-lg font-bold leading-none tabular-nums">
                {s.activeCount}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Active
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "font-mono text-lg font-bold leading-none tabular-nums",
                  s.remaining > 0 && "text-amber-700 dark:text-amber-400"
                )}
              >
                {s.remaining}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Remaining
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        {outstanding.length > 0 ? (
          <>
            <SectionLabel text="Outstanding" count={outstanding.length} />
            <div className="flex flex-col gap-3">
              {outstanding.map((t) => (
                <FulfillmentProgressCard
                  key={t.id}
                  tracker={t}
                  stalledAfterDays={stalledAfterDays}
                  onRecordDelivery={onRecordDelivery}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            ✓ No outstanding work for this client.
          </div>
        )}

        {completed.length > 0 && (
          <>
            <div className="mt-6">
              <SectionLabel text="Completed & delivered" count={completed.length} />
            </div>
            <div className="flex flex-col gap-3">
              {completed.map((t) => (
                <FulfillmentProgressCard
                  key={t.id}
                  tracker={t}
                  stalledAfterDays={stalledAfterDays}
                  onRecordDelivery={onRecordDelivery}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "crit" | "accent" | "good" | "muted";
  active: boolean;
  onClick: () => void;
}) {
  const swatch = {
    crit: "bg-red-500",
    accent: "bg-primary",
    good: "bg-emerald-500",
    muted: "bg-muted-foreground",
  }[tone];
  const fig = tone === "crit" ? "text-red-600 dark:text-red-400" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-foreground/20",
        active && "border-primary ring-1 ring-primary",
        active && tone === "crit" && "border-red-500 ring-red-500"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", swatch)} />
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className={cn("font-mono text-2xl font-semibold leading-none tabular-nums", fig)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

function ReasonChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

function SectionLabel({ text, count }: { text: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      <span>{text}</span>
      <span className="rounded bg-muted px-1.5 font-mono text-[10.5px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
