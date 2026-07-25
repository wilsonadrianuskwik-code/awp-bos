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
import { formatCurrency } from "@/lib/utils/format-currency";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import { BuilderCommandBar } from "@/features/documents/components/builder-command-bar";
import { LineItemsEditor } from "@/features/documents/components/line-items-editor";
import { InsertPalette } from "@/features/documents/components/insert-palette";
import {
  createProformaInvoice,
  updateProformaInvoice,
  updateProformaInvoiceStatus,
} from "@/features/proforma-invoices/actions";
import {
  createProformaInvoiceSchema,
  type CreateProformaInvoiceInput,
} from "@/features/proforma-invoices/validators";
import type { LineItemInput } from "@/features/line-items/validators";
import { computeLineItemTotals } from "@/features/line-items/helpers";
import type {
  LineItemCategory,
  ClientSummary,
  TemplateWithItems,
} from "@/features/line-items/types";
import type {
  ProformaInvoice,
  ProformaInvoiceDetail,
} from "@/features/proforma-invoices/types";
import type { CatalogItem } from "@/features/catalog/types";
import type { Project } from "@/features/projects/types";
import { TaxBreakdownEditor } from "@/features/documents/components/tax-breakdown-editor";
import { setDocumentTaxSettings } from "@/features/documents/actions";
import type { TaxSettings } from "@/features/documents/tax";

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

type ProformaInvoiceBuilderProps = {
  proformaInvoice?: ProformaInvoiceDetail;
  clients: ClientSummary[];
  projects: Project[];
  templates: TemplateWithItems[];
  catalogItems: CatalogItem[];
  initialClientId?: string;
};

