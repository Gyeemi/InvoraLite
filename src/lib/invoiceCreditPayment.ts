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

function detailRow(label: string, value: string) {
  if (!value.trim()) return "";
  return `<div class="detail-row">
    <span class="detail-label">${escapeHtml(label)}</span>
    <span class="detail-value">${escapeHtml(value)}</span>
  </div>`;
}

export function buildInvoiceCreditPaymentHtml(
  sale: Sale,
  context: SaleCreditPaymentContext,
): string {
  const partialLine = context.partialPaymentMode
    ? detailRow("Partial via", context.partialPaymentMode)
    : "";
  const refLine = context.paymentReference
    ? detailRow("Reference", context.paymentReference)
    : "";
  const settlementsHtml =
    context.settlements.length > 0
      ? `<div class="payment-settlements">
          <p class="payment-subtitle">Credit settlements</p>
          ${context.settlements
            .map(
              ({ payment, amountApplied }) => `<div class="settlement-row">
                <span>${escapeHtml(formatDateGB(payment.paymentDate))} · ${escapeHtml(payment.paymentMode)}${
                  payment.paymentReference ? ` · ${escapeHtml(payment.paymentReference)}` : ""
                }</span>
                <span>${escapeHtml(formatCurrency(amountApplied))}</span>
              </div>`,
            )
            .join("")}
        </div>`
      : "";

  const status =
    context.outstanding > 0
      ? `Outstanding ${formatCurrency(context.outstanding)}`
      : "Settled";
  const badge =
    context.outstanding > 0 ? "CREDIT BALANCE" : "PAID IN FULL";
  const badgeTone = context.outstanding > 0 ? "credit" : "paid";

  return `<div class="payment-panel">
    <p class="panel-title panel-title-green">PAYMENT METHOD</p>
    ${detailRow("Payment Mode", sale.paymentMode)}
    ${detailRow("Payment Status", status)}
    ${partialLine}
    ${refLine}
    ${detailRow("Paid now", formatCurrency(context.amountPaidAtSale))}
    ${detailRow("On credit", formatCurrency(context.amountCreditAtSale))}
    ${settlementsHtml}
    <span class="status-badge status-badge-${badgeTone}">${escapeHtml(badge)}</span>
  </div>`;
}

export const invoiceCreditPaymentPrintStyles = `
  .payment-settlements { margin-top: 10px; padding-top: 10px; border-top: 1px solid #bbf7d0; }
  .payment-subtitle {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0f766e;
  }
  .settlement-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 6px;
    font-size: 12px;
    color: #475569;
  }
  .settlement-row span:last-child {
    font-weight: 700;
    color: #15803d;
    text-align: right;
    white-space: nowrap;
  }
`;
