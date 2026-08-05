"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/shared/back-button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import { BuilderCommandBar } from "@/features/documents/components/builder-command-bar";
import { DocumentPreviewDialog } from "@/features/documents/components/document-preview-dialog";
import { LineItemsEditor } from "@/features/documents/components/line-items-editor";
import { BuilderSectionHeader } from "@/features/documents/components/builder-section-header";
import { SaveAsTemplateDialog } from "@/features/line-items/components/save-as-template-dialog";
import { InsertPalette } from "@/features/documents/components/insert-palette";
import {
  createInvoice,
  setInvoiceReferences,
  updateInvoice,
  updateInvoiceStatus,
} from "@/features/invoices/actions";
import {
  createInvoiceSchema,
  type CreateInvoiceInput,
} from "@/features/invoices/validators";
import type { LineItemInput } from "@/features/line-items/validators";
import { computeLineItemTotals } from "@/features/line-items/helpers";
import { ProjectSelector } from "@/features/projects/components/project-selector";
import type {
  LineItemCategory,
  ClientSummary,
  TemplateWithItems,
} from "@/features/line-items/types";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types";
import type { CatalogItem, CatalogItemClientPrice } from "@/features/catalog/types";
import { useClientPriceResolver } from "@/features/catalog/use-client-price";
import type { Project } from "@/features/projects/types";
import { TaxBreakdownEditor } from "@/features/documents/components/tax-breakdown-editor";
import {
  setDocumentSignatureVisibility,
  setDocumentTaxSettings,
} from "@/features/documents/actions";
import { SignatureToggle } from "@/features/documents/components/signature-toggle";
import { computeTaxBreakdown, taxTotalRows } from "@/features/documents/tax";
import type { TaxSettings } from "@/features/documents/tax";
import { CURRENCY, formatCurrency } from "@/lib/utils/format-currency";


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

type InvoiceBuilderProps = {
  invoice?: InvoiceDetail;
  clients: ClientSummary[];
  projects: Project[];
  templates: TemplateWithItems[];
  catalogItems: CatalogItem[];
  clientPrices?: CatalogItemClientPrice[];
  initialClientId?: string;
  initialProjectId?: string;
  defaultPaymentTerms?: string;
  defaultNotes?: string;
};

