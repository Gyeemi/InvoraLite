import { useState } from "react";
import { X } from "lucide-react";
import type { Product } from "../types";
import { inputClass, labelClass, LOW_STOCK_THRESHOLD } from "../lib/constants";

interface LowStockThresholdModalProps {
  product: Product;
  onClose: () => void;
  onSave: (lowStockThreshold: number | null) => Promise<void>;
}

export function LowStockThresholdModal({ product, onClose, onSave }: LowStockThresholdModalProps) {
  const [lowStockEnabled, setLowStockEnabled] = useState(product.lowStockThreshold !== undefined);
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product.lowStockThreshold !== undefined ? String(product.lowStockThreshold) : String(LOW_STOCK_THRESHOLD),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let threshold: number | null = null;
    if (lowStockEnabled) {
      const parsed = Number.parseInt(lowStockThreshold, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        setError("Enter a valid low stock threshold (0 or higher).");
        return;
      }
      threshold = parsed;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(threshold);
      onClose();
    } catch {
      setError("Could not save low stock alert settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Low Stock Alert</h3>
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

          <div className="rounded-xl border border-border bg-bg-main p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">Enable low stock alert</p>
                <p className="text-xs text-text-muted">
                  Turn on only for products that need a restock warning
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowStockEnabled}
                aria-label="Enable low stock threshold"
                onClick={() => setLowStockEnabled((enabled) => !enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                  lowStockEnabled ? "bg-accent-orange" : "bg-border"
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    lowStockEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {lowStockEnabled && (
              <div className="mt-3">
                <label className={labelClass}>Alert when stock is at or below</label>
                <input
                  type="number"
                  min={0}
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-accent-orange py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Alert"}
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
