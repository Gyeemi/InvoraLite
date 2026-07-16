import { formatCurrency, formatDateDMY, roundMoney } from "./constants";
import { DEFAULT_GST_RATE_PERCENT, gstLabelForRates, productGstPercent, sellingPriceWithGst } from "./gst";
import { DEFAULT_BASE_UOM } from "./inventoryUom";
import {
  defaultRateMasterSaleUnit,
  findRateMasterForProduct,
  isValidISODate,
  todayISO,
} from "./rateMaster";
import type { Business, Product, Quotation, QuotationItem, QuotationStatus, RateMaster } from "../types";

export function normalizeQuotationItem(item: Partial<QuotationItem>): QuotationItem {
  return {
    productId: item.productId?.trim() ?? "",
    productName: item.productName?.trim() ?? "",
    category: item.category?.trim() ?? "",
    sku: item.sku?.trim() ?? "",
    quantity: Math.max(0, Number(item.quantity) || 0),
    uom: item.uom?.trim() || DEFAULT_BASE_UOM,
    conversionFactor: Math.max(0.0001, Number(item.conversionFactor) || 1),
    unitPrice: roundMoney(Math.max(0, Number(item.unitPrice) || 0)),
    gstPercent: Math.max(0, Number(item.gstPercent) || DEFAULT_GST_RATE_PERCENT),
  };
}

export function normalizeQuotation(
  entry: Partial<Quotation> & Record<string, unknown> & { id?: string },
): Quotation {
  const createdDay = (entry.createdAt ?? todayISO()).slice(0, 10);
  const quotationDate =
    entry.quotationDate && isValidISODate(entry.quotationDate)
      ? entry.quotationDate
      : isValidISODate(createdDay)
        ? createdDay
        : todayISO();
  const validUntil =
    entry.validUntil && isValidISODate(String(entry.validUntil))
      ? String(entry.validUntil)
      : null;
  const status = (
    ["draft", "sent", "accepted", "converted", "cancelled"] as QuotationStatus[]
  ).includes(entry.status as QuotationStatus)
    ? (entry.status as QuotationStatus)
    : "draft";

  return {
    id: String(entry.id ?? ""),
    quotationTo: String(entry.quotationTo ?? "").trim(),
    contactPerson: String(entry.contactPerson ?? "").trim() || undefined,
    phone: String(entry.phone ?? "").trim() || undefined,
    address: String(entry.address ?? "").trim() || undefined,
    quotationDate,
    validUntil,
    subject: String(entry.subject ?? "").trim() || undefined,
    reference: String(entry.reference ?? "").trim() || undefined,
    items: Array.isArray(entry.items)
      ? entry.items.map((row) => normalizeQuotationItem(row as Partial<QuotationItem>))
      : [],
    notes: String(entry.notes ?? "").trim() || undefined,
    terms: String(entry.terms ?? "").trim() || undefined,
    status,
    convertedSaleId: String(entry.convertedSaleId ?? "").trim() || undefined,
    createdAt: entry.createdAt ? String(entry.createdAt) : new Date().toISOString(),
    updatedAt: entry.updatedAt ? String(entry.updatedAt) : new Date().toISOString(),
  };
}

export function quotationItemLineExcl(item: QuotationItem): number {
  return roundMoney(item.unitPrice * item.quantity);
}

export function quotationItemLineGst(item: QuotationItem): number {
  return sellingPriceWithGst(quotationItemLineExcl(item), item.gstPercent).gst;
}

export function quotationItemLineIncl(item: QuotationItem): number {
  return sellingPriceWithGst(quotationItemLineExcl(item), item.gstPercent).total;
}

export function quotationTotals(items: QuotationItem[], hasGst: boolean) {
  const subtotalExcl = roundMoney(
    items.reduce((sum, item) => sum + quotationItemLineExcl(item), 0),
  );
  if (!hasGst) {
    return { subtotalExcl, gstAmount: 0, grandTotal: subtotalExcl };
  }
  const gstAmount = roundMoney(
    items.reduce((sum, item) => sum + quotationItemLineGst(item), 0),
  );
  return {
    subtotalExcl,
    gstAmount,
    grandTotal: roundMoney(subtotalExcl + gstAmount),
  };
}

export function validateQuotationDraft(input: {
  quotationTo: string;
  quotationDate: string;
  items: QuotationItem[];
}): string | null {
  if (!input.quotationTo.trim()) return "Enter the company name (Quotation To).";
  if (!isValidISODate(input.quotationDate)) return "Enter a valid quotation date.";
  if (input.items.length === 0) return "Add at least one product.";
  for (const [index, item] of input.items.entries()) {
    if (!item.productName.trim()) {
      return `Enter or select a product for line ${index + 1}.`;
    }
    if (!(item.quantity > 0)) return `Enter quantity for ${item.productName}.`;
    if (!(item.unitPrice > 0)) return `Enter unit price for ${item.productName}.`;
  }
  return null;
}

