import type { ProfitAndLossReport } from "./accounting";
import { CHART_OF_ACCOUNTS, periodBounds } from "./accounting";
import { formatContactPhone, formatCurrency, formatDateGB } from "./constants";
import { printHtmlDocument, REPORT_PRINT_STYLES } from "./reportPrint";
import type { Business, MonthlyClose, OfficeExpense, Purchase, Sale } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inPeriod(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function purchaseGst(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => {
    const qty = item.quantity > 0 ? item.quantity : 1;
    return sum + item.costPrice * (item.gstPercent / 100) * qty;
  }, 0);
}

export interface TaxSubmissionReportInput {
  business: Business;
  periodKey: string;
  pl: ProfitAndLossReport;
  sales: Sale[];
  purchases: Purchase[];
  expenses: OfficeExpense[];
  close?: MonthlyClose | null;
  generatedBy?: string;
}

export interface TaxSubmissionReportData {
  business: Business;
  periodKey: string;
  from: string;
  to: string;
  pl: ProfitAndLossReport;
  close?: MonthlyClose | null;
  generatedBy: string;
  generatedAt: string;
  salesInPeriod: Sale[];
  purchasesInPeriod: Purchase[];
  expensesInPeriod: OfficeExpense[];
  expenseByCategory: Array<{ category: string; amount: number }>;
}

export function buildTaxSubmissionReportData(input: TaxSubmissionReportInput): TaxSubmissionReportData {
  const { from, to } = periodBounds(input.periodKey);
  const salesInPeriod = input.sales.filter(
    (sale) => sale.status !== "cancelled" && inPeriod(sale.saleDate, from, to),
  );
  const purchasesInPeriod = input.purchases.filter(
    (purchase) => purchase.status !== "cancelled" && inPeriod(purchase.purchaseDate, from, to),
  );
  const expensesInPeriod = input.expenses.filter(
    (expense) =>
      expense.category !== "Asset Purchases (Fixed Assets)" && inPeriod(expense.expenseDate, from, to),
  );

  const categoryTotals = new Map<string, number>();
  for (const expense of expensesInPeriod) {
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount);
  }
  const expenseByCategory = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    business: input.business,
    periodKey: input.periodKey,
    from,
    to,
    pl: input.pl,
    close: input.close,
    generatedBy: input.generatedBy ?? "Admin",
    generatedAt: new Date().toISOString(),
    salesInPeriod,
    purchasesInPeriod,
    expensesInPeriod,
    expenseByCategory,
  };
}

