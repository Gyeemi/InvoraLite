import { RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildSalesReturnDraftLines,
  reasonLabel,
  settlementLabel,
  type SalesReturnDraftLine,
} from "../lib/returns";
import {
  cardClass,
  formatCurrency,
  inputClass,
  labelClass,
} from "../lib/constants";
import type {
  Sale,
  SalesReturn,
  SalesReturnReason,
  SalesReturnSettlement,
} from "../types";

const REASONS: SalesReturnReason[] = ["warranty", "complaint", "damage", "other"];
const SETTLEMENTS: SalesReturnSettlement[] = ["refund", "credit", "replacement"];

interface SalesReturnModalProps {
  open: boolean;
  sale: Sale | null;
  existingReturns: SalesReturn[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    draftLines: SalesReturnDraftLine[];
    reason: SalesReturnReason;
    settlement: SalesReturnSettlement;
    supplierLiable: boolean;
    notes: string;
    returnDate: string;
  }) => Promise<void>;
}

export function SalesReturnModal({
  open,
  sale,
  existingReturns,
  saving = false,
  onClose,
  onSubmit,
}: SalesReturnModalProps) {
  const [lines, setLines] = useState<SalesReturnDraftLine[]>([]);
  const [reason, setReason] = useState<SalesReturnReason>("complaint");
  const [settlement, setSettlement] = useState<SalesReturnSettlement>("refund");
  const [supplierLiable, setSupplierLiable] = useState(false);
  const [notes, setNotes] = useState("");
  const [returnDate, setReturnDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !sale) return;
    setLines(buildSalesReturnDraftLines(sale, existingReturns));
    setReason("complaint");
    setSettlement("refund");
    setSupplierLiable(false);
    setNotes("");
    setReturnDate(new Date().toISOString().split("T")[0]);
    setError("");
  }, [open, sale, existingReturns]);

  const total = useMemo(
    () =>
      lines
        .filter((line) => line.selected && line.quantity > 0)
        .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [lines],
  );

  if (!open || !sale) return null;

  function updateLine(index: number, patch: Partial<SalesReturnDraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.every((line) => !line.selected || line.quantity <= 0)) {
      setError("Select at least one line to return.");
      return;
    }
    for (const line of lines) {
      if (line.selected && (line.quantity <= 0 || line.quantity > line.maxQuantity)) {
        setError(`Invalid quantity for ${line.productName}.`);
        return;
      }
    }
    setError("");
    try {
      await onSubmit({
        draftLines: lines,
        reason,
        settlement,
        supplierLiable,
        notes: notes.trim(),
        returnDate,
      });
    } catch {
      setError("Could not save the sales return.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`${cardClass} flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-return-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-text-primary">
              <RotateCcw className="h-4 w-4 text-accent-blue" />
              <h3 id="sales-return-title" className="font-semibold">
                Sales return
              </h3>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {sale.id} · {sale.customerName}
            </p>
            <p className="text-xs text-text-muted">
              Stock comes back into Products. Settle the customer, then optionally send
              supplier-liable items onward as a purchase return.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close sales return"
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

            {lines.length === 0 ? (
              <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-text-muted">
                Nothing left to return on this sale.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-bg-main/80 text-xs uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Return</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-right">Max</th>
                      <th className="px-3 py-2 font-medium text-right">Line</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {lines.map((line, index) => (
                      <tr key={`${line.productId}-${line.imei1 ?? index}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={line.selected}
                            onChange={(e) =>
                              updateLine(index, { selected: e.target.checked })
                            }
                            className="h-4 w-4 accent-accent-blue"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-text-primary">{line.productName}</p>
                          {line.imei1 && (
                            <p className="text-xs text-text-muted">IMEI: {line.imei1}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            max={line.maxQuantity}
                            step={1}
                            value={line.quantity}
                            disabled={!line.selected}
                            onChange={(e) =>
                              updateLine(index, {
                                quantity: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className={`${inputClass} ml-auto w-20 text-right`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                          {line.maxQuantity}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                          {line.selected
                            ? formatCurrency(line.unitPrice * line.quantity)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
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
              <div>
                <label className={labelClass}>Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as SalesReturnReason)}
                  className={inputClass}
                >
                  {REASONS.map((entry) => (
                    <option key={entry} value={entry}>
                      {reasonLabel(entry)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Customer settlement</label>
                <select
                  value={settlement}
                  onChange={(e) =>
                    setSettlement(e.target.value as SalesReturnSettlement)
                  }
                  className={inputClass}
                >
                  {SETTLEMENTS.map((entry) => (
                    <option key={entry} value={entry}>
                      {settlementLabel(entry)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={supplierLiable}
                    onChange={(e) => setSupplierLiable(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-accent-orange"
                  />
                  <span>
                    <span className="font-medium text-text-primary">Supplier-liable</span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      Queue for purchase return after stock is received.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Fault description, warranty claim ref…"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-sm text-text-secondary">
              Return total{" "}
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
                disabled={saving || lines.length === 0}
                className="rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Confirm return"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
