import { useState } from "react";
import { X } from "lucide-react";
import type { Product } from "../types";
import type { StockAdjustReason } from "../lib/data";
import { inputClass, labelClass } from "../lib/constants";

const REASONS: Array<{ id: StockAdjustReason; label: string }> = [
  { id: "stocktake", label: "Stocktake correction" },
  { id: "damage", label: "Damaged goods" },
  { id: "theft", label: "Theft / loss" },
  { id: "other", label: "Other" },
];

interface StockAdjustModalProps {
  product: Product;
  onClose: () => void;
  onSave: (payload: { delta: number; reason: StockAdjustReason; note: string }) => Promise<void>;
}

export function StockAdjustModal({ product, onClose, onSave }: StockAdjustModalProps) {
  const [reason, setReason] = useState<StockAdjustReason>("stocktake");
  const [quantity, setQuantity] = useState("1");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number.parseInt(quantity, 10);
    if (!qty || qty < 1) {
      setError("Enter a valid quantity.");
      return;
    }
    const delta = direction === "add" ? qty : -qty;
    if (direction === "remove" && qty > product.stock) {
      setError(`Cannot remove more than current stock (${product.stock}).`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({ delta, reason, note: note.trim() });
      onClose();
    } catch {
      setError("Could not save stock adjustment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Adjust Stock</h3>
            <p className="text-sm text-text-secondary">{product.name}</p>
            <p className="text-xs text-text-muted">Current stock: {product.stock}</p>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}

          <div>
            <label className={labelClass}>Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StockAdjustReason)}
              className={inputClass}
            >
              {REASONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Direction</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "add" | "remove")}
                className={inputClass}
              >
                <option value="add">Add stock</option>
                <option value="remove">Remove stock</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Additional details for the audit log"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Adjustment"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
