import { formatContactPhone, formatCurrency, formatDateGB } from "./constants";
import {
  customerPaymentSaleAllocations,
  getCustomerPayments,
  getSales,
} from "./data";
import type { Business, Contact, CustomerPayment, Sale } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function businessFromLines(business: Business) {
  const lines = [business.address.trim()].filter(Boolean);
  if (business.licenseNo.trim()) lines.push(`Licence No: ${business.licenseNo.trim()}`);
  if (business.tpnNo.trim()) lines.push(`TPN No: ${business.tpnNo.trim()}`);
  return lines;
}

function invoiceNumbersForPayment(
  payment: CustomerPayment,
  sales: Sale[],
  customerPayments: CustomerPayment[],
): string {
  const allocations = customerPaymentSaleAllocations(payment, sales, customerPayments);
  if (allocations.length === 0) return "";
  return allocations.map((entry) => entry.saleId).join(", ");
}

function buildStatementLine(
  payment: CustomerPayment,
  customer: Contact,
  invoiceNumbers: string,
): string {
  const amount = escapeHtml(formatCurrency(payment.amount));
  const name = escapeHtml(customer.name);
  if (invoiceNumbers) {
    return `Received ${amount} from ${name} against Invoice No. ${escapeHtml(invoiceNumbers)}.`;
  }
  return `Received ${amount} from ${name}.`;
}

function buildStatusLines(payment: CustomerPayment): string {
  if (payment.balanceAfter > 0) {
    return `<p class="status-line outstanding">Outstanding Balance: ${escapeHtml(formatCurrency(payment.balanceAfter))}</p>`;
  }
  return `<p class="status-line paid">Payment Status: Paid in Full</p>`;
}

export function buildCustomerPaymentReceiptHtml(
  business: Business,
  customer: Contact,
  payment: CustomerPayment,
  sales: Sale[] = [],
  customerPayments: CustomerPayment[] = [],
) {
  const fromLines = businessFromLines(business).map(escapeHtml);
  const customerPhone = formatContactPhone(customer.countryCode, customer.phone);
  const customerLines = [customer.name, customerPhone, customer.address.trim()].filter(Boolean);
  const invoiceNumbers = invoiceNumbersForPayment(payment, sales, customerPayments);
  const statementLine = buildStatementLine(payment, customer, invoiceNumbers);
  const statusLines = buildStatusLines(payment);
  const refLine = payment.paymentReference
    ? `<p class="meta-row"><span>Reference</span><span>${escapeHtml(payment.paymentReference)}</span></p>`
    : "";
  const notesLine = payment.notes
    ? `<p class="notes">${escapeHtml(payment.notes)}</p>`
    : "";

  return `<!DOCTYPE html><html><head><title>Receipt ${escapeHtml(payment.id)}</title>
    <style>
      @page { size: A5 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        width: 210mm;
        min-height: 148mm;
        padding: 10mm;
        margin: 0 auto;
      }
      .title { margin: 0 0 2px; text-align: center; font-size: 20px; font-weight: 700; }
      .subtitle { margin: 0 0 14px; text-align: center; font-size: 12px; color: #64748b; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 14px; }
      .label { margin: 0 0 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; }
      .from-name { margin: 0 0 2px; font-size: 14px; font-weight: 600; }
      .line { margin: 0 0 2px; font-size: 12px; line-height: 1.45; color: #475569; white-space: pre-line; }
      .meta { text-align: right; font-size: 12px; }
      .meta p { margin: 0 0 3px; }
      .meta-label { color: #64748b; }
      .content-row { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
      .statement-box { padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
      .statement { margin: 0; font-size: 14px; line-height: 1.55; color: #0f172a; }
      .status-heading { margin: 12px 0 6px; font-size: 12px; font-weight: 700; color: #0f172a; }
      .status-line { margin: 0 0 4px; font-size: 12px; line-height: 1.45; color: #475569; }
      .status-line.outstanding { color: #ea580c; font-weight: 600; }
      .status-line.paid { color: #16a34a; font-weight: 600; }
      .meta-rows { padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
      .meta-row { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 6px; font-size: 12px; color: #475569; }
      .meta-row span:last-child { font-weight: 600; color: #0f172a; text-align: right; }
      .notes { margin: 12px 0 0; font-size: 11px; color: #64748b; }
      .footer { margin-top: 12px; text-align: center; font-size: 11px; color: #94a3b8; }
      @media print {
        .page { width: auto; min-height: auto; padding: 0; margin: 0; }
      }
    </style></head><body>
    <div class="page">
    <h1 class="title">Payment Receipt</h1>
    <p class="subtitle">Customer payment confirmation</p>
    <div class="grid">
      <div>
        <p class="label">From</p>
        <p class="from-name">${escapeHtml(business.businessName)}</p>
        ${fromLines.map((line) => `<p class="line">${line}</p>`).join("")}
      </div>
      <div class="meta">
        <p><span class="meta-label">Receipt No:</span> ${escapeHtml(payment.id)}</p>
        <p><span class="meta-label">Date:</span> ${escapeHtml(formatDateGB(payment.paymentDate))}</p>
        <div style="margin-top:12px;text-align:right">
          <p class="label">Received from</p>
          ${customerLines
            .map((line, index) =>
              index === 0
                ? `<p class="line" style="font-weight:600;color:#0f172a">${escapeHtml(line)}</p>`
                : `<p class="line">${escapeHtml(line)}</p>`,
            )
            .join("")}
        </div>
      </div>
    </div>
    <div class="content-row">
      <div class="statement-box">
        <p class="statement">${statementLine}</p>
        <p class="status-heading">Status:</p>
        ${statusLines}
      </div>
      <div class="meta-rows">
        <p class="meta-row"><span>Payment method</span><span>${escapeHtml(payment.paymentMode)}</span></p>
        ${refLine}
        ${notesLine}
      </div>
    </div>
    <p class="footer">Thank you for your payment.</p>
    </div>
    </body></html>`;
}

export async function printCustomerPaymentReceipt(
  business: Business,
  customer: Contact,
  payment: CustomerPayment,
  customerPayments?: CustomerPayment[],
) {
  const [sales, payments] = await Promise.all([
    getSales(),
    customerPayments ? Promise.resolve(customerPayments) : getCustomerPayments(),
  ]);
  const html = buildCustomerPaymentReceiptHtml(business, customer, payment, sales, payments);
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 250);
}
