import {
  buildInvoiceCreditPaymentHtml,
  invoiceCreditPaymentPrintStyles,
} from "./invoiceCreditPayment";
import { saleCreditPaymentContext } from "./data";
import {
  formatContactPhone,
  formatCurrency,
  formatDateGB,
  resolveSaleCreditDetails,
} from "./constants";
import {
  DEFAULT_GST_RATE_PERCENT,
  gstLabelForRates,
  gstOnExclusive,
  saleAmountsFromGstLines,
} from "./gst";
import type { Business, Contact, CustomerPayment, Sale, SaleItem } from "../types";

export type SalePrintKind = "invoice" | "cash_memo" | "estimation";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveBillTo(sale: Sale, customers: Contact[]) {
  const contact = sale.customerId
    ? customers.find((customer) => customer.id === sale.customerId)
    : undefined;

  return {
    name: sale.customerName,
    phone: contact ? formatContactPhone(contact.countryCode, contact.phone) : "",
    address: contact?.address?.trim() ?? "",
  };
}

function saleItemGstPercent(item: SaleItem) {
  return item.gstPercent ?? DEFAULT_GST_RATE_PERCENT;
}

function saleItemLineGst(item: SaleItem) {
  return gstOnExclusive(item.total, saleItemGstPercent(item));
}

function saleItemLineTotalInclGst(item: SaleItem) {
  return item.total + saleItemLineGst(item);
}

function resolveSaleGstAmounts(business: Business, sale: Sale) {
  if (!business.hasGst) return null;

  const subtotal = sale.subtotal ?? sale.items.reduce((sum, item) => sum + item.total, 0);
  const discount = sale.discountAmount ?? 0;
  const gstLines = sale.items.map((item) => ({
    lineTotal: item.total,
    gstPercent: saleItemGstPercent(item),
  }));

  if (sale.gstAmount != null) {
    return {
      sellingSubtotal: subtotal,
      discount,
      netSelling: Math.max(0, subtotal - discount),
      gstAmount: sale.gstAmount,
      total: sale.total,
      gstLabel: gstLabelForRates(gstLines.map((line) => line.gstPercent)),
    };
  }

  const amounts = saleAmountsFromGstLines(gstLines, discount, true);
  return {
    ...amounts,
    gstLabel: gstLabelForRates(gstLines.map((line) => line.gstPercent)),
  };
}

function printDocumentMeta(kind: SalePrintKind) {
  switch (kind) {
    case "cash_memo":
      return {
        title: "CASH MEMO",
        badge: "CASH SALE MEMO",
        docLabel: "Memo No",
        totalLabel: "Grand Total",
        includePayment: true,
        pageTitlePrefix: "Cash Memo",
        footerNote: "This is a computer-generated cash memo and does not require a physical signature.",
      };
    case "estimation":
      return {
        title: "ESTIMATION",
        badge: "FOR REFERENCE ONLY",
        docLabel: "Estimate No",
        totalLabel: "Estimated Total",
        includePayment: false,
        pageTitlePrefix: "Estimation",
        footerNote: "This estimation is for reference only and is not a tax invoice.",
      };
    default:
      return {
        title: "TAX INVOICE",
        badge: "ORIGINAL TAX INVOICE",
        docLabel: "Invoice No",
        totalLabel: "Grand Total",
        includePayment: true,
        pageTitlePrefix: "Invoice",
        footerNote:
          "This is a computer-generated tax invoice and does not require a physical signature.",
      };
  }
}

function detailRow(label: string, value: string) {
  if (!value.trim()) return "";
  return `<div class="detail-row">
    <span class="detail-label">${escapeHtml(label)}</span>
    <span class="detail-value">${escapeHtml(value)}</span>
  </div>`;
}

