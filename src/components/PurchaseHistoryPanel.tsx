import { Eye, FileText, X } from "lucide-react";
import {
  cardClass,
  formatCurrency,
  formatDateGB,
  tableHorizontalScrollClass,
} from "../lib/constants";
import { DEFAULT_BASE_UOM } from "../lib/inventoryUom";
import type { Contact, Purchase } from "../types";

function statusClass(status: Purchase["status"]): string {
  if (status === "received") return "bg-accent-green/15 text-accent-green";
  if (status === "pending") return "bg-accent-orange/15 text-accent-orange";
  return "bg-bg-hover text-text-muted";
}

function partyLabel(purchase: Purchase, suppliers: Contact[]): string {
  const match = suppliers.find(
    (s) =>
      s.id === purchase.supplierId ||
      s.name.trim().toLowerCase() === purchase.supplierName.trim().toLowerCase(),
  );
  if (!match) return purchase.supplierName;
  const phone = [match.countryCode, match.phone].filter(Boolean).join(" ").trim();
  return phone ? `${match.name} | ${phone}` : match.name;
}

interface PurchaseHistoryListProps {
  purchases: Purchase[];
  suppliers: Contact[];
  onOpen: (purchase: Purchase) => void;
}

export function PurchaseHistoryList({
  purchases,
  suppliers,
  onOpen,
}: PurchaseHistoryListProps) {
  const sorted = [...purchases].sort(
    (a, b) =>
      b.purchaseDate.localeCompare(a.purchaseDate) || b.id.localeCompare(a.id),
  );

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="border-b border-border px-5 py-4">
        <h3 className="font-semibold text-text-primary">Purchase History</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Read-only log of every saved purchase. Click a row for full details.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="p-8 text-center text-sm text-text-muted">
          No purchases yet. Save a New Purchase to see it here immediately.
        </p>
      ) : (
        <div className={tableHorizontalScrollClass}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-bg-main/80 text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Date</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Invoice No</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Party</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium text-right">Items</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium text-right">Total</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">Status</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((purchase) => (
                <tr
                  key={purchase.id}
                  className="cursor-pointer transition-colors hover:bg-bg-hover/60"
                  onClick={() => onOpen(purchase)}
                >
                  <td className="whitespace-nowrap px-5 py-3 text-text-primary">
                    {formatDateGB(purchase.purchaseDate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-text-primary">
                    {purchase.invoiceNo}
                  </td>
                  <td className="max-w-[16rem] truncate px-5 py-3 text-text-secondary">
                    {partyLabel(purchase, suppliers)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-text-secondary">
                    {purchase.items.length}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-text-primary">
                    {formatCurrency(purchase.total)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(purchase.status)}`}
                    >
                      {purchase.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(purchase);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent-orange/40 hover:bg-accent-orange/10 hover:text-accent-orange"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PurchaseDetailModalProps {
  open: boolean;
  purchase: Purchase | null;
  suppliers: Contact[];
  hasGst: boolean;
  onClose: () => void;
}

export function PurchaseDetailModal({
  open,
  purchase,
  suppliers,
  hasGst,
  onClose,
}: PurchaseDetailModalProps) {
  if (!open || !purchase) return null;

  const party = partyLabel(purchase, suppliers);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`${cardClass} flex max-h-[min(90vh,44rem)] w-full max-w-4xl flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-detail-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-text-primary">
              <FileText className="h-4 w-4 shrink-0 text-accent-orange" />
              <h3 id="purchase-detail-title" className="font-semibold">
                Purchase details
              </h3>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(purchase.status)}`}
              >
                {purchase.status}
              </span>
            </div>
            <p className="mt-1 overflow-x-auto whitespace-nowrap text-sm text-text-secondary">
              Invoice {purchase.invoiceNo} · {party} · {formatDateGB(purchase.purchaseDate)} ·{" "}
              {purchase.id}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Read-only history entry · Created by {purchase.createdBy}
              {purchase.stockedToInventory ? " · Stocked to inventory" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close purchase details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 ${tableHorizontalScrollClass}`}>
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 border-b border-border bg-bg-main/90 text-xs uppercase tracking-wider text-text-muted backdrop-blur">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">SKU</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Qty</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">UOM</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Cost</th>
                {hasGst && (
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">GST %</th>
                )}
                <th className="whitespace-nowrap px-4 py-3 font-medium text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {purchase.items.map((item, idx) => {
                const line = item.quantity * item.costPrice;
                return (
                  <tr key={`${purchase.id}-${idx}`}>
                    <td className="px-4 py-3 text-text-primary">
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {item.category}
                        {item.brand?.trim() ? ` · ${item.brand}` : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {item.sku?.trim() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                      {item.uom?.trim() || DEFAULT_BASE_UOM}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatCurrency(item.costPrice)}
                    </td>
                    {hasGst && (
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {item.gstPercent}%
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(line)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 border-t border-border px-5 py-4">
          {(purchase.shippingCharge ?? 0) > 0 && (
            <div className="flex justify-between text-sm text-text-secondary">
              <span>Shipping</span>
              <span className="tabular-nums">{formatCurrency(purchase.shippingCharge)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold text-text-primary">
            <span>Invoice total</span>
            <span className="tabular-nums text-accent-orange">
              {formatCurrency(purchase.total)}
            </span>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
