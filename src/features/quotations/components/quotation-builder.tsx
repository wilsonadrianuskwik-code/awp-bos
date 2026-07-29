"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/shared/back-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import { BuilderCommandBar } from "@/features/documents/components/builder-command-bar";
import { LineItemsEditor } from "@/features/documents/components/line-items-editor";
import { SaveAsTemplateDialog } from "@/features/line-items/components/save-as-template-dialog";
import { InsertPalette } from "@/features/documents/components/insert-palette";
import { ReviewSendOverlay } from "@/features/documents/components/review-send-overlay";
import {
  createQuotation,
  updateQuotation,
  updateQuotationStatus,
} from "@/features/quotations/actions";
import {
  createQuotationSchema,
  type CreateQuotationInput,
} from "@/features/quotations/validators";
import type { LineItemInput } from "@/features/line-items/validators";
import { computeLineItemTotals } from "@/features/line-items/helpers";
import { ProjectSelector } from "@/features/projects/components/project-selector";
import { TaxBreakdownEditor } from "@/features/documents/components/tax-breakdown-editor";
import { setDocumentTaxSettings } from "@/features/documents/actions";
import type { TaxSettings } from "@/features/documents/tax";
import { isEditableStatus } from "@/features/quotations/helpers";
import type {
  LineItemCategory,
  ClientSummary,
  TemplateWithItems,
} from "@/features/line-items/types";
import type { Quotation, QuotationDetail } from "@/features/quotations/types";
import type { CatalogItem, CatalogItemClientPrice } from "@/features/catalog/types";
import { useClientPriceResolver } from "@/features/catalog/use-client-price";
import type { Project } from "@/features/projects/types";

const CURRENCIES = ["IDR", "USD", "EUR", "GBP", "SGD", "MYR", "AUD", "CAD"];