function row(
  label: string,
  value: number,
  options?: { bold?: boolean; indent?: boolean; debit?: boolean; note?: string },
) {
  const cls = [
    options?.bold ? "bold" : "",
    options?.indent ? "indent" : "",
    options?.debit ? "negative" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const prefix = value < 0 ? "−" : "";
  const amount = `${prefix}${formatCurrency(Math.abs(value))}${options?.debit ? " (Dr)" : ""}`;
  const note = options?.note
    ? `<div class="row-note">${escapeHtml(options.note)}</div>`
    : "";
  return `<tr class="${cls}">
    <td>${escapeHtml(label)}${note}</td>
    <td class="amount">${escapeHtml(amount)}</td>
  </tr>`;
}

function businessHeader(business: Business): string {
  const lines = [
    business.address.trim(),
    formatContactPhone(business.phoneCountryCode, business.phone),
    business.email.trim(),
  ].filter(Boolean);
  const taxLines = [
    business.tpnNo.trim() ? `TPN: ${business.tpnNo.trim()}` : "",
    business.hasGst && business.gstRegistrationNo.trim()
      ? `GST Registration No: ${business.gstRegistrationNo.trim()}`
      : "",
    business.licenseNo.trim() ? `Business Licence No: ${business.licenseNo.trim()}` : "",
  ].filter(Boolean);

  return `<div class="business-block">
    <p class="business-name">${escapeHtml(business.businessName)}</p>
    ${lines.map((line) => `<p class="business-line">${escapeHtml(line)}</p>`).join("")}
    ${taxLines.map((line) => `<p class="business-tax">${escapeHtml(line)}</p>`).join("")}
  </div>`;
}

export function buildTaxSubmissionReportPageContent(
  data: TaxSubmissionReportData,
  options?: { supportingDocument?: boolean; annualLabel?: string },
): string {
  const { business, periodKey, from, to, pl, close, generatedBy, generatedAt } = data;
  const netGst = pl.gstOutput - pl.gstInput;
  const salesTotal = data.salesInPeriod.reduce((sum, sale) => sum + sale.total, 0);
  const purchaseTotal = data.purchasesInPeriod.reduce((sum, purchase) => sum + purchase.total, 0);
  const purchaseGstTotal = data.purchasesInPeriod.reduce((sum, purchase) => sum + purchaseGst(purchase), 0);
  const expenseTotal = data.expensesInPeriod.reduce((sum, expense) => sum + expense.amount, 0);

  const plRevenueRows = [
    row("Gross Sales Revenue", pl.revenue),
    ...(pl.salesDiscounts > 0 ? [row("Less: Sales Discounts", -pl.salesDiscounts, { indent: true })] : []),
    ...(business.hasGst
      ? [
          row("Sales Revenue (Inclusive of GST)", pl.salesRevenueWithGst, {
            note: "Products sold with GST added",
          }),
          row("Sales Revenue (Exclusive of GST)", pl.salesRevenueWithoutGst, {
            note: "Products sold without GST added",
          }),
        ]
      : []),
    row("Net Revenue", pl.netRevenue, { bold: true }),
  ].join("");

  const plCostsRows = [
    row("Cost of Goods Sold (COGS)", pl.cogs, { debit: true }),
    row("Gross Profit", pl.grossProfit, { bold: true }),
    row("Operating Expenses", pl.operatingExpenses, { debit: true }),
    ...(pl.depreciation > 0 ? [row("Depreciation", pl.depreciation, { debit: true })] : []),
    row("Net Profit", pl.netProfit, { bold: true }),
  ].join("");

  const gstSection = business.hasGst
    ? `<section class="section">
        <h2>GST Summary</h2>
        <p class="section-note">Figures below are estimated from recorded sales and purchases for tax reporting support.</p>
        <table class="data-table summary-table">
          <tbody>
            ${row("Taxable sales basis (net revenue)", pl.netRevenue)}
            ${row("GST Output (on sales)", pl.gstOutput)}
            ${row("GST Input (on purchases)", pl.gstInput)}
            ${row(netGst >= 0 ? "Net GST Payable" : "Net GST Refundable", Math.abs(netGst), { bold: true })}
          </tbody>
        </table>
        <h3 class="subheading">Purchase register (input tax support)</h3>
        <table class="data-table detail-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice No</th>
              <th>Supplier</th>
              <th class="amount">Purchase Total</th>
              <th class="amount">GST Input</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.purchasesInPeriod.length === 0
                ? '<tr><td colspan="5" class="empty">No purchases recorded in this period.</td></tr>'
                : data.purchasesInPeriod
                    .map(
                      (purchase) => `<tr>
                        <td>${escapeHtml(formatDateGB(purchase.purchaseDate))}</td>
                        <td>${escapeHtml(purchase.invoiceNo)}</td>
                        <td>${escapeHtml(purchase.supplierName)}</td>
                        <td class="amount">${escapeHtml(formatCurrency(purchase.total))}</td>
                        <td class="amount">${escapeHtml(formatCurrency(purchaseGst(purchase)))}</td>
                      </tr>`,
                    )
                    .join("")
            }
            <tr class="total-row">
              <td colspan="3">Total</td>
              <td class="amount">${escapeHtml(formatCurrency(purchaseTotal))}</td>
              <td class="amount">${escapeHtml(formatCurrency(purchaseGstTotal))}</td>
            </tr>
          </tbody>
        </table>
      </section>`
    : `<section class="section">
        <h2>Tax Registration</h2>
        <p class="section-note">GST is not enabled for this business. Enable GST in business settings to include output and input tax breakdowns.</p>
      </section>`;

  const expenseRows =
    data.expenseByCategory.length === 0
      ? '<tr><td colspan="2" class="empty">No operating expenses recorded in this period.</td></tr>'
      : data.expenseByCategory
          .map(
            (entry) => `<tr>
              <td>${escapeHtml(entry.category)}</td>
              <td class="amount">${escapeHtml(formatCurrency(entry.amount))}</td>
            </tr>`,
          )
          .join("");

  const salesDetailRows =
    data.salesInPeriod.length === 0
      ? '<tr><td colspan="5" class="empty">No sales recorded in this period.</td></tr>'
      : data.salesInPeriod
          .map(
            (sale) => `<tr>
              <td>${escapeHtml(formatDateGB(sale.saleDate))}</td>
              <td>${escapeHtml(sale.id)}</td>
              <td>${escapeHtml(sale.customerName)}</td>
              <td>${escapeHtml(sale.paymentMode)}</td>
              <td class="amount">${escapeHtml(formatCurrency(sale.total))}</td>
            </tr>`,
          )
          .join("");

  const expenseAccountRows = Object.entries(pl.expenseByAccount)
    .filter(([, amount]) => amount > 0)
    .map(([code, amount]) => {
      const account = CHART_OF_ACCOUNTS.find((entry) => entry.code === code);
      const label = account ? `${code} — ${account.name}` : code;
      return `<tr><td>${escapeHtml(label)}</td><td class="amount">${escapeHtml(formatCurrency(amount))}</td></tr>`;
    })
    .join("");

  const closeBlock = close
    ? `<div class="close-banner">
        <strong>Period closed:</strong>
        ${escapeHtml(formatDateGB(close.closedAt.slice(0, 10)))} by ${escapeHtml(close.closedBy)}
      </div>`
    : `<div class="draft-banner">
        <strong>Draft report</strong> — period not yet closed. Verify figures before submission to tax authorities.
      </div>`;

  const supportingBanner =
    options?.supportingDocument && options.annualLabel
      ? `<div class="supporting-banner">Supporting document · Monthly tax report · ${escapeHtml(options.annualLabel)} · Period ${escapeHtml(periodKey)}</div>`
      : "";

  return `<div class="page">
      ${supportingBanner}
      <div class="report-header">
        ${businessHeader(business)}
        <div class="report-meta">
          <p class="report-title">Tax &amp; Financial Submission Report</p>
          <p class="report-subtitle">Monthly accounting summary for tax filing support</p>
          <p class="meta-line"><strong>Period:</strong> ${escapeHtml(periodKey)}</p>
          <p class="meta-line"><strong>From:</strong> ${escapeHtml(formatDateGB(from))}</p>
          <p class="meta-line"><strong>To:</strong> ${escapeHtml(formatDateGB(to))}</p>
          <p class="meta-line"><strong>Generated:</strong> ${escapeHtml(formatDateGB(generatedAt.slice(0, 10)))}</p>
          <p class="meta-line"><strong>Prepared by:</strong> ${escapeHtml(generatedBy)}</p>
        </div>
      </div>

      ${closeBlock}

      <section class="section">
        <h2>Executive Summary</h2>
        <div class="kpi-grid">
          <div class="kpi"><p class="kpi-label">Net Revenue</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.netRevenue))}</p></div>
          <div class="kpi"><p class="kpi-label">Gross Profit</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.grossProfit))}</p></div>
          <div class="kpi"><p class="kpi-label">Net Profit</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.netProfit))}</p></div>
          <div class="kpi"><p class="kpi-label">${business.hasGst ? "Net GST Payable" : "Sales Count"}</p><p class="kpi-value">${business.hasGst ? escapeHtml(formatCurrency(Math.max(0, netGst))) : String(data.salesInPeriod.length)}</p></div>
        </div>
      </section>

      <section class="section">
        <h2>Profit &amp; Loss Statement</h2>
        <h3 class="subheading">Revenue Breakdown</h3>
        <table class="data-table summary-table">
          <tbody>${plRevenueRows}</tbody>
        </table>
        <h3 class="subheading">Costs &amp; Profitability</h3>
        <table class="data-table summary-table">
          <tbody>${plCostsRows}</tbody>
        </table>
      </section>

      ${gstSection}

      <section class="section">
        <h2>Sales Register Summary</h2>
        <table class="data-table detail-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice / Sale No</th>
              <th>Customer</th>
              <th>Payment</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${salesDetailRows}
            <tr class="total-row">
              <td colspan="4">${data.salesInPeriod.length} sale(s)</td>
              <td class="amount">${escapeHtml(formatCurrency(salesTotal))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Operating Expenses</h2>
        <table class="data-table summary-table">
          <thead><tr><th>Category</th><th class="amount">Amount</th></tr></thead>
          <tbody>
            ${expenseRows}
            <tr class="total-row"><td>Total operating expenses</td><td class="amount">${escapeHtml(formatCurrency(expenseTotal))}</td></tr>
          </tbody>
        </table>
        ${
          expenseAccountRows
            ? `<h3 class="subheading">Chart of accounts classification</h3>
               <table class="data-table summary-table"><tbody>${expenseAccountRows}</tbody></table>`
            : ""
        }
      </section>

      <section class="section">
        <h2>Declaration</h2>
        <p class="section-note">
          This report is generated from InvoraLite retail accounting records including sales, purchases,
          inventory COGS, office expenses, depreciation, and GST estimates. It is intended to support
          preparation of tax returns and should be reviewed by the business owner or accountant before
          official submission to the Revenue &amp; Customs or other tax authorities.
        </p>
        <div class="signature-grid">
          <div>
            <div class="signature-line">Prepared by (${escapeHtml(generatedBy)})</div>
          </div>
          <div>
            <div class="signature-line">Authorized signatory / Business owner</div>
          </div>
        </div>
      </section>

      <div class="footer">
        InvoraLite Tax &amp; Financial Submission Report · ${escapeHtml(business.businessName)} · Period ${escapeHtml(periodKey)}
      </div>
    </div>`;
}

export function buildTaxSubmissionReportHtml(data: TaxSubmissionReportData): string {
  const { periodKey } = data;
  return `<!DOCTYPE html><html><head><title>Tax Report ${escapeHtml(periodKey)}</title>
    <style>${REPORT_PRINT_STYLES}</style></head><body>
    ${buildTaxSubmissionReportPageContent(data)}
    </body></html>`;
}

export function printTaxSubmissionReport(data: TaxSubmissionReportData): void {
  printHtmlDocument(buildTaxSubmissionReportHtml(data));
}
