import { History, X } from "lucide-react";
import {
  cardClass,
  formatCurrency,
  formatDateGB,
  tableHorizontalScrollClass,
} from "../lib/constants";
import type { SupplierLedgerEntry } from "../lib/data";
import type { Contact, CustomerPayment, SupplierPayment } from "../types";

type HistoryPayment = {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  balanceAfter: number;
  kind?: "payment" | "purchase" | "purchase_return";
  /** Portion of this payment that went into supplier advance (overpayment). */
  advancePaid?: number;
  /** Advance applied against a purchase bill. */
  advanceApplied?: number;
  /** Supplier advance remaining after this entry. */
  advanceAfter?: number;
  notes?: string;
};

interface PaymentHistoryModalProps {
  open: boolean;
  contact: Contact | null;
  contactKind: "customer" | "supplier";
  payments: HistoryPayment[];
  onClose: () => void;
}

export function PaymentHistoryModal({
  open,
  contact,
  contactKind,
  payments,
  onClose,
}: PaymentHistoryModalProps) {
  if (!open || !contact) return null;

  const showAdvance = contactKind === "supplier";
  const sorted = [...payments].sort(
    (a, b) =>
      a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id),
  );
  const paymentRows = sorted.filter((row) => (row.kind ?? "payment") === "payment");
  const purchaseRows = sorted.filter((row) => row.kind === "purchase");
  const returnRows = sorted.filter((row) => row.kind === "purchase_return");
  const totalPaid = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
  const totalAdvancePaid = paymentRows.reduce(
    (sum, payment) => sum + Math.max(0, payment.advancePaid ?? 0),
    0,
  );
  const totalAdvanceApplied = purchaseRows.reduce(
    (sum, row) => sum + Math.max(0, row.advanceApplied ?? 0),
    0,
  );
  const totalReturns = returnRows.reduce((sum, row) => sum + row.amount, 0);
  const latestAdvanceAfter =
    showAdvance && sorted.length > 0 ? (sorted[sorted.length - 1].advanceAfter ?? 0) : 0;
  const openingAmount = Math.max(0, contact.openingBalance ?? 0);
  const title =
    contactKind === "supplier" ? "Supplier payment history" : "Customer payment history";

  const summaryParts: string[] = [];
  if (paymentRows.length > 0) {
    summaryParts.push(
      `${paymentRows.length} payment${paymentRows.length === 1 ? "" : "s"}`,
    );
  }
  if (purchaseRows.length > 0) {
    summaryParts.push(
      `${purchaseRows.length} purchase${purchaseRows.length === 1 ? "" : "s"}`,
    );
  }
  if (returnRows.length > 0) {
    summaryParts.push(
      `${returnRows.length} return${returnRows.length === 1 ? "" : "s"}`,
    );
  }
  if (summaryParts.length === 0) {
    summaryParts.push("No movements");
  }
  if (showAdvance && openingAmount > 0) {
    summaryParts.push(`Opening ${formatCurrency(openingAmount)}`);
  }
  if (totalPaid > 0) {
    summaryParts.push(`Total paid ${formatCurrency(totalPaid)}`);
  }
  if (showAdvance && totalAdvancePaid > 0) {
    summaryParts.push(`Advance paid ${formatCurrency(totalAdvancePaid)}`);
  }
  if (showAdvance && totalAdvanceApplied > 0) {
    summaryParts.push(`Advance adjusted ${formatCurrency(totalAdvanceApplied)}`);
  }
  if (showAdvance && totalReturns > 0) {
    summaryParts.push(`Returns ${formatCurrency(totalReturns)}`);
  }
  if (showAdvance && latestAdvanceAfter > 0) {
    summaryParts.push(`Advance now ${formatCurrency(latestAdvanceAfter)}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`${cardClass} flex max-h-[min(90vh,40rem)] w-full ${showAdvance ? "max-w-5xl" : "max-w-3xl"} flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-history-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 text-text-primary">
              <History className="h-4 w-4 shrink-0 text-accent-purple" />
              <h3 id="payment-history-title" className="whitespace-nowrap font-semibold">
                {title}
              </h3>
            </div>
            <p className="mt-1 truncate whitespace-nowrap text-sm text-text-secondary">
              {contact.name}
            </p>
            <p className="mt-0.5 overflow-x-auto whitespace-nowrap text-xs text-text-muted">
              {summaryParts.join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close payment history"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 ${tableHorizontalScrollClass}`}>
          {sorted.length === 0 ? (
            <p className="p-8 text-center text-sm text-text-muted">
              No payments or purchases recorded yet.
            </p>
          ) : (
            <table
              className={`w-full text-left text-sm ${showAdvance ? "min-w-[920px]" : "min-w-[640px]"}`}
            >
              <thead className="sticky top-0 border-b border-border bg-bg-main/90 text-xs uppercase tracking-wider text-text-muted backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Date</th>
                  {showAdvance && (
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Type</th>
                  )}
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">
                    {showAdvance ? "Amount" : "Amount paid"}
                  </th>
                  {showAdvance && (
                    <th className="whitespace-nowrap px-4 py-3 font-medium text-right">
                      Advance
                    </th>
                  )}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Mode</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Reference</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium text-right">
                    Balance after
                  </th>
                  {showAdvance && (
                    <th className="whitespace-nowrap px-4 py-3 font-medium text-right">
                      Advance after
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sorted.map((payment) => {
                  const isPurchase = payment.kind === "purchase";
                  const isReturn = payment.kind === "purchase_return";
                  const advanceCell = isPurchase
                    ? payment.advanceApplied ?? 0
                    : payment.advancePaid ?? 0;
                  const typeLabel = isPurchase
                    ? "Purchase"
                    : isReturn
                      ? "Return"
                      : "Payment";
                  const typeClass = isPurchase
                    ? "bg-accent-orange/15 text-accent-orange"
                    : isReturn
                      ? "bg-accent-blue/15 text-accent-blue"
                      : "bg-accent-green/15 text-accent-green";
                  const amountClass = isPurchase
                    ? "text-accent-orange"
                    : isReturn
                      ? "text-accent-blue"
                      : "text-accent-green";
                  return (
                    <tr key={`${payment.kind ?? "payment"}-${payment.id}`} className="align-middle">
                      <td className="whitespace-nowrap px-4 py-3 text-text-primary">
                        <p className="font-medium">{formatDateGB(payment.paymentDate)}</p>
                        {payment.notes?.trim() && (
                          <p className="mt-0.5 max-w-[18rem] truncate text-xs text-text-muted">
                            {payment.notes}
                          </p>
                        )}
                      </td>
                      {showAdvance && (
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${typeClass}`}
                          >
                            {typeLabel}
                          </span>
                        </td>
                      )}
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${amountClass}`}
                      >
                        {isReturn ? "−" : ""}
                        {formatCurrency(payment.amount)}
                      </td>
                      {showAdvance && (
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-accent-green">
                          {!isReturn && advanceCell > 0 ? (
                            <span title={isPurchase ? "Advance adjusted against bill" : "Advance created"}>
                              {isPurchase ? "−" : "+"}
                              {formatCurrency(advanceCell)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                        {payment.paymentMode}
                      </td>
                      <td className="max-w-[10rem] truncate whitespace-nowrap px-4 py-3 text-text-muted">
                        {payment.paymentReference?.trim() || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCurrency(payment.balanceAfter)}
                      </td>
                      {showAdvance && (
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-accent-green">
                          {(payment.advanceAfter ?? 0) > 0
                            ? formatCurrency(payment.advanceAfter ?? 0)
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
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
  );
}

export function toHistoryPayments(
  payments: Array<SupplierPayment | CustomerPayment>,
): HistoryPayment[] {
  return payments.map((payment) => ({
    id: payment.id,
    paymentDate: payment.paymentDate,
    amount: payment.amount,
    paymentMode: payment.paymentMode,
    paymentReference: payment.paymentReference,
    balanceAfter: payment.balanceAfter,
    kind: "payment",
    notes: payment.notes,
  }));
}

export function toSupplierHistoryPayments(rows: SupplierLedgerEntry[]): HistoryPayment[] {
  return rows.map((row) => ({
    id: row.id,
    paymentDate: row.date,
    amount: row.amount,
    paymentMode: row.paymentMode,
    paymentReference: row.paymentReference,
    balanceAfter: row.balanceAfter,
    kind: row.kind,
    advancePaid: row.advancePaid,
    advanceApplied: row.advanceApplied,
    advanceAfter: row.advanceAfter,
    notes: row.notes,
  }));
}
