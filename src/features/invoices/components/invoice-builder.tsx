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
import { TemplatePickerDialog } from "@/features/line-items/components/template-picker-dialog";
import { SaveAsTemplateDialog } from "@/features/line-items/components/save-as-template-dialog";
import { CatalogPickerDialog } from "@/features/line-items/components/catalog-picker-dialog";
import {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
} from "@/features/invoices/actions";
import {
  createInvoiceSchema,
  type CreateInvoiceInput,
} from "@/features/invoices/validators";
import type { LineItemInput } from "@/features/line-items/validators";
import { computeLineItemTotals } from "@/features/line-items/helpers";
import type {
  LineItemCategory,
  ClientSummary,
  TemplateWithItems,
} from "@/features/line-items/types";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types";
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

type InvoiceBuilderProps = {
  invoice?: InvoiceDetail;
  clients: ClientSummary[];
  templates: TemplateWithItems[];
  catalogItems: CatalogItem[];
  initialClientId?: string;
  defaultPaymentTerms?: string;
  defaultNotes?: string;
};

export function InvoiceBuilder({
  invoice,
  clients,
  templates: initialTemplates,
  catalogItems,
  initialClientId,
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
  const [title, setTitle] = useState(invoice?.title ?? "");
  const [summary, setSummary] = useState(invoice?.summary ?? "");
  const [currency, setCurrency] = useState(
    invoice?.currency ??
      clients.find((c) => c.id === initialClientId)?.preferred_currency ??
      workspace.default_currency
  );
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? todayISO());
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState(
    invoice?.payment_terms ?? defaultPaymentTerms ?? ""
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
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<string>("");
  const isFirstRender = useRef(true);
  const removedItemRef = useRef<{ item: LineItemInput; index: number } | null>(
    null
  );

  const isEditable = !invoice || invoice.status === "draft";

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
    title,
    summary,
    currency,
    issue_date: issueDate,
    due_date: dueDate,
    payment_terms: paymentTerms,
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
    clientId,
    title,
    summary,
    currency,
    issueDate,
    dueDate,
    paymentTerms,
    notes,
    lineItems,
  ]);

  const saveDraft = useCallback(async (): Promise<Invoice | null> => {
    if (!isEditable) return null;
    const parsed = createInvoiceSchema.safeParse(currentPayload);
    if (!parsed.success) return null;

    setSaveStatus("saving");
    const result = invoiceId
      ? await updateInvoice(workspace.id, invoiceId, parsed.data)
      : await createInvoice(workspace.id, parsed.data);

    if (result.error) {
      setSaveStatus("error");
      toast(result.error, "error");
      return null;
    }

    lastSavedRef.current = JSON.stringify(currentPayload);
    setIsDirty(false);
    setSaveStatus("saved");

    if (!invoiceId && result.data) {
      setInvoiceId(result.data.id);
    }

    return result.data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, invoiceId, workspace.id, workspace.slug, isEditable]);

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
    const statusResult = await updateInvoiceStatus(workspace.id, id, "sent");
    if (statusResult.error) {
      toast(statusResult.error, "error");
      return;
    }
    toast("Invoice sent", "success");
    router.push(`/${workspace.slug}/invoices/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPayload, saveDraft, invoiceId, workspace.id, workspace.slug]);

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

  // Enter-to-compose focus plumbing: when a row is created (Enter, or the
  // Add-item affordance) the new row's index lands here and the row takes
  // the caret, then reports back so the request doesn't re-fire. Pure
  // presentation state — never serialized, never saved.
  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const handleFocusHandled = useCallback(() => setFocusRequest(null), []);

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
    setLineItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function addLineItem(category: LineItemCategory) {
    setFocusRequest(lineItems.length);
    setLineItems((prev) => [...prev, emptyItem(category)]);
  }

  // Enter in a row: commit it and compose the next line directly below,
  // same category — the type-an-invoice flow.
  function composeLineItemAfter(index: number) {
    setLineItems((prev) => {
      const category = prev[index]?.category ?? "per_unit";
      const next = [...prev];
      next.splice(index + 1, 0, emptyItem(category));
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

  function handleInsertTemplate(items: LineItemInput[]) {
    setLineItems((prev) => [...prev, ...items]);
    setTemplatePickerOpen(false);
    toast("Template items inserted", "success");
  }

  function handleInsertCatalogItem(item: LineItemInput) {
    setLineItems((prev) => [...prev, item]);
    setCatalogPickerOpen(false);
    toast("Catalog item inserted", "success");
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

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <BackButton onClick={handleCancel} label={invoice ? "Back to Invoice" : "Back to Invoices"} />

      <BuilderCommandBar
        docLabel={invoice ? `Edit ${invoice.invoice_number}` : "New Invoice"}
        saveStatus={saveStatus}
        isDirty={isDirty}
        total={totals.total}
        currency={currency}
        isPending={isPending}
        onCancel={handleCancel}
        onSave={() => startTransition(() => handleManualSave())}
        onSend={() => startTransition(() => handleSendShortcut())}
      />

      {/* The document sheet: one continuous surface that reads like the
          invoice it produces — masthead, recipient + properties, the
          line-item ledger as the hero, then notes and totals at the foot.
          Hierarchy comes from type and whitespace, not card borders. */}
      <div className="rounded-xl border bg-card px-5 py-8 shadow-2xs sm:px-14 sm:py-12">
        {/* Masthead — the document names itself; no boxed inputs. */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled invoice"
          className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/30"
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
              Bill To
            </p>
            <div className="mt-2.5">
              <ClientSelector
                clients={clients}
                value={clientId}
                onChange={(id, client) => {
                  setClientId(id);
                  setCurrency(client.preferred_currency ?? workspace.default_currency);
                }}
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
            onAdd={addLineItem}
            onUpdate={updateLineItem}
            onRemove={removeLineItem}
            onOpenCatalog={() => setCatalogPickerOpen(true)}
            onOpenTemplate={() => setTemplatePickerOpen(true)}
            onOpenSaveTemplate={() => setSaveTemplateOpen(true)}
            onComposeAfter={composeLineItemAfter}
            onDeleteEmpty={deleteEmptyLineItem}
            focusIndex={focusRequest}
            onFocusHandled={handleFocusHandled}
          />
        </div>

        {/* Foot: client-facing notes on the left, the document-realistic
            totals block bottom-right — where an invoice keeps them. */}
        <div className="mt-10 grid gap-x-16 gap-y-8 border-t pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <div className="mt-2.5">
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Add notes for your client..."
                />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Payment Terms
              </p>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 30, due upon receipt"
                className="mt-2.5"
              />
            </div>
          </div>

          <div className="space-y-2.5 self-end text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {formatCurrency(totals.subtotal, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                −{formatCurrency(totals.discount_amount, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">
                {formatCurrency(totals.tax_amount, currency)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <TemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        templates={templates}
        onInsert={handleInsertTemplate}
      />
      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        items={submittableLineItems}
        onSaved={(t) => setTemplates((prev) => [t, ...prev])}
      />
      <CatalogPickerDialog
        open={catalogPickerOpen}
        onOpenChange={setCatalogPickerOpen}
        catalogItems={catalogItems}
        documentCurrency={currency}
        onInsert={handleInsertCatalogItem}
      />
    </div>
  );
}
