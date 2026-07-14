import { formatCurrency, formatDateGB } from "../../lib/constants";
import type { SaleCreditPaymentContext } from "../../lib/data";
import type { Sale } from "../../types";

interface InvoiceCreditPaymentSectionProps {
  sale: Sale;
  context: SaleCreditPaymentContext;
}

export function InvoiceCreditPaymentSection({ sale, context }: InvoiceCreditPaymentSectionProps) {
  const saleDate = formatDateGB(sale.saleDate);

  return (
    <div className="ml-auto mt-4 max-w-sm rounded-xl border border-border bg-bg-main p-4 text-left text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Payment</p>
      <p className="mt-1 font-medium text-text-primary">{sale.paymentMode}</p>
      {context.partialPaymentMode && (
        <p className="mt-1 text-text-secondary">Partial via {context.partialPaymentMode}</p>
      )}
      {context.paymentReference && (
        <p className="mt-1 text-text-secondary">Ref: {context.paymentReference}</p>
      )}

      <div className="mt-3 space-y-1 border-t border-border/60 pt-3">
        <div className="flex items-start justify-between gap-3 text-text-secondary">
          <span>
            Paid now <span className="text-xs text-text-muted">({saleDate})</span>
          </span>
          <span>{formatCurrency(context.amountPaidAtSale)}</span>
        </div>
        <div className="flex items-start justify-between gap-3 font-medium text-accent-orange">
          <span>
            On credit <span className="text-xs font-normal text-text-muted">({saleDate})</span>
          </span>
          <span>{formatCurrency(context.amountCreditAtSale)}</span>
        </div>
      </div>

      {context.settlements.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Credit settlements
          </p>
          {context.settlements.map(({ payment, amountApplied }) => (
            <div
              key={`${payment.id}-${amountApplied}`}
              className="flex items-start justify-between gap-3 text-text-secondary"
            >
              <span className="min-w-0">
                {formatDateGB(payment.paymentDate)} · {payment.paymentMode}
                {payment.paymentReference ? ` · ${payment.paymentReference}` : ""}
              </span>
              <span className="shrink-0 font-medium text-accent-green">
                {formatCurrency(amountApplied)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-border/60 pt-3">
        {context.outstanding > 0 ? (
          <div className="flex items-center justify-between font-medium text-accent-orange">
            <span>Outstanding on credit</span>
            <span>{formatCurrency(context.outstanding)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between font-medium text-accent-green">
            <span>Credit status</span>
            <span>Settled</span>
          </div>
        )}
      </div>
    </div>
  );
}
