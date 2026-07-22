import type { InvoiceDetail } from "@/features/invoices/types";
import type { LineItemCategory } from "@/features/line-items/types";
import { formatCurrency } from "@/lib/utils/format-currency";

const CATEGORY_LABEL: Record<LineItemCategory, string> = {
  package: "Packages",
  add_on: "Add-ons",
  per_unit: "Per-unit",
};

const CATEGORIES: LineItemCategory[] = ["package", "add_on", "per_unit"];

type InvoicePrintViewProps = {
  invoice: InvoiceDetail;
  workspaceName: string;
};

export function InvoicePrintView({ invoice, workspaceName }: InvoicePrintViewProps) {
  const fmt = (value: number) => formatCurrency(value, invoice.currency);

  return (
    <div className="hidden print:block print:text-black">
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{workspaceName}</h1>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase tracking-wide">Invoice</h2>
          <p className="text-sm">{invoice.invoice_number}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-semibold text-gray-500">Billed to</p>
          <p className="font-medium">{invoice.client?.name ?? "Deleted client"}</p>
          {invoice.client?.company && <p>{invoice.client.company}</p>}
          {invoice.client?.email && <p>{invoice.client.email}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-gray-500">Issue date: </span>
            {new Date(invoice.issue_date).toLocaleDateString()}
          </p>
          {invoice.due_date && (
            <p>
              <span className="text-gray-500">Due date: </span>
              {new Date(invoice.due_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {invoice.title && <h3 className="mt-6 text-lg font-semibold">{invoice.title}</h3>}
      {invoice.summary && <p className="mt-1 text-sm text-gray-600">{invoice.summary}</p>}

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 text-left">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit Price</th>
            <th className="py-2 text-right">Disc.</th>
            <th className="py-2 text-right">Tax</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.flatMap((cat) => {
            const items = invoice.line_items.filter((i) => i.category === cat);
            if (items.length === 0) return [];
            return [
              <tr key={`${cat}-header`}>
                <td
                  colSpan={6}
                  className="pb-1 pt-3 text-xs font-semibold uppercase text-gray-500"
                >
                  {CATEGORY_LABEL[cat]}
                </td>
              </tr>,
              ...items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-1.5">{item.description}</td>
                  <td className="py-1.5 text-right">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </td>
                  <td className="py-1.5 text-right">{fmt(item.unit_price)}</td>
                  <td className="py-1.5 text-right">
                    {item.discount_percent ? `${item.discount_percent}%` : "-"}
                  </td>
                  <td className="py-1.5 text-right">
                    {item.tax_percent ? `${item.tax_percent}%` : "-"}
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    {fmt(item.line_total)}
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{fmt(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>−{fmt(invoice.discount_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{fmt(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total</span>
            <span>{fmt(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>Amount Paid</span>
            <span>{fmt(invoice.amount_paid)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Balance Due</span>
            <span>{fmt(invoice.amount_due)}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div className="mt-6 text-sm">
          <p className="font-semibold">Notes</p>
          <div
            className="mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: invoice.notes }}
          />
        </div>
      )}

      {invoice.payment_terms && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Payment Terms</p>
          <p className="mt-1">{invoice.payment_terms}</p>
        </div>
      )}

      {invoice.due_date && (
        <p className="mt-8 text-center text-xs text-gray-500">
          Payment is due by {new Date(invoice.due_date).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
