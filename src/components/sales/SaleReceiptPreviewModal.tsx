import { Printer, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { buildSaleThermalReceiptHtml, printSaleThermalReceipt } from "../../lib/saleReceipt";
import type { Business, Sale } from "../../types";

interface SaleReceiptPreviewModalProps {
  business: Business;
  sale: Sale;
  onDone: () => void;
  onCancel: () => void;
}

export function SaleReceiptPreviewModal({
  business,
  sale,
  onDone,
  onCancel,
}: SaleReceiptPreviewModalProps) {
  const receiptHtml = useMemo(() => buildSaleThermalReceiptHtml(business, sale), [business, sale]);

  function handlePrint() {
    printSaleThermalReceipt(business, sale);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Receipt Preview</h3>
            <p className="text-xs text-text-muted">{sale.id}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Cancel sale and return to edit"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-main p-4">
          <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-lg border border-border bg-white shadow-inner">
            <iframe
              title={`Receipt preview ${sale.id}`}
              srcDoc={receiptHtml}
              className="block w-full border-0 bg-white"
              style={{ height: "min(420px, 55vh)" }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/60 px-5 py-4">
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90"
          >
            <Printer className="h-4 w-4" />
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