export function ProformaInvoiceBuilder({
  proformaInvoice,
  clients,
  projects,
  templates,
  catalogItems,
  initialClientId,
}: ProformaInvoiceBuilderProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [piId, setPiId] = useState<string | null>(proformaInvoice?.id ?? null);
  const [clientId, setClientId] = useState(
    proformaInvoice?.client_id ?? initialClientId ?? ""
  );
  const [projectId, setProjectId] = useState(proformaInvoice?.project_id ?? "");
  const [title, setTitle] = useState(proformaInvoice?.title ?? "");
  const [currency, setCurrency] = useState(
    proformaInvoice?.currency ??
      clients.find((c) => c.id === initialClientId)?.preferred_currency ??
      workspace.default_currency
  );
  const [issueDate, setIssueDate] = useState(
    proformaInvoice?.issue_date ?? todayISO()
  );
  const [expiryDate, setExpiryDate] = useState(proformaInvoice?.expiry_date ?? "");
  const [terms, setTerms] = useState(proformaInvoice?.terms_and_conditions ?? "");
  const [notes, setNotes] = useState(proformaInvoice?.notes ?? "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    proformaInvoice?.line_items?.length
      ? proformaInvoice.line_items.map((li) => ({
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
  // Tax settings live on the document row, but the builder needs them
  // before the row exists, so they're held here and persisted right after
  // the draft saves (see saveDraft below).
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    dpp_numerator: proformaInvoice?.dpp_numerator ?? 11,
    dpp_denominator: proformaInvoice?.dpp_denominator ?? 12,
    ppn_percent: proformaInvoice?.ppn_percent ?? 12,
    pph_percent: proformaInvoice?.pph_percent ?? null,
    retensi_percent: proformaInvoice?.retensi_percent ?? null,
  });
  const [insertPaletteOpen, setInsertPaletteOpen] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<string>("");
  const isFirstRender = useRef(true);

  const isEditable = !proformaInvoice || proformaInvoice.status === "draft";

  const submittableLineItems = lineItems.filter(
    (item) => item.description.trim() !== ""
  );

  const currentPayload: CreateProformaInvoiceInput = {
    client_id: clientId,
    project_id: projectId,
    title,
    currency,
    issue_date: issueDate,
    expiry_date: expiryDate,
    terms_and_conditions: terms,
    notes,
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
  }, [clientId, projectId, title, currency, issueDate, expiryDate, terms, notes, lineItems]);

  const saveDraft = useCallback(async (): Promise<ProformaInvoice | null> => {
    if (!isEditable) return null;
    const parsed = createProformaInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) return null;

    setSaveStatus("saving");
    const result = piId
      ? await updateProformaInvoice(workspace.id, piId, parsed.data)
      : await createProformaInvoice(workspace.id, parsed.data);

    if (result.error) {
      setSaveStatus("error");
      toast(result.error, "error");
      return null;
    }

    lastSavedRef.current = JSON.stringify(currentPayload);
    setIsDirty(false);
    setSaveStatus("saved");

    const savedId = piId ?? result.data?.id;
    if (!piId && result.data) {
      setPiId(result.data.id);
    }

    // create_/update_ don't carry tax settings, so apply them in the same
    // save. Sequential rather than parallel: the row must exist first.
    if (savedId) {
      const taxResult = await setDocumentTaxSettings(
        workspace.id,
        "proforma_invoice",
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
  }, [currentPayload, piId, workspace.id, isEditable]);

  useEffect(() => {
    if (!isDirty || !isEditable) return;
    const timeout = setTimeout(() => {
      startTransition(() => {
        saveDraft();
      });
    }, 2500);
    return () => clearTimeout(timeout);
  }, [isDirty, isEditable, saveDraft]);

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
    const parsed = createProformaInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const wasNew = !piId;
    const saved = await saveDraft();
    if (saved) {
      toast("Draft saved", "success");
      if (wasNew) {
        router.push(`/${workspace.slug}/proforma-invoices/${saved.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, piId, workspace.slug]);

  const handleSend = useCallback(async () => {
    const parsed = createProformaInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;

    const id = piId ?? saved.id;
    const statusResult = await updateProformaInvoiceStatus(workspace.id, id, "sent");
    if (statusResult.error) {
      toast(statusResult.error, "error");
      return;
    }
    toast("Proforma invoice sent", "success");
    router.push(`/${workspace.slug}/proforma-invoices/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, piId, workspace.id, workspace.slug]);

  useEffect(() => {
    if (proformaInvoice && proformaInvoice.status !== "draft") {
      router.replace(`/${workspace.slug}/proforma-invoices/${proformaInvoice.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  const [changingClient, setChangingClient] = useState(false);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const [showNotes, setShowNotes] = useState(() => (proformaInvoice?.notes ?? "") !== "");
  const [showTerms, setShowTerms] = useState(
    () => (proformaInvoice?.terms_and_conditions ?? "") !== ""
  );

  const [docTax, setDocTax] = useState<number | null>(() =>
    inferUniform((proformaInvoice?.line_items ?? []).map((li) => li.tax_percent ?? 0))
  );
  const [docDiscount, setDocDiscount] = useState<number | null>(() =>
    inferUniform((proformaInvoice?.line_items ?? []).map((li) => li.discount_percent ?? 0))
  );

  // Derived rather than state: applying a unit rewrites every line, so
  // reading it back from the lines is always accurate and can't drift.
  const docUnit = inferUniformUnit(
    lineItems
      .filter((item) => item.description.trim() !== "")
      .map((item) => item.unit ?? "")
  );

  function applyDocDefaults(nextTax: number, nextDiscount: number, nextUnit: string) {
    setLineItems((prev) =>
      prev.map((item) => {
        const patch: Partial<LineItemInput> = {};
        if (docTax === null || (item.tax_percent ?? 0) === docTax) patch.tax_percent = nextTax;
        if (docDiscount === null || (item.discount_percent ?? 0) === docDiscount)
          patch.discount_percent = nextDiscount;
        // Unit applies to every line unconditionally — there's no
        // per-line "override" concept for it the way there is for
        // tax/discount, and setting it blank would silently wipe units.
        if (nextUnit !== "") patch.unit = nextUnit;
        return { ...item, ...patch };
      })
    );
    setDocTax(nextTax);
    setDocDiscount(nextDiscount);
  }

  const readyReasons: string[] = [];
  if (!clientId) readyReasons.push("Choose a client");
  if (submittableLineItems.length === 0) readyReasons.push("Add at least one item");

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
    setLineItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function newFollowingItem(category: LineItemCategory): LineItemInput {
    return { ...emptyItem(category), tax_percent: docTax ?? 0, discount_percent: docDiscount ?? 0 };
  }

  function addLineItem(category: LineItemCategory) {
    setFocusRequest(lineItems.length);
    setLineItems((prev) => [...prev, newFollowingItem(category)]);
  }

  function composeLineItemAfter(index: number) {
    setLineItems((prev) => {
      const category = prev[index]?.category ?? "per_unit";
      const next = [...prev];
      next.splice(index + 1, 0, newFollowingItem(category));
      return next;
    });
    setFocusRequest(index + 1);
  }

  function deleteEmptyLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
    setFocusRequest(index > 0 ? index - 1 : null);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleInsertTemplate(items: LineItemInput[]) {
    setLineItems((prev) => [...prev, ...items]);
  }

  function handleInsertCatalogItem(item: LineItemInput) {
    setLineItems((prev) => [
      ...prev,
      { ...item, tax_percent: docTax ?? 0, discount_percent: docDiscount ?? 0 },
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
      piId
        ? `/${workspace.slug}/proforma-invoices/${piId}`
        : `/${workspace.slug}/proforma-invoices`
    );
  }

  const itemsByCategory: Record<
    LineItemCategory,
    { item: LineItemInput; originalIndex: number }[]
  > = { package: [], add_on: [], per_unit: [] };
  lineItems.forEach((item, originalIndex) => {
    itemsByCategory[item.category].push({ item, originalIndex });
  });

  const catalogItemsById: Record<string, CatalogItem> = {};
  catalogItems.forEach((item) => {
    catalogItemsById[item.id] = item;
  });

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <BackButton
        onClick={handleCancel}
        label={proformaInvoice ? "Back to Proforma Invoice" : "Back to Proforma Invoices"}
      />

      <BuilderCommandBar
        docLabel={proformaInvoice ? `Edit ${proformaInvoice.pi_number}` : "New Proforma Invoice"}
        saveStatus={saveStatus}
        isDirty={isDirty}
        total={totals.total}
        currency={currency}
        isPending={isPending}
        onCancel={handleCancel}
        onSave={() => startTransition(() => handleManualSave())}
        onSend={() => startTransition(() => handleSend())}
        readyReasons={readyReasons}
        sendLabel="Save & Send"
      />

      <div className="rounded-xl border bg-card px-5 py-8 shadow-2xs sm:px-14 sm:py-12">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {workspace.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logo_url} alt={workspace.name} className="h-7 w-auto" />
            ) : (
              <p className="text-[15px] font-semibold tracking-tight">{workspace.name}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Proforma Invoice
          </span>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled proforma invoice"
          className="mt-9 w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/30"
        />

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
                      <p className="text-[15px] font-semibold">{selectedClient.name}</p>
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
                    setCurrency(client.preferred_currency ?? workspace.default_currency);
                    setChangingClient(false);
                  }}
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-[96px_1fr] items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Project <span className="text-destructive">*</span>
              </span>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

        <div className="mt-10 border-t pt-8">
          <LineItemsEditor
            itemsByCategory={itemsByCategory}
            currency={currency}
            catalogItemsById={catalogItemsById}
            onAdd={addLineItem}
            onUpdate={updateLineItem}
            onRemove={removeLineItem}
            onOpenSaveTemplate={() => {}}
            onOpenInsertPalette={() => setInsertPaletteOpen(true)}
            onComposeAfter={composeLineItemAfter}
            onDeleteEmpty={deleteEmptyLineItem}
            focusIndex={focusRequest}
            onFocusHandled={handleFocusHandled}
            docTax={docTax}
            docDiscount={docDiscount}
            docUnit={docUnit}
            onApplyDefaults={applyDocDefaults}
          />
        </div>

        <div className="mt-10 grid gap-x-16 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {showNotes && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Note to Client
                </p>
                <div className="mt-2.5">
                  <RichTextEditor value={notes} onChange={setNotes} placeholder="Add notes..." />
                </div>
              </div>
            )}
            {showTerms && (
              <div>
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
            {(!showNotes || !showTerms) && (
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

      <InsertPalette
        open={insertPaletteOpen}
        onOpenChange={setInsertPaletteOpen}
        catalogItems={catalogItems}
        templates={templates}
        documentCurrency={currency}
        onInsertCatalog={handleInsertCatalogItem}
        onInsertTemplate={handleInsertTemplate}
      />
    </div>
  );
}