export function InvoiceBuilder({
  invoice,
  clients,
  projects,
  templates: initialTemplates,
  catalogItems,
  clientPrices = [],
  initialClientId,
  initialProjectId,
  defaultPaymentTerms,
  defaultNotes,
}: InvoiceBuilderProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [invoiceId, setInvoiceId] = useState<string | null>(invoice?.id ?? null);
  const [clientId, setClientId] = useState(
    invoice?.client_id ?? initialClientId ?? ""
  );
  const priceFor = useClientPriceResolver(clientPrices, clientId);
  const [projectId, setProjectId] = useState(
    invoice?.project_id ?? initialProjectId ?? ""
  );
  // Neither is edited any more — the masthead inputs are gone (the
  // document is identified by its number). Read through from the
  // saved record so editing an older document that does have a title
  // keeps it instead of silently clearing it.
  const title = invoice?.title ?? "";
  const summary = invoice?.summary ?? "";
  // Rupiah-only app: no picker, no per-document currency.
  const currency = CURRENCY;
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? todayISO());
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState(
    invoice?.payment_terms ?? defaultPaymentTerms ?? ""
  );
  // The client's own PO number. Not part of CreateInvoiceInput — it goes
  // through set_invoice_references (00092), which has no payment guard, so
  // it can still be filled in on an invoice that has already been paid.
  const [customerPo, setCustomerPo] = useState(
    invoice?.customer_po_number ?? ""
  );
  const [notes, setNotes] = useState(invoice?.notes ?? defaultNotes ?? "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    invoice?.line_items?.length
      ? invoice.line_items.map((li) => ({
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
  // Tax settings live on the document row, but the builder needs them
  // before the row exists, so they're held here and persisted right after
  // the draft saves (see saveDraft below).
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    dpp_numerator: invoice?.dpp_numerator ?? 11,
    dpp_denominator: invoice?.dpp_denominator ?? 12,
    ppn_percent: invoice?.ppn_percent ?? 12,
    pph_percent: invoice?.pph_percent ?? null,
    retensi_percent: invoice?.retensi_percent ?? null,
    show_dpp: invoice?.show_dpp ?? true,
  });
  // Defaults on: the signature is the normal case, hiding it the exception.
  const [showSignature, setShowSignature] = useState(
    invoice?.show_signature ?? true
  );
  const [insertPaletteOpen, setInsertPaletteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<string>("");
  const isFirstRender = useRef(true);
  // The save currently in flight, if any. Two overlapping saves on a
  // new document both read the id as null from their own closure and
  // both call create — which is how autosave firing at 2.5s and
  // Cmd-Enter at 2.7s produced two documents and burned two numbers.
  const inFlightRef = useRef<Promise<Invoice | null> | null>(null);
  const removedItemRef = useRef<{ item: LineItemInput; index: number } | null>(
    null
  );

  // Mirrors update_invoice (00087): what locks an invoice is money having
  // moved against it, not it having been sent. A client asking for a
  // revision after issue is ordinary business.
  const isEditable =
    !invoice ||
    (!["cancelled", "refunded"].includes(invoice.status) &&
      (invoice.amount_paid ?? 0) === 0);

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

  const currentPayload: CreateInvoiceInput = {
    client_id: clientId,
    project_id: projectId,
    currency,
    issue_date: issueDate,
    due_date: dueDate,
    payment_terms: paymentTerms,
    notes,
    line_items: submittableLineItems,
  };

  const totals = computeLineItemTotals(submittableLineItems);

  // What autosave compares against. The customer PO saves through a
  // separate RPC, so it is not in currentPayload — but editing it still
  // has to mark the document dirty.
  const dirtyKey = JSON.stringify({
    payload: currentPayload,
    customer_po_number: customerPo,
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastSavedRef.current = dirtyKey;
      return;
    }
    if (dirtyKey !== lastSavedRef.current) setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientId,
    projectId,
    title,
    summary,
    currency,
    issueDate,
    dueDate,
    paymentTerms,
    customerPo,
    notes,
    lineItems,
  ]);

  const saveDraftInner = useCallback(async (): Promise<Invoice | null> => {
    if (!isEditable) return null;
    const parsed = createInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) {
      // Autosave used to return here silently, so a document missing a
      // client or project was never persisted while the pill kept
      // reading "Unsaved changes" with no reason given.
      setSaveStatus("error");
      return null;
    }

    setSaveStatus("saving");
    const result = invoiceId
      ? await updateInvoice(workspace.id, invoiceId, parsed.data)
      : await createInvoice(workspace.id, parsed.data);

    if (result.error) {
      setSaveStatus("error");
      toast(result.error, "error");
      return null;
    }

    lastSavedRef.current = dirtyKey;
    setIsDirty(false);
    setSaveStatus("saved");

    const savedId = invoiceId ?? result.data?.id;
    if (!invoiceId && result.data) {
      setInvoiceId(result.data.id);
    }

    // create_/update_ don't carry tax settings, so apply them in the same
    // save. Sequential rather than parallel: the row must exist first.
    if (savedId) {
      const taxResult = await setDocumentTaxSettings(
        workspace.id,
        "invoice",
        savedId,
        taxSettings
      );
      if (taxResult.error) {
        setSaveStatus("error");
        toast(taxResult.error, "error");
        return null;
      }

      const sigResult = await setDocumentSignatureVisibility(
        workspace.id,
        "invoice",
        savedId,
        showSignature
      );
      if (sigResult.error) {
        setSaveStatus("error");
        toast(sigResult.error, "error");
        return null;
      }

      const refResult = await setInvoiceReferences(workspace.id, savedId, {
        customer_po_number: customerPo.trim() || null,
      });
      if (refResult.error) {
        setSaveStatus("error");
        toast(refResult.error, "error");
        return null;
      }
    }

    return result.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPayload,
    invoiceId,
    workspace.id,
    workspace.slug,
    isEditable,
    showSignature,
    customerPo,
  ]);

  // One save at a time. A second caller awaits the first instead of
  // starting its own; the ref is cleared in finally so a failed save
  // does not wedge the builder.
  const saveDraft = useCallback(async (): Promise<Invoice | null> => {
    if (inFlightRef.current) return inFlightRef.current;
    const run = saveDraftInner();
    inFlightRef.current = run;
    try {
      return await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [saveDraftInner]);

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
    const parsed = createInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const wasNew = !invoiceId;
    const saved = await saveDraft();
    if (saved) {
      toast("Draft saved", "success");
      if (wasNew) {
        router.push(`/${workspace.slug}/invoices/${saved.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, invoiceId, workspace.slug]);

  const handleSendShortcut = useCallback(async () => {
    const parsed = createInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;

    const id = invoiceId ?? saved.id;
    // See the quotation builder: only a draft transitions on send; a
    // revision to an already-issued invoice just saves and re-notifies.
    const alreadyIssued = saved.status !== "draft";
    if (!alreadyIssued) {
      const statusResult = await updateInvoiceStatus(workspace.id, id, "sent");
      if (statusResult.error) {
        toast(statusResult.error, "error");
        return;
      }
    }
    toast(alreadyIssued ? "Invoice updated and re-sent" : "Invoice sent", "success");
    router.push(`/${workspace.slug}/invoices/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, invoiceId, workspace.id, workspace.slug]);

  // Keyboard shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+Enter send.
  // The arrow bodies below are expression form on purpose: with braces
  // they return undefined, React has no promise to track, and isPending
  // flips back immediately — so the keyboard path was never covered by
  // the pending guard the buttons rely on.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        startTransition(() => handleManualSave());
      } else if (e.key === "Enter") {
        e.preventDefault();
        startTransition(() => handleSendShortcut());
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleManualSave, handleSendShortcut]);

  // Enter-to-compose focus plumbing: when a row is created (Enter, or the
  // Add-item affordance) the new row's index lands here and the row takes
  // the caret, then reports back so the request doesn't re-fire. Pure
  // presentation state — never serialized, never saved.
  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  // Mirrors update_invoice (00087) and the edit route's own guard: a sent
  // invoice stays editable because clients do ask for revisions. Only
  // money having moved against it — or a cancel/refund — closes it.
  useEffect(() => {
    if (
      invoice &&
      (["cancelled", "refunded"].includes(invoice.status) ||
        (invoice.amount_paid ?? 0) > 0)
    ) {
      router.replace(`/${workspace.slug}/invoices/${invoice.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send-readiness: what still stands between this draft and the client.
  const readyReasons: string[] = [];
  if (!clientId) readyReasons.push("Choose a client");
  if (!projectId) readyReasons.push("Choose a project");
  if (submittableLineItems.length === 0)
    readyReasons.push("Add at least one item");

  // Send commits straight through the validate → save → mark-sent → route
  // path. Preview renders the real printed document from live state.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Bill To presentation: once a client is chosen the block reads as a
  // document recipient; "change" reopens the selector. Pure UI state.
  const [changingClient, setChangingClient] = useState(false);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // Disclosure chips: notes/terms editors are opt-in; documents that
  // already carry a value open with it expanded. Once opened they stay
  // open for the session — closing would read as losing the text.
  const [showNotes, setShowNotes] = useState(
    () => (invoice?.notes ?? defaultNotes ?? "") !== ""
  );
  const [showPaymentTerms, setShowPaymentTerms] = useState(
    () => (invoice?.payment_terms ?? defaultPaymentTerms ?? "") !== ""
  );

  // Document-level tax/discount defaults. Pure UI convenience over the
  // existing per-line fields: applying a default writes tax_percent /
  // discount_percent onto every line still *following* the previous
  // default; lines the user overrode ("pinned") keep their value and
  // their honesty badge. null = the document's lines are mixed. Initial
  // value is inferred from the loaded lines, so an existing uniform
  // draft reads back correctly. No schema involvement.
  const [docDiscount, setDocDiscount] = useState<number | null>(() =>
    inferUniform(
      (invoice?.line_items ?? []).map((li) => li.discount_percent ?? 0)
    )
  );

  // Applying defaults cascades through following lines in one state
  // update; the per-row rolling amounts + the rolling command-bar total
  // make the recomputation visible (the consent signal).
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

  // Enter in a row: commit it and compose the next line directly below,
  // same category — the type-an-invoice flow.
  function composeLineItemAfter(index: number) {
    setLineItems((prev) => {
      const category = prev[index]?.category ?? "per_unit";
      const next = [...prev];
      next.splice(index + 1, 0, newFollowingItem(category));
      return next;
    });
    setFocusRequest(index + 1);
  }

  // Backspace on an already-empty row: remove it silently (no undo toast —
  // there is nothing to undo) and hand the caret to the previous row.
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

  // Palette inserts keep the palette open (its inline "Inserted" flash is
  // the feedback). Template bundles keep their saved per-line values —
  // they are deliberate; catalog lines are born following the document
  // defaults like any other new line.
  function handleInsertTemplate(items: LineItemInput[]) {
    setLineItems((prev) => [...prev, ...items]);
  }

  function handleInsertCatalogItem(item: LineItemInput) {
    setLineItems((prev) => [
      ...prev,
      {
        ...item,
        tax_percent: 0,
        discount_percent: docDiscount ?? 0,
      },
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
      invoiceId
        ? `/${workspace.slug}/invoices/${invoiceId}`
        : `/${workspace.slug}/invoices`
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
  // catalog_item_id) and render the live breakdown underneath — "live"
  // per the product decision: editing a package's contents later restyles
  // how it displays here and on past documents, while the price already
  // captured on this line item never changes retroactively.
  const catalogItemsById: Record<string, CatalogItem> = {};
  catalogItems.forEach((item) => {
    catalogItemsById[item.id] = item;
  });

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <BackButton onClick={handleCancel} label={invoice ? "Back to Invoice" : "Back to Invoices"} />

      <BuilderCommandBar
        docLabel={invoice ? `Edit ${invoice.invoice_number}` : "New Invoice"}
        saveStatus={saveStatus}
        isDirty={isDirty}
        total={totals.total}
        isPending={isPending}
        onCancel={handleCancel}
        onSave={() => startTransition(() => handleManualSave())}
        onPreview={() => setPreviewOpen(true)}
        onSend={() => startTransition(() => handleSendShortcut())}
        readyReasons={readyReasons}
        sendLabel="Send"
      />

      {/* The document sheet: one continuous surface that reads like the
          invoice it produces — masthead, recipient + properties, the
          line-item ledger as the hero, then notes and totals at the foot.
          Hierarchy comes from type and whitespace, not card borders. */}
      <div className="rounded-xl border bg-card px-5 py-8 shadow-2xs sm:px-14 sm:py-12">
        {/* Letterhead — whose document this is. Ownership, not chrome:
            the workspace's own mark (name if no logo — never a broken
            frame) opposite the document type eyebrow. */}
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
            Invoice
          </span>
        </div>

        {/* Recipient + document properties */}
        <div className="mt-8 grid gap-x-16 gap-y-8 border-t pt-8 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Bill To
            </p>
            <div className="mt-2.5">
              {selectedClient && !changingClient ? (
                // The chosen recipient reads as a document address block,
                // not a form control; "change" whispers in on hover.
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
                  onChange={(id) => {
                    setClientId(id);
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
              <span className="text-xs text-muted-foreground">Due date</span>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">Customer PO</span>
              <Input
                value={customerPo}
                onChange={(e) => setCustomerPo(e.target.value)}
                placeholder="Client's PO number (optional)"
                className="h-8"
              />
            </div>
          </div>
        </div>

        {/* The hero: the full-width line-item ledger. */}
        <div className="mt-10 border-t pt-8">
          <LineItemsEditor
            itemsByCategory={itemsByCategory}
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

        {/* Foot: opt-in notes/terms as disclosure chips on the left (the
            80% of invoices that omit them pay no visual tax), the
            document-realistic totals block bottom-right. */}
        <div className="mt-10 grid gap-x-16 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {showNotes ? (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <BuilderSectionHeader
                  label="Note to Client"
                  removeLabel="Remove note"
                  onRemove={() => {
                    setShowNotes(false);
                    setNotes("");
                  }}
                />
                <div className="mt-2.5">
                  <RichTextEditor
                    value={notes}
                    onChange={setNotes}
                    placeholder="Add notes for your client..."
                  />
                </div>
              </div>
            ) : null}
            {showPaymentTerms ? (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <BuilderSectionHeader
                  label="Payment Terms"
                  removeLabel="Remove payment terms"
                  onRemove={() => {
                    setShowPaymentTerms(false);
                    setPaymentTerms("");
                  }}
                />
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g. Net 30, due upon receipt"
                  className="mt-2.5"
                />
              </div>
            ) : null}
            {(!showNotes || !showPaymentTerms) && (
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
                {!showPaymentTerms && (
                  <button
                    type="button"
                    onClick={() => setShowPaymentTerms(true)}
                    className="rounded-full border border-dashed px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                  >
                    + Payment terms
                  </button>
                )}
              </div>
            )}
          </div>

          <TaxBreakdownEditor
            hargaJual={totals.subtotal - totals.discount_amount}
            settings={taxSettings}
            onChange={(next) => {
              setTaxSettings(next);
              setIsDirty(true);
            }}
            disabled={!isEditable}
          />

          <SignatureToggle
            checked={showSignature}
            onChange={(next) => {
              setShowSignature(next);
              setIsDirty(true);
            }}
            disabled={!isEditable}
          />
        </div>
      </div>

      <InsertPalette
        open={insertPaletteOpen}
        onOpenChange={setInsertPaletteOpen}
        catalogItems={catalogItems}
        templates={templates}
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

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        workspaceName={workspace.name}
        logoUrl={workspace.logo_url}
        companyProfile={workspace.settings?.company_profile}
        branding={workspace.settings?.branding}
        paymentDetails={workspace.settings?.payment_details}
        documentLabel="Invoice"
        party={{
          heading: "Bill To",
          name: selectedClient?.name ?? "No client selected",
          lines: [selectedClient?.company, selectedClient?.email],
        }}
        meta={[
          { label: "Invoice Date", value: issueDate || "—" },
          { label: "Invoice Number", value: invoice?.invoice_number ?? "Draft" },
          ...(customerPo.trim()
            ? [{ label: "Customer PO", value: customerPo.trim() }]
            : []),
        ]}
        lines={submittableLineItems.map((item, i) => ({
          id: String(i),
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || null,
          unit_price: item.unit_price,
          line_total:
            item.quantity *
            item.unit_price *
            (1 - (item.discount_percent ?? 0) / 100),
        }))}
        totalRows={taxTotalRows(
          computeTaxBreakdown(totals.subtotal - totals.discount_amount, taxSettings),
          taxSettings,
          formatCurrency
        )}
        total={{
          label: "Total",
          value: formatCurrency(
            computeTaxBreakdown(totals.subtotal - totals.discount_amount, taxSettings)
              .total
          ),
        }}
        notes={notes}
        terms={paymentTerms}
        showSignature={showSignature}
      />
    </div>
  );
}