function resolvePaymentStatus(
  sale: Sale,
  sales: Sale[],
  customerPayments: CustomerPayment[],
): { status: string; badge: string; badgeTone: "paid" | "credit" | "partial" } {
  const creditContext = saleCreditPaymentContext(sale, sales, customerPayments);
  if (creditContext) {
    if (creditContext.outstanding > 0) {
      return {
        status: `Outstanding ${formatCurrency(creditContext.outstanding)}`,
        badge: "CREDIT BALANCE",
        badgeTone: "credit",
      };
    }
    if (creditContext.amountCreditAtSale > 0) {
      return { status: "Settled", badge: "PAID IN FULL", badgeTone: "paid" };
    }
  }

  const credit = resolveSaleCreditDetails(sale);
  if (credit) {
    if (credit.amountCredit > 0 && credit.amountPaid > 0) {
      return { status: "Partial", badge: "PARTIAL PAYMENT", badgeTone: "partial" };
    }
    if (credit.amountCredit > 0) {
      return { status: "On credit", badge: "CREDIT SALE", badgeTone: "credit" };
    }
  }

  return { status: "Completed", badge: "PAID IN FULL", badgeTone: "paid" };
}

function buildPaymentPanelHtml(
  sale: Sale,
  sales: Sale[],
  customerPayments: CustomerPayment[],
  includePayment: boolean,
) {
  if (!includePayment) {
    return `<div class="payment-panel estimation-panel">
      <p class="panel-title panel-title-green">PAYMENT</p>
      <p class="estimation-note">This document is an estimation only. No payment is recorded.</p>
    </div>`;
  }

  const creditContext = saleCreditPaymentContext(sale, sales, customerPayments);
  if (creditContext) {
    return buildInvoiceCreditPaymentHtml(sale, creditContext);
  }

  const credit = resolveSaleCreditDetails(sale);
  const paymentStatus = resolvePaymentStatus(sale, sales, customerPayments);
  const partialLine = credit?.partialPaymentMode
    ? detailRow("Partial via", credit.partialPaymentMode)
    : "";
  const refLine = credit?.paymentReference ? detailRow("Reference", credit.paymentReference) : "";
  const creditRows = credit
    ? `${detailRow("Paid now", formatCurrency(credit.amountPaid))}
       ${detailRow("On credit", formatCurrency(credit.amountCredit))}`
    : "";

  return `<div class="payment-panel">
    <p class="panel-title panel-title-green">PAYMENT METHOD</p>
    ${detailRow("Payment Mode", sale.paymentMode)}
    ${detailRow("Payment Status", paymentStatus.status)}
    ${partialLine}
    ${refLine}
    ${creditRows}
    <span class="status-badge status-badge-${paymentStatus.badgeTone}">${escapeHtml(paymentStatus.badge)}</span>
  </div>`;
}

function buildTotalsPanelHtml(
  sale: Sale,
  business: Business,
  meta: ReturnType<typeof printDocumentMeta>,
) {
  const gstAmounts = resolveSaleGstAmounts(business, sale);
  const invoiceSubtotal =
    sale.subtotal ?? sale.items.reduce((sum, item) => sum + item.total, 0);
  const invoiceDiscount = sale.discountAmount ?? 0;

  if (gstAmounts) {
    const discountRows =
      invoiceDiscount > 0
        ? `${detailRow("Discount", `-${formatCurrency(invoiceDiscount)}`)}
           ${detailRow("Net selling price", formatCurrency(gstAmounts.netSelling))}`
        : "";
    return `<div class="totals-panel">
      ${detailRow("Selling Price (Subtotal)", formatCurrency(gstAmounts.sellingSubtotal))}
      ${discountRows}
      ${detailRow(gstAmounts.gstLabel, formatCurrency(gstAmounts.gstAmount))}
      <div class="grand-total-row">
        <span class="grand-total-label">${escapeHtml(meta.totalLabel)}:</span>
        <span class="grand-total-value">${escapeHtml(formatCurrency(sale.total))}</span>
      </div>
    </div>`;
  }

  const discountRow =
    invoiceDiscount > 0
      ? `${detailRow("Subtotal", formatCurrency(invoiceSubtotal))}
         ${detailRow("Discount", `-${formatCurrency(invoiceDiscount)}`)}`
      : "";

  return `<div class="totals-panel">
    ${discountRow}
    <div class="grand-total-row">
      <span class="grand-total-label">${escapeHtml(meta.totalLabel)}:</span>
      <span class="grand-total-value">${escapeHtml(formatCurrency(sale.total))}</span>
    </div>
  </div>`;
}

