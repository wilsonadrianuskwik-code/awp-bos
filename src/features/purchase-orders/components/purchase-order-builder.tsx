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
import { SupplierSelector } from "@/features/purchase-orders/components/supplier-selector";
import { BuilderCommandBar } from "@/features/documents/components/builder-command-bar";
import { LineItemsEditor } from "@/features/documents/components/line-items-editor";
import { SaveAsTemplateDialog } from "@/features/line-items/components/save-as-template-dialog";
import { InsertPalette } from "@/features/documents/components/insert-palette";
import { ReviewSendOverlay } from "@/features/documents/components/review-send-overlay";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
} from "@/features/purchase-orders/actions";
import {
  createPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from "@/features/purchase-orders/validators";
import type { LineItemInput } from "@/features/line-items/validators";
import { computeLineItemTotals } from "@/features/line-items/helpers";
import type { LineItemCategory, TemplateWithItems } from "@/features/line-items/types";
import type { SupplierSummary } from "@/features/suppliers/types";
import type {
  ProjectSummary,
  PurchaseOrder,
  PurchaseOrderDetail,
} from "@/features/purchase-orders/types";
import type { CatalogItem } from "@/features/catalog/types";

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

type PurchaseOrderBuilderProps = {
  purchaseOrder?: PurchaseOrderDetail;
  suppliers: SupplierSummary[];
  projects: ProjectSummary[];
  templates: TemplateWithItems[];
  catalogItems: CatalogItem[];
  initialSupplierId?: string;
  defaultTerms?: string;
  defaultNotes?: string;
};

// Mirrors InvoiceBuilder (@/features/invoices/components/invoice-builder)
// almost exactly — same autosave/keyboard-shortcut/disclosure machinery
// from the shared documents/components internals, with a supplier picker
// + optional project picker in place of the client picker.
export function PurchaseOrderBuilder({
  purchaseOrder,
  suppliers,
  projects,
  templates: initialTemplates,
  catalogItems,
  initialSupplierId,
  defaultTerms,
  defaultNotes,
}: PurchaseOrderBuilderProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [poId, setPoId] = useState<string | null>(purchaseOrder?.id ?? null);
  const [supplierId, setSupplierId] = useState(
    purchaseOrder?.supplier_id ?? initialSupplierId ?? ""
  );
  const [projectId, setProjectId] = useState(purchaseOrder?.project_id ?? "");
  const [title, setTitle] = useState(purchaseOrder?.title ?? "");
  const [currency, setCurrency] = useState(
    purchaseOrder?.currency ??
      suppliers.find((s) => s.id === initialSupplierId)?.preferred_currency ??
      workspace.default_currency
  );
  const [issueDate, setIssueDate] = useState(purchaseOrder?.issue_date ?? todayISO());
  const [expectedDate, setExpectedDate] = useState(purchaseOrder?.expected_date ?? "");
  const [termsAndConditions, setTermsAndConditions] = useState(
    purchaseOrder?.terms_and_conditions ?? defaultTerms ?? ""
  );
  const [notes, setNotes] = useState(purchaseOrder?.notes ?? defaultNotes ?? "");
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    purchaseOrder?.line_items?.length
      ? purchaseOrder.line_items.map((li) => ({
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

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedRef = useRef<string>("");
  const isFirstRender = useRef(true);
  const removedItemRef = useRef<{ item: LineItemInput; index: number } | null>(null);

  // Mirrors update_purchase_order (00087): editable until goods start
  // arriving — changing quantities after a receipt would contradict what
  // was physically delivered.
  const isEditable =
    !purchaseOrder ||
    !["cancelled", "partially_received", "received"].includes(
      purchaseOrder.status
    );

  const submittableLineItems = lineItems.filter((item) => item.description.trim() !== "");

  const currentPayload: CreatePurchaseOrderInput = {
    supplier_id: supplierId,
    project_id: projectId,
    currency,
    issue_date: issueDate,
    expected_date: expectedDate,
    title,
    terms_and_conditions: termsAndConditions,
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
  }, [
    supplierId,
    projectId,
    title,
    currency,
    issueDate,
    expectedDate,
    termsAndConditions,
    notes,
    lineItems,
  ]);

  const saveDraft = useCallback(async (): Promise<PurchaseOrder | null> => {
    if (!isEditable) return null;
    const parsed = createPurchaseOrderSchema.safeParse(currentPayload);
    if (!parsed.success) return null;

    setSaveStatus("saving");
    const result = poId
      ? await updatePurchaseOrder(workspace.id, poId, parsed.data)
      : await createPurchaseOrder(workspace.id, parsed.data);

    if (result.error) {
      setSaveStatus("error");
      toast(result.error, "error");
      return null;
    }

    lastSavedRef.current = JSON.stringify(currentPayload);
    setIsDirty(false);
    setSaveStatus("saved");

    if (!poId && result.data) {
      setPoId(result.data.id);
    }

    return result.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, poId, workspace.id, workspace.slug, isEditable]);

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
    const parsed = createPurchaseOrderSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const wasNew = !poId;
    const saved = await saveDraft();
    if (saved) {
      toast("Draft saved", "success");
      if (wasNew) {
        router.push(`/${workspace.slug}/purchase-orders/${saved.id}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, poId, workspace.slug]);

  const handleSendShortcut = useCallback(async () => {
    const parsed = createPurchaseOrderSchema.safeParse(currentPayload);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;

    const id = poId ?? saved.id;
    const statusResult = await updatePurchaseOrderStatus(workspace.id, id, "sent");
    if (statusResult.error) {
      toast(statusResult.error, "error");
      return;
    }
    toast("Purchase order sent", "success");
    router.push(`/${workspace.slug}/purchase-orders/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, poId, workspace.id, workspace.slug]);

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

  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  useEffect(() => {
    // Mirrors update_purchase_order (00087): locked once goods start
    // arriving or the order is cancelled — not merely once it is sent.
    if (
      purchaseOrder &&
      ["cancelled", "partially_received", "received"].includes(
        purchaseOrder.status
      )
    ) {
      router.replace(`/${workspace.slug}/purchase-orders/${purchaseOrder.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readyReasons: string[] = [];
  if (!supplierId) readyReasons.push("Choose a supplier");
  if (submittableLineItems.length === 0) readyReasons.push("Add at least one item");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [changingSupplier, setChangingSupplier] = useState(false);
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;

  const [showNotes, setShowNotes] = useState(
    () => (purchaseOrder?.notes ?? defaultNotes ?? "") !== ""
  );
  const [showTerms, setShowTerms] = useState(
    () => (purchaseOrder?.terms_and_conditions ?? defaultTerms ?? "") !== ""
  );

  const [docTax, setDocTax] = useState<number | null>(() =>
    inferUniform((purchaseOrder?.line_items ?? []).map((li) => li.tax_percent ?? 0))
  );
  const [docDiscount, setDocDiscount] = useState<number | null>(() =>
    inferUniform((purchaseOrder?.line_items ?? []).map((li) => li.discount_percent ?? 0))
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
        if (docTax === null || (item.tax_percent ?? 0) === docTax) {
          patch.tax_percent = nextTax;
        }
        if (docDiscount === null || (item.discount_percent ?? 0) === docDiscount) {
          patch.discount_percent = nextDiscount;
        }
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

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
    setLineItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function newFollowingItem(category: LineItemCategory): LineItemInput {
    return {
      ...emptyItem(category),
      tax_percent: docTax ?? 0,
      discount_percent: docDiscount ?? 0,
    };
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
      poId
        ? `/${workspace.slug}/purchase-orders/${poId}`
        : `/${workspace.slug}/purchase-orders`
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
        label={purchaseOrder ? "Back to Purchase Order" : "Back to Purchase Orders"}
      />

      <BuilderCommandBar
        docLabel={purchaseOrder ? `Edit ${purchaseOrder.po_number}` : "New Purchase Order"}
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
            Purchase Order
          </span>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled purchase order"
          className="mt-9 w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/30"
        />

        <div className="mt-8 grid gap-x-16 gap-y-8 border-t pt-8 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Supplier
            </p>
            <div className="mt-2.5">
              {selectedSupplier && !changingSupplier ? (
                <div className="group/supplier">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{selectedSupplier.name}</p>
                      {(selectedSupplier.company || selectedSupplier.email) && (
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                          {[selectedSupplier.company, selectedSupplier.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setChangingSupplier(true)}
                      className="shrink-0 rounded-md px-2 py-1 text-[13px] text-muted-foreground opacity-0 transition-all duration-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/supplier:opacity-100"
                    >
                      change
                    </button>
                  </div>
                </div>
              ) : (
                <SupplierSelector
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(id, supplier) => {
                    setSupplierId(id);
                    setCurrency(supplier.preferred_currency ?? workspace.default_currency);
                    setChangingSupplier(false);
                  }}
                />
              )}
            </div>

            <p className="mt-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Project <span className="text-destructive">*</span>
            </p>
            <div className="mt-2.5">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} · {p.name}
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
              <span className="text-xs text-muted-foreground">Expected date</span>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
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
            onOpenSaveTemplate={() => setSaveTemplateOpen(true)}
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
            {showNotes ? (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Note to Supplier
                </p>
                <div className="mt-2.5">
                  <RichTextEditor
                    value={notes}
                    onChange={setNotes}
                    placeholder="Add notes for your supplier..."
                  />
                </div>
              </div>
            ) : null}
            {showTerms ? (
              <div className="duration-200 animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Terms &amp; Conditions
                </p>
                <Input
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  placeholder="e.g. Net 30, delivery within 14 days"
                  className="mt-2.5"
                />
              </div>
            ) : null}
            {(!showNotes || !showTerms) && (
              <div className="flex flex-wrap gap-2">
                {!showNotes && (
                  <button
                    type="button"
                    onClick={() => setShowNotes(true)}
                    className="rounded-full border border-dashed px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                  >
                    + Note to supplier
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

          <div className="space-y-2.5 self-end text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(totals.subtotal, currency)}</span>
            </div>
            {totals.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="tabular-nums text-red-600 dark:text-red-400">
                  −{formatCurrency(totals.discount_amount, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Tax{docTax !== null && docTax > 0 ? ` (${docTax}%)` : ""}
              </span>
              <span className="tabular-nums">{formatCurrency(totals.tax_amount, currency)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-[15px] font-medium">Total</span>
              <span className="text-3xl font-semibold tabular-nums tracking-tight">
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ReviewSendOverlay
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        docNoun="purchase order"
        workspaceName={workspace.name}
        title={title}
        recipientName={selectedSupplier?.name ?? "—"}
        recipientDetail={[selectedSupplier?.company, selectedSupplier?.email]
          .filter(Boolean)
          .join(" · ")}
        meta={[
          { label: "Issue date", value: issueDate || "—" },
          { label: "Expected date", value: expectedDate || "—" },
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
