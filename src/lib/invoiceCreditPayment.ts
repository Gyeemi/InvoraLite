import { formatCurrency, formatDateGB } from "./constants";
import type { SaleCreditPaymentContext } from "./data";
import type { Sale } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInvoiceCreditPaymentHtml(
  sale: Sale,
  context: SaleCreditPaymentContext,
): string {
  const partialLine = context.partialPaymentMode
    ? `<p class="payment-line">Partial via ${escapeHtml(context.partialPaymentMode)}</p>`
    : "";
  const refLine = context.paymentReference
    ? `<p class="payment-line">Ref: ${escapeHtml(context.paymentReference)}</p>`
    : "";
  const saleDate = escapeHtml(formatDateGB(sale.saleDate));
  const settlementsHtml =
    context.settlements.length > 0
      ? `<div class="payment-settlements">
          <p class="payment-subtitle">Credit settlements</p>
          ${context.settlements
            .map(
              ({ payment, amountApplied }) => `<p class="settlement-row">
                <span>${escapeHtml(formatDateGB(payment.paymentDate))} · ${escapeHtml(payment.paymentMode)}${
                  payment.paymentReference ? ` · ${escapeHtml(payment.paymentReference)}` : ""
                }</span>
                <span>${escapeHtml(formatCurrency(amountApplied))}</span>
              </p>`,
            )
            .join("")}
        </div>`
      : "";
  const outstandingHtml =
    context.outstanding > 0
      ? `<p class="payment-row outstanding"><span>Outstanding on credit</span><span>${escapeHtml(formatCurrency(context.outstanding))}</span></p>`
      : `<p class="payment-row settled"><span>Credit status</span><span>Settled</span></p>`;

  return `<div class="payment-box">
    <p class="payment-label">Payment</p>
    <p class="payment-mode">${escapeHtml(sale.paymentMode)}</p>
    ${partialLine}
    ${refLine}
    <div class="payment-rows">
      <p class="payment-row"><span>Paid now <span class="payment-date">(${saleDate})</span></span><span>${escapeHtml(formatCurrency(context.amountPaidAtSale))}</span></p>
      <p class="payment-row credit"><span>On credit <span class="payment-date">(${saleDate})</span></span><span>${escapeHtml(formatCurrency(context.amountCreditAtSale))}</span></p>
    </div>
    ${settlementsHtml}
    <div class="payment-rows outstanding-rows">${outstandingHtml}</div>
  </div>`;
}

export const invoiceCreditPaymentPrintStyles = `
  .payment-box { margin: 16px 0 0 auto; max-width: 320px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; text-align: left; }
  .payment-label { margin: 0 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
  .payment-mode { margin: 0; font-size: 14px; font-weight: 600; color: #0f172a; }
  .payment-line { margin: 4px 0 0; font-size: 13px; color: #475569; }
  .payment-rows { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
  .payment-row { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 4px; font-size: 14px; color: #475569; }
  .payment-row span:last-child { font-weight: 600; color: #0f172a; text-align: right; }
  .payment-row.credit span:last-child { color: #ea580c; }
  .payment-row.outstanding span:last-child { color: #ea580c; }
  .payment-row.settled span:last-child { color: #16a34a; }
  .payment-date { font-size: 12px; font-weight: 400; color: #94a3b8; }
  .payment-settlements { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
  .payment-subtitle { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
  .settlement-row { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 6px; font-size: 13px; color: #475569; }
  .settlement-row span:last-child { font-weight: 600; color: #16a34a; text-align: right; white-space: nowrap; }
  .outstanding-rows { margin-top: 0; }
`;
