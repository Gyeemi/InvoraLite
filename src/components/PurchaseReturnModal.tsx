import { Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SupplierSearchSelect } from "./SupplierSearchSelect";
import {
  cardClass,
  formatCurrency,
  formatDateGB,
  inputClass,
  labelClass,
} from "../lib/constants";
import { purchaseReturnItemsFromSalesReturn, reasonLabel } from "../lib/returns";
import type { Contact, Product, SalesReturn } from "../types";

interface PurchaseReturnModalProps {
  open: boolean;
  salesReturn: SalesReturn | null;
  products: Product[];
  suppliers: Contact[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    supplierId?: string;
    supplierName: string;
    debitNoteNo: string;
    returnDate: string;
    notes: string;
  }) => Promise<void>;
}

export function PurchaseReturnModal({
  open,
  salesReturn,
  products,
  suppliers,
  saving = false,
  onClose,
  onSubmit,
}: PurchaseReturnModalProps) {
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState<string | null>(null);
  const [debitNoteNo, setDebitNoteNo] = useState("");
  const [returnDate, setReturnDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !salesReturn) return;
    setSupplierId("");
    setNewSupplierName(null);
    setDebitNoteNo(`DN-${salesReturn.id.replace(/^SRN-?/i, "")}`);
    setReturnDate(new Date().toISOString().split("T")[0]);
    setNotes(salesReturn.notes ?? "");
    setError("");
  }, [open, salesReturn]);

  const previewItems = useMemo(() => {
    if (!salesReturn) return [];
    return purchaseReturnItemsFromSalesReturn(salesReturn, products);
  }, [salesReturn, products]);

  const total = useMemo(
    () => previewItems.reduce((sum, item) => sum + item.total, 0),
    [previewItems],
  );

  const supplierName = useMemo(() => {
    if (newSupplierName?.trim()) return newSupplierName.trim();
    return suppliers.find((s) => s.id === supplierId)?.name?.trim() ?? "";
  }, [newSupplierName, supplierId, suppliers]);

  if (!open || !salesReturn) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierName) {
      setError("Select or enter a supplier.");
      return;
    }
    if (!debitNoteNo.trim()) {
      setError("Enter a debit note / return reference.");
      return;
    }
    setError("");
    try {
      await onSubmit({
        supplierId: newSupplierName ? undefined : supplierId || undefined,
        supplierName,
        debitNoteNo: debitNoteNo.trim(),
        returnDate,
        notes: notes.trim(),
      });
    } catch {
      setError("Could not save the purchase return.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`${cardClass} flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-return-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-text-primary">
              <Truck className="h-4 w-4 text-accent-orange" />
              <h3 id="purchase-return-title" className="font-semibold">
                Purchase return
              </h3>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              From {salesReturn.id} · sale {salesReturn.saleId} ·{" "}
              {reasonLabel(salesReturn.reason)}
            </p>
            <p className="text-xs text-text-muted">
              Stock leaves Products; supplier payable is reduced (debit note).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close purchase return"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {error}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-bg-main/80 text-xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Cost</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {previewItems.map((item) => (
                    <tr key={`${item.productId}-${item.imei1 ?? item.productName}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-text-primary">{item.productName}</p>
                        {item.sku && (
                          <p className="text-xs text-text-muted">SKU: {item.sku}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(item.costPrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Supplier</label>
                <SupplierSearchSelect
                  suppliers={suppliers}
                  supplierId={supplierId}
                  newSupplierName={newSupplierName}
                  onSelectSupplier={(supplier) => {
                    setSupplierId(supplier.id);
                    setNewSupplierName(null);
                  }}
                  onAddNewSupplier={(name) => {
                    setSupplierId("");
                    setNewSupplierName(name);
                  }}
                  onClearSelection={() => {
                    setSupplierId("");
                    setNewSupplierName(null);
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>Debit note / ref</label>
                <input
                  type="text"
                  value={debitNoteNo}
                  onChange={(e) => setDebitNoteNo(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Return date</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>

            <p className="text-xs text-text-muted">
              Customer return dated {formatDateGB(salesReturn.returnDate)} ·{" "}
              {salesReturn.customerName}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-sm text-text-secondary">
              Debit total{" "}
              <span className="font-semibold text-text-primary">
                {formatCurrency(total)}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-accent-orange px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {saving ? "Saving…" : "Confirm purchase return"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
