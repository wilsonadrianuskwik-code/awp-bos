"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileUp, Loader2, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/shared/back-button";
import { SaveStatusPill } from "@/components/shared/save-status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { ClientSelector } from "@/features/line-items/components/client-selector";
import {
  LineItemRow,
  LINE_ITEM_GRID_COLS,
} from "@/features/line-items/components/line-item-row";
import { PricingSummary } from "@/features/line-items/components/pricing-summary";
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
import {
  LINE_ITEM_CATEGORIES,
  type LineItemCategory,
  type ClientSummary,
  type TemplateWithItems,
} from "@/features/line-items/types";
import type { Invoice, InvoiceDetail } from "@/features/invoices/types";
import type { CatalogItem } from "@/features/catalog/types";

const CURRENCIES = ["IDR", "USD", "EUR", "GBP", "SGD", "MYR", "AUD", "CAD"];

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Packages",
  add_on: "Add-ons",
  per_unit: "Per-unit",
};

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
  const [activeCategory, setActiveCategory] =
    useState<LineItemCategory>("per_unit");
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

  function updateLineItem(index: number, patch: Partial<LineItemInput>) {
    setLineItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...patch } : it))
    );
  }

  function addLineItem(category: LineItemCategory) {
    setLineItems((prev) => [...prev, emptyItem(category)]);
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
    <div className="space-y-4">
      <BackButton onClick={handleCancel} label={invoice ? "Back to Invoice" : "Back to Invoices"} />

      {/* Command bar: title, live save state, and the exit/save actions
          stay pinned while the (long) form scrolls — no hunting for the
          save button at the bottom of the page. */}
      <div className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/85 px-4 py-3 shadow-2xs backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {invoice ? `Edit ${invoice.invoice_number}` : "New Invoice"}
          </h1>
          <SaveStatusPill status={saveStatus} isDirty={isDirty} />
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-muted-foreground xl:block">
            <kbd className="rounded border px-1 py-0.5">⌘S</kbd> save ·{" "}
            <kbd className="rounded border px-1 py-0.5">⌘⏎</kbd> send
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => startTransition(() => handleManualSave())}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client &amp; Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <ClientSelector
                clients={clients}
                value={clientId}
                onChange={(id, client) => {
                  setClientId(id);
                  setCurrency(client.preferred_currency ?? workspace.default_currency);
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Website Redesign Package"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Issue date</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Summary</Label>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line summary shown to the client"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 30, due upon receipt"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Line Items</CardTitle>
            {/* Quiet ghost toolbar — three affordances without three
                competing boxed buttons next to the section title. */}
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setCatalogPickerOpen(true)}
              >
                <Package className="mr-1.5 h-4 w-4" />
                Catalog
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setTemplatePickerOpen(true)}
              >
                <FileDown className="mr-1.5 h-4 w-4" />
                Template
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSaveTemplateOpen(true)}
              >
                <FileUp className="mr-1.5 h-4 w-4" />
                Save as Template
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeCategory}
              onValueChange={(v) => setActiveCategory(v as LineItemCategory)}
            >
              <TabsList>
                {LINE_ITEM_CATEGORIES.map((cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    {CATEGORY_LABEL[cat]}
                    {itemsByCategory[cat].length > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {itemsByCategory[cat].length}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LINE_ITEM_CATEGORIES.map((cat) => (
                <TabsContent key={cat} value={cat} className="space-y-2">
                  {itemsByCategory[cat].length > 0 && (
                    <div
                      className={cn(
                        "hidden gap-x-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid",
                        LINE_ITEM_GRID_COLS
                      )}
                    >
                      <span />
                      <span>Description</span>
                      <span>Qty</span>
                      <span>Unit</span>
                      <span>Unit Price</span>
                      <span>Disc %</span>
                      <span>Tax %</span>
                      <span className="text-right">Total</span>
                      <span />
                    </div>
                  )}
                  {itemsByCategory[cat].length === 0 ? (
                    // The empty tab IS the add affordance: one large
                    // dashed target instead of a dead "nothing here" line
                    // plus a small button below it.
                    <button
                      type="button"
                      onClick={() => addLineItem(cat)}
                      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-8 text-sm text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-primary/[0.02] hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      Add your first {CATEGORY_LABEL[cat].toLowerCase().replace(/s$/, "")}
                    </button>
                  ) : (
                    <>
                      {itemsByCategory[cat].map(({ item, originalIndex }) => (
                        <LineItemRow
                          key={originalIndex}
                          item={item}
                          currency={currency}
                          onChange={(patch) => updateLineItem(originalIndex, patch)}
                          onRemove={() => removeLineItem(originalIndex)}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addLineItem(cat)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add {CATEGORY_LABEL[cat].replace(/s$/, "")}
                      </Button>
                    </>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notes (visible to client)</Label>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder="Add notes for your client..."
              />
            </div>
          </CardContent>
        </Card>

      </div>

      <div>
        <PricingSummary
          totals={totals}
          currency={currency}
          itemCount={lineItems.length}
        />
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
    </div>
  );
}