export function buildInvoicePrintHtml(
  business: Business,
  sale: Sale,
  billTo: ReturnType<typeof resolveBillTo>,
  sales: Sale[],
  customerPayments: CustomerPayment[],
  kind: SalePrintKind = "invoice",
) {
  const meta = printDocumentMeta(kind);
  const hasGst = business.hasGst;
  const gstLines = sale.items.map((item) => ({
    lineTotal: item.total,
    gstPercent: saleItemGstPercent(item),
  }));
  const gstColumnLabel = hasGst ? gstLabelForRates(gstLines.map((line) => line.gstPercent)) : "";

  const letterheadHtml = business.letterheadDataUrl
    ? `<div class="letterhead"><img src="${escapeHtml(business.letterheadDataUrl)}" alt="Letterhead" /></div>`
    : "";
  const logoHtml = business.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(business.logoDataUrl)}" alt="Logo" />`
    : "";

  const itemsHtml = sale.items
    .map((item) => {
      const lineTotal = hasGst ? saleItemLineTotalInclGst(item) : item.total;
      const lineGst = hasGst ? saleItemLineGst(item) : 0;
      return `<tr>
        <td class="item-desc">
          ${escapeHtml(item.productName)}
          ${item.imei1 ? `<div class="imei">IMEI: ${escapeHtml(item.imei1)}</div>` : ""}
        </td>
        <td class="qty">${item.quantity}</td>
        <td class="num">${escapeHtml(formatCurrency(item.unitPrice))}</td>
        ${hasGst ? `<td class="num">${escapeHtml(formatCurrency(lineGst))}</td>` : ""}
        <td class="num amount">${escapeHtml(formatCurrency(lineTotal))}</td>
      </tr>`;
    })
    .join("");

  const paymentPanelHtml = buildPaymentPanelHtml(
    sale,
    sales,
    customerPayments,
    meta.includePayment,
  );
  const totalsPanelHtml = buildTotalsPanelHtml(sale, business, meta);

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8" />
    <title>${escapeHtml(meta.pageTitlePrefix)} ${escapeHtml(sale.id)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #0f172a;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        padding: 28px 32px;
        font-size: 14px;
        line-height: 1.45;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .invoice {
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        flex: 1 0 auto;
        display: flex;
        flex-direction: column;
      }
      .letterhead { margin: 0 0 18px; }
      .letterhead img {
        display: block;
        width: 100%;
        max-height: 120px;
        object-fit: contain;
        object-position: left center;
      }
      .doc-header { margin: 0 0 22px; }
      .doc-title {
        margin: 0;
        font-size: 34px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: #1e3a8a;
      }
      .doc-badge {
        display: inline-block;
        margin-top: 8px;
        padding: 4px 12px;
        border-radius: 999px;
        background: #e2e8f0;
        color: #475569;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 18px;
      }
      .panel {
        border: 1px solid #dbeafe;
        border-top-width: 3px;
        border-radius: 12px;
        padding: 16px 18px;
        background: #fff;
      }
      .panel-bill { border-top-color: #2563eb; }
      .panel-from { border-top-color: #0d9488; border-color: #ccfbf1; }
      .panel-title {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .panel-title-blue { color: #1d4ed8; }
      .panel-title-green { color: #0f766e; }
      .detail-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        font-size: 13px;
      }
      .detail-label { color: #64748b; }
      .detail-value {
        color: #0f172a;
        font-weight: 600;
        text-align: right;
      }
      .logo {
        display: block;
        width: 56px;
        height: 56px;
        object-fit: contain;
        margin-bottom: 10px;
      }
      table.items {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 18px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        overflow: hidden;
      }
      table.items thead { background: #f8fafc; }
      table.items th {
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #475569;
        text-align: left;
      }
      table.items th.qty { width: 56px; text-align: center; }
      table.items th.num { text-align: right; }
      table.items td {
        padding: 12px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
        color: #0f172a;
      }
      table.items tr:last-child td { border-bottom: 0; }
      table.items td.qty { text-align: center; }
      table.items td.num { text-align: right; white-space: nowrap; }
      table.items td.amount { font-weight: 700; }
      .imei { margin-top: 4px; font-size: 11px; color: #64748b; font-weight: 400; }
      .footer-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 28px;
      }
      .payment-panel {
        border: 1px solid #bbf7d0;
        border-radius: 12px;
        padding: 16px 18px;
        background: #f0fdf4;
      }
      .estimation-panel { background: #f8fafc; border-color: #e2e8f0; }
      .estimation-note { margin: 8px 0 0; font-size: 13px; color: #64748b; }
      .status-badge {
        display: inline-block;
        margin-top: 12px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
      }
      .status-badge-paid { background: #dcfce7; color: #15803d; }
      .status-badge-credit { background: #ffedd5; color: #c2410c; }
      .status-badge-partial { background: #fef3c7; color: #b45309; }
      .totals-panel {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px 18px;
        background: #f8fafc;
      }
      .totals-panel .detail-row { margin-bottom: 8px; }
      .grand-total-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 2px solid #bfdbfe;
      }
      .grand-total-label {
        font-size: 13px;
        font-weight: 600;
        color: #1e3a8a;
        white-space: nowrap;
      }
      .grand-total-value {
        font-size: 13px;
        font-weight: 600;
        color: #1e3a8a;
        white-space: nowrap;
        text-align: right;
      }
      .invoice-footer {
        margin-top: auto;
        padding-top: 18px;
        border-top: 1px solid #e2e8f0;
        text-align: center;
      }
      .thank-you {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 600;
        color: #334155;
      }
      .footer-note {
        margin: 0;
        font-size: 12px;
        color: #94a3b8;
      }
      ${invoiceCreditPaymentPrintStyles}
      @media print {
        body { padding: 0; }
        .invoice { max-width: none; }
      }
    </style>
  </head><body>
    <div class="invoice">
      ${letterheadHtml}
      <div class="doc-header">
        <h1 class="doc-title">${escapeHtml(meta.title)}</h1>
        <span class="doc-badge">${escapeHtml(meta.badge)}</span>
      </div>

      <div class="info-grid">
        <div class="panel panel-bill">
          <p class="panel-title panel-title-blue">INVOICE DETAILS &amp; BILL TO</p>
          ${detailRow(meta.docLabel, sale.id)}
          ${detailRow("Date", formatDateGB(sale.saleDate))}
          ${detailRow("Customer Name", billTo.name)}
          ${detailRow("Phone No", billTo.phone)}
          ${detailRow("Address", billTo.address)}
        </div>
        <div class="panel panel-from">
          <p class="panel-title panel-title-green">FROM DETAILS</p>
          ${logoHtml}
          ${detailRow("Business Name", business.businessName)}
          ${detailRow("Address", business.address.trim())}
          ${detailRow("Licence No", business.licenseNo.trim())}
          ${detailRow("TPN No", business.tpnNo.trim())}
          ${
            business.hasGst && business.gstRegistrationNo.trim()
              ? detailRow("GST Reg. No", business.gstRegistrationNo.trim())
              : ""
          }
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Item Description</th>
            <th class="qty">Qty</th>
            <th class="num">Price</th>
            ${hasGst ? `<th class="num">${escapeHtml(gstColumnLabel)}</th>` : ""}
            <th class="num">Total Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div class="footer-grid">
        ${paymentPanelHtml}
        ${totalsPanelHtml}
      </div>

      <footer class="invoice-footer">
        <p class="thank-you">Thank you for doing business with ${escapeHtml(business.businessName)}!</p>
        <p class="footer-note">${escapeHtml(meta.footerNote)}</p>
      </footer>
    </div>
  </body></html>`;
}

export { resolveBillTo };

function businessFromLines(business: Business) {
  const lines = [business.address.trim()].filter(Boolean);
  if (business.licenseNo.trim()) lines.push(`Licence No: ${business.licenseNo.trim()}`);
  if (business.tpnNo.trim()) lines.push(`TPN No: ${business.tpnNo.trim()}`);
  if (business.hasGst && business.gstRegistrationNo.trim()) {
    lines.push(`GST Reg. No: ${business.gstRegistrationNo.trim()}`);
  }
  return lines;
}

function billToLines(billTo: ReturnType<typeof resolveBillTo>) {
  const lines = [billTo.name];
  if (billTo.phone) lines.push(billTo.phone);
  if (billTo.address) lines.push(billTo.address);
  return lines;
}

export {
  businessFromLines,
  billToLines,
  saleItemGstPercent,
  saleItemLineGst,
  saleItemLineTotalInclGst,
  resolveSaleGstAmounts,
};
