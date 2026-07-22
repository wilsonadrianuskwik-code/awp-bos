"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ArrowLeft,
  AlertTriangle,
  Clock,
  CircleDot,
  CheckCircle2,
  CalendarClock,
  PackageCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatedValue } from "@/components/shared/animated-value";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { FulfillmentProgressCard } from "@/features/fulfillment/components/fulfillment-progress-card";
import { RecordDeliveryDialog } from "@/features/fulfillment/components/record-delivery-dialog";
import { FulfillmentWorkspace } from "@/features/fulfillment/components/fulfillment-workspace";
import {
  ATTENTION_REASONS,
  isActive,
  trackerReasons,
  type AttentionReason,
} from "@/features/fulfillment/attention";
import {
  getClientFulfillmentDeliverablesAction,
  getFulfillmentWorkspaceDataAction,
  updateFulfillmentDeliverableStatusAction,
} from "@/features/fulfillment/actions-projects";
import type { FulfillmentWorkspaceData } from "@/features/fulfillment/actions-projects";
import type { ClientFulfillmentDeliverable } from "@/features/fulfillment/types-projects";
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

// Order matches the KPI tile row below (also what the 1–4 keyboard
// shortcuts map to) — "what should I work on now" first, "what needs
// triage" last, so opening the cockpit doesn't lead with problems.
const VIEWS: View[] = ["active", "completed", "all", "attention"];

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
  const { workspace } = useWorkspace();

  const enriched = useMemo<EnrichedClient[]>(
    () =>
      groupByClient(items).map((g) => ({ ...g, stats: computeStats(g, stalledAfterDays) })),
    [items, stalledAfterDays]
  );

  // The whole /fulfillment module is one page: with no invoice selected,
  // this renders the triage queue below; picking a project (via the
  // Client▼/Invoice▼ selectors, a queue row's project pill, or the
  // workspace's own breadcrumb switcher) swaps in the unified
  // FulfillmentWorkspace in place — never a Next.js navigation.
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    searchParams.get("invoice")
  );
  const [workspaceData, setWorkspaceData] = useState<FulfillmentWorkspaceData>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const fetchWorkspace = useCallback(
    (invoiceId: string) => {
      setLoadingWorkspace(true);
      getFulfillmentWorkspaceDataAction(workspace.id, invoiceId).then((res) => {
        setWorkspaceData(res.error ? null : (res.data ?? null));
        setLoadingWorkspace(false);
      });
    },
    [workspace.id]
  );

  useEffect(() => {
    if (selectedInvoiceId) fetchWorkspace(selectedInvoiceId);
  }, [selectedInvoiceId, fetchWorkspace]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedInvoiceId) params.set("invoice", selectedInvoiceId);
    else params.delete("invoice");
    window.history.replaceState(null, "", `?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceId]);

  function openInvoice(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
  }

  function backToQueue() {
    setSelectedInvoiceId(null);
    setWorkspaceData(null);
  }

  const counts = useMemo(
    () => ({
      attention: enriched.filter((c) => c.stats.reasons.size > 0).length,
      active: enriched.filter((c) => c.stats.activeCount > 0).length,
      completed: enriched.filter((c) => c.stats.allDone).length,
      all: enriched.length,
    }),
    [enriched]
  );

  // Default to the view that answers "what should I work on now": active
  // work first (the primary operational queue), then attention items if
  // there's no active work to show, then all clients as the final fallback.
  const initialView: View =
    (VIEWS.includes(searchParams.get("view") as View)
      ? (searchParams.get("view") as View)
      : null) ??
    (counts.active > 0 ? "active" : counts.attention > 0 ? "attention" : "all");

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
      if (typing || recording || selectedInvoiceId) return;
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
  }, [filtered, selected?.clientId, recording, selectedInvoiceId]);

  function selectClient(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  const selectedInvoiceClientId = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return items.find((t) => t.invoice_id === selectedInvoiceId)?.client_id ?? null;
  }, [items, selectedInvoiceId]);

  return (
    <div className="space-y-4">
      {/* Always visible, regardless of queue vs. workspace mode — the
          direct way to jump straight to a specific project without
          triaging the queue below. */}
      <div className="flex items-center gap-2">
        <ClientInvoiceSelector
          enriched={enriched}
          selectedClientId={selectedInvoiceClientId}
          selectedInvoiceId={selectedInvoiceId}
          onSelectInvoice={openInvoice}
        />
        {/* Subtle, non-blocking signal for a background refresh (e.g. after
            a Kanban drop) — the workspace itself stays mounted and
            interactive throughout, this is just a courtesy indicator. */}
        {loadingWorkspace && workspaceData && (
          <span className="text-xs text-muted-foreground">Syncing…</span>
        )}
      </div>

      {selectedInvoiceId ? (
        // Gated on workspaceData, not loadingWorkspace: a refresh (e.g. a
        // Kanban drop calling onChanged -> onRefresh) must never unmount
        // FulfillmentWorkspace, since that would reset its own local state
        // (its active view) back to a default on every mutation. Only the
        // very first load / switching to a different project — where there's
        // no data yet to show underneath — shows the full-page placeholder.
        !workspaceData ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
            Loading project…
          </div>
        ) : (
          <FulfillmentWorkspace
            data={workspaceData}
            onRefresh={() => fetchWorkspace(selectedInvoiceId)}
            onSwitchProject={openInvoice}
            onBackToQueue={backToQueue}
          />
        )
      ) : (
        <>
      {/* Operational summary — each tile is the primary filter. Ordered to
          answer "what should I work on now" before "what's wrong": active
          work leads, Needs Attention trails (still fully visible, still
          styled as a warning — just not the first thing you see). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                      "relative flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors duration-100 last:border-b-0 hover:bg-accent/50",
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
              onOpenProject={openInvoice}
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
        </>
      )}
    </div>
  );
}

function ClientWorkPanel({
  client,
  stalledAfterDays,
  onBack,
  onRecordDelivery,
  onOpenProject,
}: {
  client: EnrichedClient;
  stalledAfterDays: number;
  onBack: () => void;
  onRecordDelivery: (t: FulfillmentItemWithProgress) => void;
  onOpenProject: (invoiceId: string) => void;
}) {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const s = client.stats;
  const outstanding = client.trackers.filter((t) => t.status !== "completed");
  const completed = client.trackers.filter((t) => t.status === "completed");

  // A client can have more than one paid invoice, and a Fulfilment Project
  // is scoped per invoice, not per client — so trackers here can belong to
  // several distinct projects. Show one pill per project rather than a
  // single "Open Project" button that would silently pick just one. These
  // stay in place — no navigation — since the whole module is one page now.
  const projects = useMemo(() => {
    const map = new Map<string, { invoiceId: string; name: string | null; status: string | null }>();
    for (const t of client.trackers) {
      if (t.project_id && !map.has(t.project_id)) {
        map.set(t.project_id, { invoiceId: t.invoice_id, name: t.project_name, status: t.project_status });
      }
    }
    return [...map.values()];
  }, [client.trackers]);

  const [deliverables, setDeliverables] = useState<ClientFulfillmentDeliverable[]>([]);
  const [loadingDeliverables, setLoadingDeliverables] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoadingDeliverables(true);
    getClientFulfillmentDeliverablesAction(workspace.id, client.clientId).then((result) => {
      if (cancelled) return;
      setDeliverables(result.error ? [] : (result.data ?? []));
      setLoadingDeliverables(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspace.id, client.clientId]);

  function markPosted(deliverableId: string) {
    startTransition(async () => {
      const result = await updateFulfillmentDeliverableStatusAction(workspace.id, deliverableId, {
        status: "posted",
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setDeliverables((prev) => prev.filter((d) => d.id !== deliverableId));
      toast("Marked as posted", "success");
      router.refresh();
    });
  }

  return (
    // Keyed by clientId in the parent, so switching clients remounts and
    // replays this entrance — the panel visibly answers the selection.
    <div className="duration-200 animate-in fade-in slide-in-from-right-1">
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
            <p className="mt-0.5 text-sm text-muted-foreground">
              {client.trackers.length} tracker{client.trackers.length === 1 ? "" : "s"}
              {s.remaining > 0 && ` · ${s.remaining} units remaining`}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${workspace.slug}/clients/${client.clientId}`}>View client</Link>
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {projects.map((p) => (
              <button
                key={p.invoiceId}
                type="button"
                onClick={() => onOpenProject(p.invoiceId)}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                {p.name || "Untitled"}
                {p.status && <span className="text-[10px] uppercase tracking-wide opacity-70">· {p.status.replace("_", " ")}</span>}
              </button>
            ))}
          </div>
        )}

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
                className="animate-grow-x h-full rounded-full bg-emerald-500 transition-[width] duration-500"
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
        {/* Outstanding Deliverables — the client's remaining scheduled
            "Post #N" items across ALL their projects, fetched inline via
            get_fulfillment_deliverables_by_client so seeing what's due
            never requires leaving the cockpit. */}
        <SectionLabel text="Outstanding Deliverables" count={deliverables.length} />
        {loadingDeliverables ? (
          <div className="mb-6 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : deliverables.length === 0 ? (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-dashed py-4 px-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500/70" />
            Nothing scheduled and outstanding for this client.
          </div>
        ) : (
          <div className="mb-6 flex flex-col gap-1.5">
            {deliverables.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {d.scheduled_date ?? "No date"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium">{d.title}</span>
                    {d.is_overdue && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                        <CalendarClock className="h-3 w-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{d.project_name}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => markPosted(d.id)}
                >
                  Mark Posted
                </Button>
              </div>
            ))}
          </div>
        )}

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
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 text-emerald-500/70" />
            No outstanding work for this client.
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
        "rounded-lg border bg-card p-3.5 text-left shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
        active && "border-primary ring-1 ring-primary",
        active && tone === "crit" && "border-red-500 ring-red-500"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", swatch)} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <AnimatedValue
        value={String(value)}
        className={cn("block text-2xl font-semibold leading-none tracking-tight tabular-nums", fig)}
      />
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
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-100",
        active
          ? "border-primary/20 bg-primary/10 text-primary"
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