function emptyItem(category: LineItemCategory): LineItemInput {
  return {
    category,
    description: "",
    quantity: 1,
    unit_price: 0,
    unit: "",
    discount_percent: 0,
    tax_percent: 0,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// The uniform value across a set of percentages, or null when they
// genuinely differ (the document-defaults control shows "mixed").
function inferUniform(values: number[]): number | null {
  if (values.length === 0) return 0;
  return values.every((v) => v === values[0]) ? values[0] : null;
}

// The unit shared by every line, "" when there are no lines yet, or null
// when they genuinely differ (the control shows "mixed").
function inferUniformUnit(values: string[]): string | null {
  if (values.length === 0) return "";
  return values.every((v) => v === values[0]) ? values[0] : null;
}

type QuotationBuilderProps = {
  quotation?: QuotationDetail;
  clients: ClientSummary[];
  projects: Project[];
  templates: TemplateWithItems[];
  catalogItems: CatalogItem[];
  clientPrices?: CatalogItemClientPrice[];
  initialClientId?: string;
  defaultTermsAndConditions?: string;
  defaultNotes?: string;
};

export function QuotationBuilder({
  quotation,
  clients,
  projects,
  templates: initialTemplates,
  catalogItems,
  clientPrices = [],
  initialClientId,
  defaultTermsAndConditions,
  defaultNotes,
}: QuotationBuilderProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [quotationId, setQuotationId] = useState<string | null>(
    quotation?.id ?? null
  );
  const [clientId, setClientId] = useState(
    quotation?.client_id ?? initialClientId ?? ""
  );
  const priceFor = useClientPriceResolver(clientPrices, clientId);
  const [projectId, setProjectId] = useState(quotation?.project_id ?? "");
  const [title, setTitle] = useState(quotation?.title ?? "");
  const [summary, setSummary] = useState(quotation?.summary ?? "");
  const [currency, setCurrency] = useState(
    quotation?.currency ??
      clients.find((c) => c.id === initialClientId)?.preferred_currency ??
      workspace.default_currency
  );
  const [issueDate, setIssueDate] = useState(quotation?.issue_date ?? todayISO());
  const [expiryDate, setExpiryDate] = useState(quotation?.expiry_date ?? "");
  const [terms, setTerms] = useState(
    quotation?.terms_and_conditions ?? defaultTermsAndConditions ?? ""
  );
  const [notes, setNotes] = useState(quotation?.notes ?? defaultNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(
    quotation?.internal_notes ?? ""
  );
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    quotation?.line_items?.length
      ? quotation.line_items.map((li) => ({
          category: li.category,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          unit: li.unit ?? "",
          discount_percent: li.discount_percent ?? 0,
          tax_percent: li.tax_percent ?? 0,
          catalog_item_id: li.catalog_item_id,
        }))
      : []
  );
  const [templates, setTemplates] = useState(initialTemplates);
  const [insertPaletteOpen, setInsertPaletteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  // Tax settings live on the document row, but the builder needs them
  // before the row exists, so they're held here and persisted right
  // after the draft saves (see saveDraft below). ppn_percent null means
  // this document carries no PPN.
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    dpp_numerator: quotation?.dpp_numerator ?? 11,
    dpp_denominator: quotation?.dpp_denominator ?? 12,
    ppn_percent: quotation?.ppn_percent ?? null,
    pph_percent: quotation?.pph_percent ?? null,
    retensi_percent: quotation?.retensi_percent ?? null,
    show_dpp: quotation?.show_dpp ?? true,
  });

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<string>("");
  const isFirstRender = useRef(true);
  const removedItemRef = useRef<{ item: LineItemInput; index: number } | null>(
    null
  );

  // Mirrors update_quotation (00087): editable until a terminal state.
  // A client asking for changes after it was sent is ordinary business.
  const isEditable =
    !quotation ||
    !["rejected", "expired", "cancelled"].includes(quotation.status);

  // A freshly-added row (via "Add Package/Add-on/Per-unit") starts with an
  // empty description. It stays visible in its tab so nothing the user
  // added silently disappears, but it isn't a real line item yet — treating
  // it as one meant validation could fail on a blank row sitting in a tab
  // the user isn't currently looking at, with no indication of where the
  // problem was. Excluding it here (not from `lineItems` itself) keeps it
  // on screen while removing it from what gets validated/saved.
  const submittableLineItems = lineItems.filter(
    (item) => item.description.trim() !== ""
  );

  const currentPayload: CreateQuotationInput = {
    client_id: clientId,
    project_id: projectId,
    title,
    summary,
    currency,
    issue_date: issueDate,
    expiry_date: expiryDate,
    terms_and_conditions: terms,
    notes,
    internal_notes: internalNotes,
    line_items: submittableLineItems,
  };

  const totals = computeLineItemTotals(submittableLineItems);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastSavedRef.current = JSON.stringify(currentPayload);
      return;
    }
    const serialized = JSON.stringify(currentPayload);
    if (serialized !== lastSavedRef.current) setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientId,
    projectId,
    title,
    summary,
    currency,
    issueDate,
    expiryDate,
    terms,
    notes,
    internalNotes,
    lineItems,
  ]);

  const saveDraft = useCallback(async (): Promise<Quotation | null> => {
    if (!isEditable) return null;
    const parsed = createQuotationSchema.safeParse(currentPayload);
    if (!parsed.success) return null;

    setSaveStatus("saving");
    const result = quotationId
      ? await updateQuotation(workspace.id, quotationId, parsed.data)
      : await createQuotation(workspace.id, parsed.data);

    if (result.error) {
      setSaveStatus("error");
      toast(result.error, "error");
      return null;
    }

    lastSavedRef.current = JSON.stringify(currentPayload);
    setIsDirty(false);
    setSaveStatus("saved");

    if (!quotationId && result.data) {
      setQuotationId(result.data.id);
    }

    // create_/update_ don't carry tax settings, so apply them in the same
    // save. Sequential rather than parallel: the row must exist first.
    const savedId = quotationId ?? result.data?.id;
    if (savedId) {
      const taxResult = await setDocumentTaxSettings(
        workspace.id,
        "quotation",
        savedId,
        taxSettings
      );
      if (taxResult.error) {
        setSaveStatus("error");
        toast(taxResult.error, "error");
        return null;
      }
    }

    return result.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, quotationId, workspace.id, workspace.slug, isEditable]);

  // Debounced autosave shortly after the user stops editing.
  useEffect(() => {
    if (!isDirty || !isEditable) return;
    const timeout = setTimeout(() => {
      startTransition(() => {
        saveDraft();
      });
    }, 2500);
    return () => clearTimeout(timeout);
  }, [isDirty, isEditable, saveDraft]);

  // 30-second safety-net autosave in case the debounce never settles.
  useEffect(() => {
    if (!isEditable) return;
    const interval = setInterval(() => {
      if (isDirty) {
        startTransition(() => {
          saveDraft();
        });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isDirty, isEditable, saveDraft]);

  // Warn before closing the tab / navigating away with unsaved changes.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleManualSave = useCallback(async () => {
    const parsed = createQuotationSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const wasNew = !quotationId;
    const saved = await saveDraft();
    if (saved) {
      toast("Draft saved", "success");
      if (wasNew) {
        router.push(`/${workspace.slug}/quotations/${saved.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, quotationId, workspace.slug]);

  const handleSendShortcut = useCallback(async () => {
    const parsed = createQuotationSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;

    const id = quotationId ?? saved.id;
    // Re-sending an already-issued document is a revision, not a status
    // change: the transition only applies on the way out of draft. Asking
    // for sent -> sent is what the RPC (correctly) rejects.
    const alreadyIssued = !["draft", "revision_requested"].includes(saved.status);
    if (!alreadyIssued) {
      const statusResult = await updateQuotationStatus(workspace.id, id, "sent");
      if (statusResult.error) {
        toast(statusResult.error, "error");
        return;
      }
    }
    toast(alreadyIssued ? "Quotation updated and re-sent" : "Quotation sent", "success");
    router.push(`/${workspace.slug}/quotations/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, quotationId, workspace.id, workspace.slug]);

  // Keyboard shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+Enter send.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        startTransition(() => {
          handleManualSave();
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        startTransition(() => {
          handleSendShortcut();
        });
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleManualSave, handleSendShortcut]);

  // Mirrors update_quotation (00087) and the edit route: a sent quotation
  // stays editable for revisions; only a dead-end status closes it.
  useEffect(() => {
    if (quotation && !isEditableStatus(quotation.status)) {
      router.replace(`/${workspace.slug}/quotations/${quotation.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter-to-compose focus plumbing (pure presentation state).
  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  // Prepared For presentation: chosen client reads as a recipient block.
  const [changingClient, setChangingClient] = useState(false);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // Disclosure chips: notes/terms/internal editors are opt-in; documents
  // that already carry a value open with it expanded.
  const [showNotes, setShowNotes] = useState(
    () => (quotation?.notes ?? defaultNotes ?? "") !== ""
  );
  const [showTerms, setShowTerms] = useState(
    () =>
      (quotation?.terms_and_conditions ?? defaultTermsAndConditions ?? "") !==
      ""
  );
  const [showInternalNotes, setShowInternalNotes] = useState(
    () => (quotation?.internal_notes ?? "") !== ""
  );

  // Document-level tax/discount defaults (following/pinned semantics —
  // see the invoice builder; identical mechanics, no schema involvement).
  const [docDiscount, setDocDiscount] = useState<number | null>(() =>
    inferUniform(
      (quotation?.line_items ?? []).map((li) => li.discount_percent ?? 0)
    )
  );

  // Derived rather than state: applying a unit rewrites every line, so
  // reading it back from the lines is always accurate and can't drift.
  const docUnit = inferUniformUnit(
    lineItems
      .filter((item) => item.description.trim() !== "")
      .map((item) => item.unit ?? "")
  );

  function applyDocDefaults(_nextTax: number, nextDiscount: number, nextUnit: string) {
    setLineItems((prev) =>
      prev.map((item) => {
        const patch: Partial<LineItemInput> = {};
        if (
          docDiscount === null ||
          (item.discount_percent ?? 0) === docDiscount
        ) {
          patch.discount_percent = nextDiscount;
        }
        // Unit applies to every line unconditionally — there's no
        // per-line "override" concept for it the way there is for
        // tax/discount, and setting it blank would silently wipe units.
        if (nextUnit !== "") patch.unit = nextUnit;
        return { ...item, ...patch };
      })
    );
    setDocDiscount(nextDiscount);
  }

  // Send-readiness + the review moment.
  const readyReasons: string[] = [];
  if (!clientId) readyReasons.push("Choose a client");
  if (!projectId) readyReasons.push("Choose a project");
  if (submittableLineItems.length === 0)
    readyReasons.push("Add at least one item");
  const [reviewOpen, setReviewOpen] = useState(false);

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
    setLineItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  // New rows follow the document defaults — that's what "following" means.
  function newFollowingItem(category: LineItemCategory): LineItemInput {
    return {
      ...emptyItem(category),
      tax_percent: 0,
      discount_percent: docDiscount ?? 0,
    };
  }

  function addLineItem(category: LineItemCategory) {
    setFocusRequest(lineItems.length);
    setLineItems((prev) => [...prev, newFollowingItem(category)]);
  }

  // Enter in a row: commit it and compose the next line directly below.
  function composeLineItemAfter(index: number) {
    setLineItems((prev) => {
      const category = prev[index]?.category ?? "per_unit";
      const next = [...prev];
      next.splice(index + 1, 0, newFollowingItem(category));
      return next;
    });
    setFocusRequest(index + 1);
  }

  // Backspace on an already-empty row: remove silently, caret to previous.
  function deleteEmptyLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
    setFocusRequest(index > 0 ? index - 1 : null);
  }

  function removeLineItem(index: number) {
    const item = lineItems[index];
    removedItemRef.current = { item, index };
    setLineItems((prev) => prev.filter((_, i) => i !== index));
    toast(`Removed "${item.description || "item"}"`, "info", {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          const removed = removedItemRef.current;
          if (!removed) return;
          setLineItems((prev) => {
            const next = [...prev];
            next.splice(removed.index, 0, removed.item);
            return next;
          });
          removedItemRef.current = null;
        },
      },
    });
  }

  // Palette inserts keep the palette open (its inline flash is the
  // feedback); catalog lines are born following the document defaults.
  function handleInsertTemplate(items: LineItemInput[]) {
    setLineItems((prev) => [...prev, ...items]);
  }

  function handleInsertCatalogItem(item: LineItemInput) {
    setLineItems((prev) => [
      ...prev,
      { ...item, tax_percent: 0, discount_percent: docDiscount ?? 0 },
    ]);
  }

  async function handleCancel() {
    if (isDirty) {
      const ok = await confirm({
        title: "Leave without saving?",
        description: "You have unsaved changes that will be lost.",
        confirmLabel: "Leave",
        cancelLabel: "Stay",
        destructive: true,
      });
      if (!ok) return;
    }
    router.push(
      quotationId
        ? `/${workspace.slug}/quotations/${quotationId}`
        : `/${workspace.slug}/quotations`
    );
  }

  const itemsByCategory: Record<
    LineItemCategory,
    { item: LineItemInput; originalIndex: number }[]
  > = { package: [], add_on: [], per_unit: [] };
  lineItems.forEach((item, originalIndex) => {
    itemsByCategory[item.category].push({ item, originalIndex });
  });

  // Looked up by DisclosureRow to detect a package line (via its
  // catalog_item_id) and render the live breakdown underneath — same
  // live-breakdown/frozen-price posture as the invoice builder.
  const catalogItemsById: Record<string, CatalogItem> = {};
  catalogItems.forEach((item) => {
    catalogItemsById[item.id] = item;
  });

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <BackButton onClick={handleCancel} label={quotation ? "Back to Quotation" : "Back to Quotations"} />

      <BuilderCommandBar
        docLabel={quotation ? `Edit ${quotation.quotation_number}` : "New Quotation"}
        saveStatus={saveStatus}
        isDirty={isDirty}
        total={totals.total}
        currency={currency}
        isPending={isPending}
        onCancel={handleCancel}
        onSave={() => startTransition(() => handleManualSave())}
        onSend={() => setReviewOpen(true)}
        readyReasons={readyReasons}
        sendLabel="Review & Send"
      />

      {/* The document sheet: one continuous surface that reads like the
          quotation it produces — masthead, recipient + properties, the
          line-item ledger as the hero, then notes/terms and totals at the
          foot. Hierarchy comes from type and whitespace, not card borders. */}
      <div className="rounded-xl border bg-card px-5 py-8 shadow-2xs sm:px-14 sm:py-12">
        {/* Letterhead — whose document this is. */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {workspace.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logo_url}
                alt={workspace.name}
                className="h-7 w-auto"
              />
            ) : (
              <p className="text-[15px] font-semibold tracking-tight">
                {workspace.name}
              </p>
            )}
            {workspace.settings?.branding?.tagline && (
              <p className="mt-1 text-xs text-muted-foreground">
                {workspace.settings.branding.tagline}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Quotation
          </span>
        </div>

        {/* Masthead — the document names itself; no boxed inputs. */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled quotation"
          className="mt-9 w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/30"
        />
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Add a one-line summary shown to the client…"
          className="mt-1.5 w-full border-none bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
        />

        {/* Recipient + document properties */}
        <div className="mt-8 grid gap-x-16 gap-y-8 border-t pt-8 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Prepared For
            </p>
            <div className="mt-2.5">
              {selectedClient && !changingClient ? (
                <div className="group/billto">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">
                        {selectedClient.name}
                      </p>
                      {(selectedClient.company || selectedClient.email) && (
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {[selectedClient.company, selectedClient.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setChangingClient(true)}
                      className="shrink-0 rounded-md px-2 py-1 text-[13px] text-muted-foreground opacity-0 transition-all duration-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/billto:opacity-100"
                    >
                      change
                    </button>
                  </div>
                </div>
              ) : (
                <ClientSelector
                  clients={clients}
                  value={clientId}
                  onChange={(id, client) => {
                    setClientId(id);
                    setCurrency(
                      client.preferred_currency ?? workspace.default_currency
                    );
                    setChangingClient(false);
                  }}
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Project <span className="text-destructive">*</span>
              </span>
              <ProjectSelector
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                clientId={clientId || undefined}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">Issue date</span>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">Valid until</span>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">Currency</span>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* The hero: the full-width line-item ledger. */}
        <div className="mt-10 border-t pt-8">
          <LineItemsEditor
            itemsByCategory={itemsByCategory}
            currency={currency}
            catalogItemsById={catalogItemsById}
            onAdd={addLineItem}
            onUpdate={updateLineItem}
            onRemove={removeLineItem}
            onOpenSaveTemplate={() => setSaveTemplateOpen(true)}
            onOpenInsertPalette={() => setInsertPaletteOpen(true)}
            onComposeAfter={composeLineItemAfter}
            onDeleteEmpty={deleteEmptyLineItem}
            focusIndex={focusRequest}
            onFocusHandled={handleFocusHandled}
            docDiscount={docDiscount}
            docUnit={docUnit}
            onApplyDefaults={applyDocDefaults}
          />
        </div>

        {/* Foot: client-facing notes and terms on the left, the
            document-realistic totals block bottom-right. */}
        <div className="mt-10 grid gap-x-16 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {showNotes && (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Note to Client
                </p>
                <div className="mt-2.5">
                  <RichTextEditor
                    value={notes}
                    onChange={setNotes}
                    placeholder="Add notes for your client..."
                  />
                </div>
              </div>
            )}
            {showTerms && (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Terms &amp; Conditions
                </p>
                <div className="mt-2.5">
                  <RichTextEditor
                    value={terms}
                    onChange={setTerms}
                    placeholder="Payment terms, validity, etc."
                  />
                </div>
              </div>
            )}
            {showInternalNotes && (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Internal Notes{" "}
                  <span className="normal-case tracking-normal text-muted-foreground/70">
                    (staff only)
                  </span>
                </p>
                <div className="mt-2.5">
                  <RichTextEditor
                    value={internalNotes}
                    onChange={setInternalNotes}
                    placeholder="Not visible to the client..."
                  />
                </div>
              </div>
            )}
            {(!showNotes || !showTerms || !showInternalNotes) && (
              <div className="flex flex-wrap gap-2">
                {!showNotes && (
                  <button
                    type="button"
                    onClick={() => setShowNotes(true)}
                    className="rounded-full border border-dashed px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                  >
                    + Note to client
                  </button>
                )}
                {!showTerms && (
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="rounded-full border border-dashed px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                  >
                    + Terms &amp; conditions
                  </button>
                )}
                {!showInternalNotes && (
                  <button
                    type="button"
                    onClick={() => setShowInternalNotes(true)}
                    className="rounded-full border border-dashed px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                  >
                    + Internal note
                  </button>
                )}
              </div>
            )}
          </div>

          <TaxBreakdownEditor
            hargaJual={totals.subtotal - totals.discount_amount}
            currency={currency}
            settings={taxSettings}
            onChange={(next) => {
              setTaxSettings(next);
              setIsDirty(true);
            }}
            disabled={!isEditable}
          />
        </div>
      </div>

      <ReviewSendOverlay
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        docNoun="quotation"
        workspaceName={workspace.name}
        title={title}
        recipientName={selectedClient?.name ?? "—"}
        recipientDetail={[selectedClient?.company, selectedClient?.email]
          .filter(Boolean)
          .join(" · ")}
        meta={[
          { label: "Issue date", value: issueDate || "—" },
          { label: "Valid until", value: expiryDate || "—" },
        ]}
        items={submittableLineItems}
        totals={totals}
        currency={currency}
        sending={isPending}
        onSend={() => startTransition(() => handleSendShortcut())}
      />
      <InsertPalette
        open={insertPaletteOpen}
        onOpenChange={setInsertPaletteOpen}
        catalogItems={catalogItems}
        templates={templates}
        documentCurrency={currency}
        priceFor={priceFor}
        onInsertCatalog={handleInsertCatalogItem}
        onInsertTemplate={handleInsertTemplate}
      />
      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        items={submittableLineItems}
        onSaved={(t) => setTemplates((prev) => [t, ...prev])}
      />
    </div>
  );
}
