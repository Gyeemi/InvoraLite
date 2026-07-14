import { formatCurrency, formatDateDMY, formatDateDMYShort, roundMoney } from "./constants";
import { DEFAULT_GST_RATE_PERCENT, productGstPercent, sellingPriceWithGst } from "./gst";
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
    if (!item.productId || !item.productName.trim()) {
      return `Select a product for line ${index + 1}.`;
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

export function buildQuotationPrintHtml(
  business: Business,
  quotation: Quotation,
  hasGst: boolean,
): string {
  const totals = quotationTotals(quotation.items, hasGst);
  const fromLines = [
    business.address.trim(),
    business.licenseNo.trim() ? `Licence No: ${business.licenseNo.trim()}` : "",
    business.tpnNo.trim() ? `TPN No: ${business.tpnNo.trim()}` : "",
    business.phone.trim()
      ? `Phone: ${business.phoneCountryCode} ${business.phone}`.trim()
      : "",
  ].filter(Boolean);

  const toLines = [
    quotation.quotationTo,
    quotation.contactPerson ? `Attn: ${quotation.contactPerson}` : "",
    quotation.phone ?? "",
    quotation.address ?? "",
  ].filter(Boolean);

  const itemsHtml = quotation.items
    .map((item, index) => {
      const excl = quotationItemLineExcl(item);
      const incl = quotationItemLineIncl(item);
      return `<tr>
        <td class="num">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(item.productName)}</div>
          <div class="item-meta">${escapeHtml([item.sku, item.category, item.uom].filter(Boolean).join(" · "))}</div>
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num">${escapeHtml(formatCurrency(item.unitPrice))}</td>
        ${
          hasGst
            ? `<td class="num">${item.gstPercent}%</td>
               <td class="amount">${escapeHtml(formatCurrency(incl))}</td>`
            : `<td class="amount">${escapeHtml(formatCurrency(excl))}</td>`
        }
      </tr>`;
    })
    .join("");

  const dateFull = formatDateDMY(quotation.quotationDate);
  const dateShort = formatDateDMYShort(quotation.quotationDate);

  return `<!DOCTYPE html><html><head><title>Quotation ${escapeHtml(quotation.id)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 32px; color: #0f172a; background: #fff; }
      .title { margin: 0 0 24px; font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
      .label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin: 0 0 6px; }
      .from-name, .to-name { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
      .line { margin: 0 0 2px; font-size: 13px; line-height: 1.5; color: #475569; white-space: pre-line; }
      .meta { text-align: right; font-size: 13px; }
      .meta p { margin: 0 0 4px; }
      .meta-label { color: #64748b; }
      .subject { margin: 20px 0 0; font-size: 13px; color: #334155; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
      th { padding: 8px 6px; border-bottom: 1px solid #cbd5e1; text-align: left; font-weight: 600; color: #64748b; }
      th.num, td.num, th.amount, td.amount { text-align: right; }
      td { padding: 10px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .item-name { font-weight: 600; }
      .item-meta { margin-top: 2px; font-size: 11px; color: #64748b; }
      .totals { margin-top: 16px; text-align: right; }
      .totals p { margin: 4px 0; font-size: 13px; color: #475569; }
      .grand { margin-top: 8px; font-size: 18px; font-weight: 700; color: #0f172a; }
      .terms { margin-top: 28px; font-size: 12px; color: #475569; white-space: pre-line; }
      .terms-label { font-weight: 600; color: #334155; margin-bottom: 4px; }
      .sign { margin-top: 40px; font-size: 12px; color: #64748b; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <h1 class="title">Quotation</h1>
    <div class="grid">
      <div>
        <p class="label">From</p>
        <p class="from-name">${escapeHtml(business.businessName)}</p>
        ${fromLines.map((line) => `<p class="line">${escapeHtml(line)}</p>`).join("")}
      </div>
      <div class="meta">
        <p><span class="meta-label">Quotation No:</span> ${escapeHtml(quotation.id)}</p>
        <p><span class="meta-label">Date:</span> ${escapeHtml(dateFull)} <span style="color:#94a3b8">(${escapeHtml(dateShort)})</span></p>
        ${
          quotation.validUntil
            ? `<p><span class="meta-label">Valid until:</span> ${escapeHtml(formatDateDMY(quotation.validUntil))}</p>`
            : ""
        }
        ${
          quotation.reference
            ? `<p><span class="meta-label">Ref:</span> ${escapeHtml(quotation.reference)}</p>`
            : ""
        }
        <div style="margin-top:16px;text-align:right">
          <p class="label">Quotation To</p>
          ${toLines
            .map((line, i) =>
              i === 0
                ? `<p class="to-name">${escapeHtml(line)}</p>`
                : `<p class="line">${escapeHtml(line)}</p>`,
            )
            .join("")}
        </div>
      </div>
    </div>
    ${
      quotation.subject
        ? `<p class="subject"><strong>Subject:</strong> ${escapeHtml(quotation.subject)}</p>`
        : ""
    }
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit price${hasGst ? " (excl.)" : ""}</th>
          ${hasGst ? "<th class=\"num\">GST</th><th class=\"amount\">Amount (incl.)</th>" : "<th class=\"amount\">Amount</th>"}
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">
      ${
        hasGst
          ? `<p>Subtotal (excl. GST): ${escapeHtml(formatCurrency(totals.subtotalExcl))}</p>
             <p>GST: ${escapeHtml(formatCurrency(totals.gstAmount))}</p>`
          : ""
      }
      <p class="grand">Grand Total: ${escapeHtml(formatCurrency(totals.grandTotal))}</p>
    </div>
    ${
      quotation.notes || quotation.terms
        ? `<div class="terms"><div class="terms-label">Terms & notes</div>${escapeHtml(
            [quotation.terms, quotation.notes].filter(Boolean).join("\n\n"),
          )}</div>`
        : ""
    }
    <p class="sign">This quotation is not a tax invoice. Prices are subject to confirmation at the time of sale.</p>
    </body></html>`;
}
