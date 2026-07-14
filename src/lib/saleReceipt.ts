import {
  formatCurrency,
  formatDateGB,
  formatSalePaymentSummary,
  resolveSaleCreditDetails,
} from "./constants";
import {
  DEFAULT_GST_RATE_PERCENT,
  gstLabelForRates,
  saleAmountsFromGstLines,
} from "./gst";
import { formatUomDisplay } from "./inventoryUom";
import { isHalfSaleUnit, parentUnitFromHalfSaleUnit } from "./rateMaster";
import type { Business, Sale, SaleItem } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** e.g. "1 Tray x Nu. 530.00" or "½ Tray x Nu. 265.00" */
export function formatSaleReceiptQtyLine(item: Pick<SaleItem, "quantity" | "unitPrice" | "uom">): string {
  const uomRaw = item.uom?.trim() ?? "";
  const price = formatCurrency(item.unitPrice);

  if (uomRaw && isHalfSaleUnit(uomRaw)) {
    const parent = parentUnitFromHalfSaleUnit(uomRaw) ?? formatUomDisplay(uomRaw.replace(/^half[\s-]+/i, ""));
    if (item.quantity === 1) {
      return `½ ${parent} x ${price}`;
    }
    return `${item.quantity} × ½ ${parent} x ${price}`;
  }

  const uom = uomRaw ? formatUomDisplay(uomRaw) : "";
  const qtyPart = uom ? `${item.quantity} ${uom}` : String(item.quantity);
  return `${qtyPart} x ${price}`;
}

function businessHeaderLines(business: Business): string[] {
  const lines = [business.address.trim()].filter(Boolean);
  if (business.phone.trim()) {
    lines.push(`${business.phoneCountryCode} ${business.phone}`.trim());
  }
  if (business.licenseNo.trim()) lines.push(`Licence: ${business.licenseNo.trim()}`);
  if (business.tpnNo.trim()) lines.push(`TPN: ${business.tpnNo.trim()}`);
  if (business.hasGst && business.gstRegistrationNo.trim()) {
    lines.push(`GST Registration No: ${business.gstRegistrationNo.trim()}`);
  }
  return lines;
}

function paymentLines(sale: Sale): string[] {
  const credit = resolveSaleCreditDetails(sale);
  if (credit) {
    const lines = [`Payment: ${sale.paymentMode}`];
    if (credit.partialPaymentMode) {
      lines.push(`Partial via: ${credit.partialPaymentMode}`);
    }
    if (credit.paymentReference) {
      lines.push(`Ref: ${credit.paymentReference}`);
    }
    lines.push(`Paid now: ${formatCurrency(credit.amountPaid)}`);
    lines.push(`On credit: ${formatCurrency(credit.amountCredit)}`);
    return lines;
  }
  return formatSalePaymentSummary(sale).split(" · ");
}

