import type { AnnualProfitAndLossReport } from "./accounting";
import { CHART_OF_ACCOUNTS } from "./accounting";
import { formatContactPhone, formatCurrency, formatDateGB } from "./constants";
import { printHtmlDocument, REPORT_PRINT_STYLES } from "./reportPrint";
import {
  buildTaxSubmissionReportPageContent,
  type TaxSubmissionReportData,
} from "./taxSubmissionReport";
import type { Business } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface AnnualIncomeTaxReportData {
  business: Business;
  report: AnnualProfitAndLossReport;
  generatedBy: string;
  generatedAt: string;
  monthlySupportingReports?: TaxSubmissionReportData[];
  /** Set when pre-operational months are excluded from export attachments. */
  exportNote?: string;
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
    business.licenseNo.trim() ? `Business Licence No: ${business.licenseNo.trim()}` : "",
  ].filter(Boolean);

  return `<div class="business-block">
    <p class="business-name">${escapeHtml(business.businessName)}</p>
    ${lines.map((line) => `<p class="business-line">${escapeHtml(line)}</p>`).join("")}
    ${taxLines.map((line) => `<p class="business-tax">${escapeHtml(line)}</p>`).join("")}
  </div>`;
}

export function buildAnnualIncomeTaxReportPageContent(data: AnnualIncomeTaxReportData): string {
  const { business, report, generatedBy, generatedAt, exportNote } = data;
  const pl = report;

  const plRevenueRows = [
    row("Gross Sales Revenue", pl.revenue, {
      note: "Exclusive of GST — GST is remitted monthly",
    }),
    ...(pl.salesDiscounts > 0 ? [row("Less: Sales Discounts", -pl.salesDiscounts, { indent: true })] : []),
    row("Net Revenue", pl.netRevenue, { bold: true }),
  ].join("");

  const plCostsRows = [
    row("Cost of Goods Sold (COGS)", pl.cogs, { debit: true }),
    row("Gross Profit", pl.grossProfit, { bold: true }),
    row("Operating Expenses", pl.operatingExpenses, { debit: true }),
    ...(pl.depreciation > 0 ? [row("Depreciation", pl.depreciation, { debit: true })] : []),
    row("Net Profit (Taxable Income Basis)", pl.netProfit, { bold: true }),
  ].join("");

  const monthlyRows =
    report.monthlyBreakdown.length === 0
      ? '<tr><td colspan="7" class="empty">No monthly data in this fiscal year.</td></tr>'
      : report.monthlyBreakdown
          .map(
            (month) => `<tr>
              <td>${escapeHtml(month.periodKey)}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.netRevenue))}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.cogs))}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.grossProfit))}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.operatingExpenses))}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.depreciation))}</td>
              <td class="amount">${escapeHtml(formatCurrency(month.netProfit))}</td>
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

  return `<div class="page">
      <div class="report-header">
        ${businessHeader(business)}
        <div class="report-meta">
          <p class="report-title">Annual Income Tax Report</p>
          <p class="report-subtitle">Consolidated P&amp;L for fiscal year income tax compliance</p>
          <p class="meta-line"><strong>Fiscal year:</strong> ${escapeHtml(report.fiscalYearLabel)}</p>
          <p class="meta-line"><strong>From:</strong> ${escapeHtml(formatDateGB(report.from))}</p>
          <p class="meta-line"><strong>To:</strong> ${escapeHtml(formatDateGB(report.to))}</p>
          <p class="meta-line"><strong>Generated:</strong> ${escapeHtml(formatDateGB(generatedAt.slice(0, 10)))}</p>
          <p class="meta-line"><strong>Prepared by:</strong> ${escapeHtml(generatedBy)}</p>
        </div>
      </div>

      <div class="notice-banner">
        <strong>GST excluded.</strong> All revenue and expense figures in this report exclude GST.
        GST is accounted for and remitted on a monthly basis via the monthly tax reports.
      </div>
      ${
        exportNote
          ? `<div class="notice-banner">${escapeHtml(exportNote)}</div>`
          : ""
      }

      <section class="section">
        <h2>Executive Summary</h2>
        <div class="kpi-grid">
          <div class="kpi"><p class="kpi-label">Net Revenue</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.netRevenue))}</p></div>
          <div class="kpi"><p class="kpi-label">Gross Profit</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.grossProfit))}</p></div>
          <div class="kpi"><p class="kpi-label">Operating Expenses</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.operatingExpenses))}</p></div>
          <div class="kpi"><p class="kpi-label">Net Profit</p><p class="kpi-value">${escapeHtml(formatCurrency(pl.netProfit))}</p></div>
        </div>
      </section>

      <section class="section">
        <h2>Annual Profit &amp; Loss Statement</h2>
        <p class="section-note">Aggregated from monthly accounting periods within the fiscal year.</p>
        <h3 class="subheading">Revenue Breakdown</h3>
        <table class="data-table summary-table">
          <tbody>${plRevenueRows}</tbody>
        </table>
        <h3 class="subheading">Costs &amp; Profitability</h3>
        <table class="data-table summary-table">
          <tbody>${plCostsRows}</tbody>
        </table>
        ${
          expenseAccountRows
            ? `<h3 class="subheading">Operating expenses by account</h3>
               <table class="data-table summary-table"><tbody>${expenseAccountRows}</tbody></table>`
            : ""
        }
      </section>

      <section class="section">
        <h2>Monthly Breakdown</h2>
        <table class="data-table detail-table">
          <thead>
            <tr>
              <th>Period</th>
              <th class="amount">Net Revenue</th>
              <th class="amount">COGS</th>
              <th class="amount">Gross Profit</th>
              <th class="amount">Op. Expenses</th>
              <th class="amount">Depreciation</th>
              <th class="amount">Net Profit</th>
            </tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </section>

      <section class="section">
        <h2>Declaration</h2>
        <p class="section-note">
          This annual report consolidates monthly retail accounting records for income tax preparation.
          GST is excluded from all figures. Review with your accountant before filing with tax authorities.
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
        InvoraLite Annual Income Tax Report · ${escapeHtml(business.businessName)} · ${escapeHtml(report.fiscalYearLabel)}
      </div>
    </div>`;
}

function buildSupportingDocumentsIndex(
  data: AnnualIncomeTaxReportData,
  monthlyReports: TaxSubmissionReportData[],
): string {
  if (monthlyReports.length === 0) return "";

  const firstPeriod = monthlyReports[0]?.periodKey ?? "";
  const lastPeriod = monthlyReports[monthlyReports.length - 1]?.periodKey ?? "";
  const periodRange =
    firstPeriod === lastPeriod ? firstPeriod : `${firstPeriod} through ${lastPeriod}`;

  const listItems = monthlyReports
    .map((report) => `<li>${escapeHtml(report.periodKey)} — ${escapeHtml(formatDateGB(report.from))} to ${escapeHtml(formatDateGB(report.to))}</li>`)
    .join("");

  return `<div class="document-page">
    <div class="page">
      <div class="report-header">
        ${businessHeader(data.business)}
        <div class="report-meta">
          <p class="report-title">Supporting Documents</p>
          <p class="report-subtitle">Monthly tax &amp; financial submission reports</p>
          <p class="meta-line"><strong>Annual report:</strong> ${escapeHtml(data.report.fiscalYearLabel)}</p>
          <p class="meta-line"><strong>Reference periods:</strong> ${escapeHtml(periodRange)}</p>
        </div>
      </div>
      <section class="section">
        <h2>Monthly Reports Included</h2>
        <p class="section-note">
          The following monthly reports are attached as supporting reference for this annual income tax filing.
          Periods run from the first month with recorded sales through the latest completed month in the fiscal year.
        </p>
        <ul class="supporting-index-list">${listItems}</ul>
      </section>
    </div>
  </div>`;
}

export function buildAnnualIncomeTaxReportHtml(data: AnnualIncomeTaxReportData): string {
  const monthlyReports = data.monthlySupportingReports ?? [];
  const annualLabel = data.report.fiscalYearLabel;

  const supportingPages = monthlyReports
    .map(
      (monthly) =>
        `<div class="document-page">${buildTaxSubmissionReportPageContent(monthly, {
          supportingDocument: true,
          annualLabel,
        })}</div>`,
    )
    .join("");

  const supportingIndex = buildSupportingDocumentsIndex(data, monthlyReports);

  return `<!DOCTYPE html><html><head><title>Annual Income Tax Report ${escapeHtml(annualLabel)}</title>
    <style>${REPORT_PRINT_STYLES}</style></head><body>
    <div class="document-page">${buildAnnualIncomeTaxReportPageContent(data)}</div>
    ${supportingIndex}
    ${supportingPages}
    </body></html>`;
}

export function printAnnualIncomeTaxReport(data: AnnualIncomeTaxReportData): void {
  printHtmlDocument(buildAnnualIncomeTaxReportHtml(data));
}