/** Default selling unit/price from Rate Master when available, else product retail. */
export function quotationDefaultsForProduct(
  product: Product,
  rateMasters: RateMaster[] = [],
): Pick<QuotationItem, "uom" | "unitPrice" | "gstPercent" | "conversionFactor"> {
  const rateMaster = findRateMasterForProduct(rateMasters, product);
  const saleUnit = rateMaster
    ? defaultRateMasterSaleUnit(rateMaster, product.baseUom)
    : null;
  return {
    uom: saleUnit?.name ?? product.baseUom?.trim() ?? DEFAULT_BASE_UOM,
    conversionFactor: saleUnit?.conversionFactor ?? 1,
    unitPrice: roundMoney(
      saleUnit?.sellingPrice && saleUnit.sellingPrice > 0
        ? saleUnit.sellingPrice
        : product.price,
    ),
    gstPercent: productGstPercent(product),
  };
}

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

export function buildQuotationPrintHtml(
  business: Business,
  quotation: Quotation,
  hasGst: boolean,
): string {
  const totals = quotationTotals(quotation.items, hasGst);
  const gstColumnLabel = hasGst
    ? gstLabelForRates(quotation.items.map((item) => item.gstPercent || DEFAULT_GST_RATE_PERCENT))
    : "";

  const letterheadHtml = business.letterheadDataUrl
    ? `<div class="letterhead"><img src="${escapeHtml(business.letterheadDataUrl)}" alt="Letterhead" /></div>`
    : "";
  const logoHtml = business.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(business.logoDataUrl)}" alt="Logo" />`
    : "";

  const itemsHtml = quotation.items
    .map((item) => {
      const excl = quotationItemLineExcl(item);
      const gst = quotationItemLineGst(item);
      const incl = quotationItemLineIncl(item);
      const meta = [item.sku, item.category, item.uom].filter(Boolean).join(" · ");
      return `<tr>
        <td class="item-desc">
          ${escapeHtml(item.productName)}
          ${meta ? `<div class="item-meta">${escapeHtml(meta)}</div>` : ""}
        </td>
        <td class="qty">${item.quantity}</td>
        <td class="num">${escapeHtml(formatCurrency(item.unitPrice))}</td>
        ${hasGst ? `<td class="num">${escapeHtml(formatCurrency(gst))}</td>` : ""}
        <td class="num amount">${escapeHtml(formatCurrency(hasGst ? incl : excl))}</td>
      </tr>`;
    })
    .join("");

  const termsNotes = [quotation.terms, quotation.notes].filter(Boolean).join("\n\n");
  const dateFull = formatDateDMY(quotation.quotationDate);

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8" />
    <title>Quotation Estimation ${escapeHtml(quotation.id)}</title>
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
      .quote {
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
      .item-meta { margin-top: 4px; font-size: 11px; color: #64748b; font-weight: 400; }
      .footer-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 28px;
      }
      .notes-panel {
        border: 1px solid #bbf7d0;
        border-radius: 12px;
        padding: 16px 18px;
        background: #f0fdf4;
      }
      .notes-body {
        margin: 0;
        font-size: 13px;
        color: #475569;
        white-space: pre-line;
      }
      .status-badge {
        display: inline-block;
        margin-top: 12px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        background: #e0e7ff;
        color: #3730a3;
      }
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
      .quote-footer {
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
      @media print {
        body { padding: 0; }
        .quote { max-width: none; }
      }
    </style>
  </head><body>
    <div class="quote">
      ${letterheadHtml}
      <div class="doc-header">
        <h1 class="doc-title">QUOTATION ESTIMATION</h1>
        <span class="doc-badge">FOR REFERENCE ONLY</span>
      </div>

      <div class="info-grid">
        <div class="panel panel-bill">
          <p class="panel-title panel-title-blue">QUOTATION DETAILS &amp; BILL TO</p>
          ${detailRow("Quotation No", quotation.id)}
          ${detailRow("Date", dateFull)}
          ${
            quotation.validUntil
              ? detailRow("Valid Until", formatDateDMY(quotation.validUntil))
              : ""
          }
          ${detailRow("Customer Name", quotation.quotationTo)}
          ${detailRow("Contact Person", quotation.contactPerson ?? "")}
          ${detailRow("Phone No", quotation.phone ?? "")}
          ${detailRow("Address", quotation.address ?? "")}
          ${detailRow("Subject", quotation.subject ?? "")}
          ${detailRow("Reference", quotation.reference ?? "")}
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
          ${
            business.phone.trim()
              ? detailRow("Phone No", `${business.phoneCountryCode} ${business.phone}`.trim())
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
        <div class="notes-panel">
          <p class="panel-title panel-title-green">TERMS &amp; NOTES</p>
          ${
            termsNotes
              ? `<p class="notes-body">${escapeHtml(termsNotes)}</p>`
              : `<p class="notes-body">Prices are subject to confirmation at the time of sale.</p>`
          }
          <span class="status-badge">NOT A TAX INVOICE</span>
        </div>
        <div class="totals-panel">
          ${
            hasGst
              ? `${detailRow("Selling Price (Subtotal)", formatCurrency(totals.subtotalExcl))}
                 ${detailRow(gstColumnLabel || "GST", formatCurrency(totals.gstAmount))}`
              : ""
          }
          <div class="grand-total-row">
            <span class="grand-total-label">Estimated Grand Total:</span>
            <span class="grand-total-value">${escapeHtml(formatCurrency(totals.grandTotal))}</span>
          </div>
        </div>
      </div>

      <footer class="quote-footer">
        <p class="thank-you">Thank you for doing business with ${escapeHtml(business.businessName)}!</p>
        <p class="footer-note">This is a computer-generated quotation estimation and does not require a physical signature.</p>
      </footer>
    </div>
  </body></html>`;
}
