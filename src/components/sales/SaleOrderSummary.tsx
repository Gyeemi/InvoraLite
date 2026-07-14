import { formatCurrency } from "../../lib/constants";
import type { NewSaleFormState } from "./useNewSaleForm";

export function SaleOrderSummary({ form }: { form: NewSaleFormState }) {
  const {
    subtotal,
    appliedDiscount,
    discountLabel,
    grandTotal,
    hasGst,
    gstAmount,
    netSelling,
    gstLabel,
  } = form;
  if (subtotal <= 0) return null;

  return (
    <div className="space-y-1 rounded-xl border border-border bg-bg-main px-4 py-3 text-sm">
      <div className="flex items-center justify-between text-text-secondary">
        <span>{hasGst ? "Selling price" : "Subtotal"}</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      {appliedDiscount > 0 && (
        <div className="flex items-center justify-between text-accent-orange">
          <span>{discountLabel}</span>
          <span>-{formatCurrency(appliedDiscount)}</span>
        </div>
      )}
      {form.cashbackAmount > 0 && (
        <div className="flex items-center justify-between text-accent-blue">
          <span>Cashback (later)</span>
          <span>{formatCurrency(form.cashbackAmount)}</span>
        </div>
      )}
      {(form.giftItems?.length ?? 0) > 0 && (
        <div className="text-xs text-text-muted">
          Includes {form.giftItems.length} gift line
          {form.giftItems.length === 1 ? "" : "s"} from offers
        </div>
      )}
      {hasGst && (
        <>
          {appliedDiscount > 0 && (
            <div className="flex items-center justify-between text-text-secondary">
              <span>Net selling price</span>
              <span>{formatCurrency(netSelling)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-text-secondary">
            <span>{gstLabel}</span>
            <span>{formatCurrency(gstAmount)}</span>
          </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-text-primary">
        <span className="font-medium">Total</span>
        <span className="text-base font-semibold text-accent-green">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
  );
}
