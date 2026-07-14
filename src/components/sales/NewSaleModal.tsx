import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cancelSale } from "../../lib/data";
import type { Sale } from "../../types";
import { SaleCustomerSection } from "./SaleCustomerSection";
import { SaleDiscountSection } from "./SaleDiscountSection";
import { SaleOrderSummary } from "./SaleOrderSummary";
import { SalePaymentSection } from "./SalePaymentSection";
import { SaleProductLinesSection } from "./SaleProductLinesSection";
import { SaleReceiptPreviewModal } from "./SaleReceiptPreviewModal";
import { useNewSaleForm } from "./useNewSaleForm";

interface NewSaleModalProps {
  onClose: () => void;
  onComplete: () => void;
}

export function NewSaleModal({ onClose, onComplete }: NewSaleModalProps) {
  const { business } = useAuth();
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [voidingReceipt, setVoidingReceipt] = useState(false);

  const form = useNewSaleForm(onComplete, (sale) => setReceiptSale(sale));

  async function handleReceiptCancel() {
    if (!receiptSale || voidingReceipt) return;
    setVoidingReceipt(true);
    try {
      await cancelSale(receiptSale.id);
      await form.reloadSaleData();
      setReceiptSale(null);
      form.setError("Sale cancelled. You can edit the order and complete again.");
    } finally {
      setVoidingReceipt(false);
    }
  }

  function handleReceiptDone() {
    setReceiptSale(null);
    onComplete();
    onClose();
  }

  useEffect(() => {
    if (receiptSale) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [receiptSale, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[min(92vh,700px)] min-h-[580px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-5">
          <h2 className="text-lg font-semibold text-text-primary">New Sale</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close new sale"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void form.handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="sale-modal-scroll min-h-0 flex-1 px-6 py-4">
            <div className="space-y-4">
              {form.error && (
                <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                  {form.error}
                </div>
              )}

              <SaleProductLinesSection form={form} />
              <SaleCustomerSection form={form} />
              <SaleDiscountSection form={form} />
              <SalePaymentSection form={form} />
              <SaleOrderSummary form={form} />
            </div>
          </div>
        </form>

        <div className="shrink-0 border-t border-border/60 bg-bg-card px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={form.submitting}
              onClick={(e) => void form.handleSubmit(e, false)}
              className="flex-1 rounded-xl bg-accent-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {form.submitting ? "Completing sale…" : "Complete Sale"}
            </button>
            <button
              type="button"
              disabled={form.submitting || !business}
              onClick={(e) => void form.handleSubmit(e, true)}
              className="flex-1 rounded-xl border border-accent-green bg-accent-green/10 py-2.5 text-sm font-semibold text-accent-green transition-colors hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {form.submitting ? "Completing sale…" : "Complete Sale & Print Receipt"}
            </button>
          </div>
        </div>
      </div>

      {receiptSale && business && (
        <SaleReceiptPreviewModal
          business={business}
          sale={receiptSale}
          onDone={handleReceiptDone}
          onCancel={() => void handleReceiptCancel()}
        />
      )}
    </div>
  );
}