export function buildSaleThermalReceiptHtml(business: Business, sale: Sale): string {
  const headerLines = businessHeaderLines(business).map(escapeHtml);
  const subtotal = sale.subtotal ?? sale.items.reduce((sum, item) => sum + item.total, 0);
  const discount = sale.discountAmount ?? 0;
  const gstLines = sale.items.map((item) => ({
    lineTotal: item.total,
    gstPercent: item.gstPercent ?? DEFAULT_GST_RATE_PERCENT,
  }));
  const gstLabel = gstLabelForRates(gstLines.map((line) => line.gstPercent));
  const gstAmounts = business.hasGst
    ? sale.gstAmount != null
      ? {
          sellingSubtotal: subtotal,
          discount,
          netSelling: Math.max(0, subtotal - discount),
          gstAmount: sale.gstAmount,
          total: sale.total,
        }
      : saleAmountsFromGstLines(gstLines, discount, true)
    : null;

  const itemRows = sale.items
    .map((item) => {
      const imei = item.imei1 ? `<div class="item-meta">IMEI: ${escapeHtml(item.imei1)}</div>` : "";
      return `<div class="item">
        <div class="item-name">${escapeHtml(item.productName)}</div>
        ${imei}
        <div class="item-row">
          <span>${escapeHtml(formatSaleReceiptQtyLine(item))}</span>
          <span>${escapeHtml(formatCurrency(item.total))}</span>
        </div>
      </div>`;
    })
    .join("");

  const totalsHtml =
    discount > 0
      ? gstAmounts
        ? `<div class="row"><span>Selling price</span><span>${escapeHtml(formatCurrency(gstAmounts.sellingSubtotal))}</span></div>
           <div class="row discount"><span>Discount</span><span>-${escapeHtml(formatCurrency(discount))}</span></div>
           <div class="row"><span>Net selling price</span><span>${escapeHtml(formatCurrency(gstAmounts.netSelling))}</span></div>
           <div class="row"><span>${escapeHtml(gstLabel)}</span><span>${escapeHtml(formatCurrency(gstAmounts.gstAmount))}</span></div>
           <div class="row total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(sale.total))}</span></div>`
        : `<div class="row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(subtotal))}</span></div>
           <div class="row discount"><span>Discount</span><span>-${escapeHtml(formatCurrency(discount))}</span></div>
           <div class="row total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(sale.total))}</span></div>`
      : gstAmounts
        ? `<div class="row"><span>Selling price</span><span>${escapeHtml(formatCurrency(gstAmounts.sellingSubtotal))}</span></div>
           <div class="row"><span>${escapeHtml(gstLabel)}</span><span>${escapeHtml(formatCurrency(gstAmounts.gstAmount))}</span></div>
           <div class="row total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(sale.total))}</span></div>`
        : `<div class="row total"><span>TOTAL</span><span>${escapeHtml(formatCurrency(sale.total))}</span></div>`;

  const paymentHtml = paymentLines(sale)
    .map((line) => `<div class="payment-line">${escapeHtml(line)}</div>`)
    .join("");

  return `<!DOCTYPE html><html><head><title>Receipt ${escapeHtml(sale.id)}</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 80mm;
        height: auto;
        min-height: 0;
      }
      body {
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        line-height: 1.35;
        color: #000;
        background: #fff;
      }
      .receipt {
        width: 80mm;
        margin: 0;
        padding: 4mm 2mm 0;
      }
      .center { text-align: center; }
      .biz-name { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
      .biz-line { margin: 0 0 2px; font-size: 11px; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      .meta { font-size: 11px; }
      .meta p { margin: 0 0 2px; }
      .item { margin-bottom: 6px; }
      .item-name { font-weight: 700; }
      .item-meta { font-size: 10px; margin-top: 1px; }
      .item-row, .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 2px;
      }
      .row.total { font-size: 14px; font-weight: 700; margin-top: 4px; }
      .row.discount { color: #444; }
      .payment-line { font-size: 11px; margin-top: 2px; }
      .footer {
        margin: 10px 0 0;
        font-size: 11px;
        text-align: center;
        page-break-after: avoid;
      }
      .cut-space {
        height: 10mm;
        max-height: 10mm;
        page-break-after: avoid;
      }
      @media print {
        html, body {
          width: 80mm;
          height: auto;
          min-height: 0;
          overflow: visible;
        }
        .receipt {
          width: 80mm;
          padding: 4mm 2mm 0;
        }
      }
    </style></head><body>
    <div class="receipt">
    <div class="center">
      <p class="biz-name">${escapeHtml(business.businessName)}</p>
      ${headerLines.map((line) => `<p class="biz-line">${line}</p>`).join("")}
    </div>
    <div class="divider"></div>
    <div class="meta">
      <p>Receipt: ${escapeHtml(sale.id)}</p>
      <p>Date: ${escapeHtml(formatDateGB(sale.saleDate))}</p>
      <p>Customer: ${escapeHtml(sale.customerName)}</p>
    </div>
    <div class="divider"></div>
    ${itemRows}
    <div class="divider"></div>
    ${totalsHtml}
    <div class="divider"></div>
    ${paymentHtml}
    <p class="footer">Thank you for your purchase.</p>
    <div class="cut-space" aria-hidden="true"></div>
    </div>
    </body></html>`;
}

export function printSaleThermalReceipt(business: Business, sale: Sale): void {
  const html = buildSaleThermalReceiptHtml(business, sale);
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:80mm;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    const win = frame.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 250);
}