// The mockup's persistent Client▼/Invoice▼ selector — always visible at
// the top of the page, in both queue and workspace modes, as the direct
// route to a specific project. Built from `enriched` (already loaded for
// the queue), so picking a project needs no extra query; only opening it
// does (getFulfillmentWorkspaceDataAction, fired by the parent).
function ClientInvoiceSelector({
  enriched,
  selectedClientId,
  selectedInvoiceId,
  onSelectInvoice,
}: {
  enriched: EnrichedClient[];
  selectedClientId: string | null;
  selectedInvoiceId: string | null;
  onSelectInvoice: (invoiceId: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(selectedClientId);

  useEffect(() => {
    setClientId(selectedClientId);
  }, [selectedClientId]);

  const client = enriched.find((c) => c.clientId === clientId) ?? null;

  const invoices = useMemo(() => {
    if (!client) return [];
    const map = new Map<string, { invoiceId: string; label: string }>();
    for (const t of client.trackers) {
      if (t.project_id && !map.has(t.invoice_id)) {
        map.set(t.invoice_id, {
          invoiceId: t.invoice_id,
          label: t.project_name ? `${t.invoice_number} — ${t.project_name}` : t.invoice_number,
        });
      }
    }
    return [...map.values()];
  }, [client]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <Select
        value={clientId ?? undefined}
        onValueChange={(v) => {
          setClientId(v);
          const firstInvoice = enriched
            .find((c) => c.clientId === v)
            ?.trackers.find((t) => t.project_id)?.invoice_id;
          if (firstInvoice) onSelectInvoice(firstInvoice);
        }}
      >
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue placeholder="Client…" />
        </SelectTrigger>
        <SelectContent>
          {enriched.map((c) => (
            <SelectItem key={c.clientId} value={c.clientId}>
              {c.clientName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selectedInvoiceId ?? undefined}
        onValueChange={onSelectInvoice}
        disabled={invoices.length === 0}
      >
        <SelectTrigger className="h-9 w-[260px]">
          <SelectValue placeholder="Invoice…" />
        </SelectTrigger>
        <SelectContent>
          {invoices.map((inv) => (
            <SelectItem key={inv.invoiceId} value={inv.invoiceId}>
              {inv.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
