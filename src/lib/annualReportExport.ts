import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  Business,
  MonthlyClose,
  OfficeAsset,
  OfficeExpense,
  Product,
  Purchase,
  Sale,
} from "../types";
import type { AnnualProfitAndLossReport } from "./accounting";
import {
  aggregateProfitAndLoss,
  buildProfitAndLoss,
  fiscalYearExportPeriodKeys,
  fiscalYearPeriodKeysTillDate,
  normalizeFiscalYearStartMonth,
  periodBounds,
} from "./accounting";
import {
  buildAnnualIncomeTaxReportHtml,
  type AnnualIncomeTaxReportData,
} from "./annualIncomeTaxReport";
import { formatCurrency, formatDateGB } from "./constants";
import { isTauri } from "./storage";
import { buildTaxSubmissionReportData } from "./taxSubmissionReport";

function escapeCsv(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function annualReportToCsv(
  business: Business,
  report: AnnualProfitAndLossReport,
  generatedBy: string,
  generatedAt: string,
): string {
  const lines: string[] = [
    [
      "Business",
      "Fiscal Year",
      "From",
      "To",
      "Generated",
      "Prepared By",
    ].join(","),
    [
      business.businessName,
      report.fiscalYearLabel,
      report.from,
      report.to,
      generatedAt.slice(0, 10),
      generatedBy,
    ]
      .map(escapeCsv)
      .join(","),
    "",
    ["Metric", "Amount"].join(","),
    ["Gross Sales Revenue", report.revenue].map(escapeCsv).join(","),
    ...(report.salesDiscounts > 0
      ? [["Less: Sales Discounts", -report.salesDiscounts].map(escapeCsv).join(",")]
      : []),
    ["Net Revenue", report.netRevenue].map(escapeCsv).join(","),
    ["Cost of Goods Sold", report.cogs].map(escapeCsv).join(","),
    ["Gross Profit", report.grossProfit].map(escapeCsv).join(","),
    ["Operating Expenses", report.operatingExpenses].map(escapeCsv).join(","),
    ...(report.depreciation > 0
      ? [["Depreciation", report.depreciation].map(escapeCsv).join(",")]
      : []),
    ["Net Profit", report.netProfit].map(escapeCsv).join(","),
    "",
    [
      "Period",
      "Net Revenue",
      "COGS",
      "Gross Profit",
      "Operating Expenses",
      "Depreciation",
      "Net Profit",
    ].join(","),
    ...report.monthlyBreakdown.map((month) =>
      [
        month.periodKey,
        month.netRevenue,
        month.cogs,
        month.grossProfit,
        month.operatingExpenses,
        month.depreciation,
        month.netProfit,
      ]
        .map(escapeCsv)
        .join(","),
    ),
    "",
    "Note: All amounts exclude GST. GST is remitted via monthly tax reports.",
  ];

  return lines.join("\r\n");
}

export function buildAnnualIncomeTaxReportPackage(params: {
  business: Business;
  fiscalYear: number;
  annualPl: AnnualProfitAndLossReport;
  sales: Sale[];
  products: Product[];
  expenses: OfficeExpense[];
  assets: OfficeAsset[];
  purchases: Purchase[];
  closes: MonthlyClose[];
  generatedBy: string;
  generatedAt?: string;
  asOf?: Date;
}): AnnualIncomeTaxReportData {
  const fiscalStartMonth = normalizeFiscalYearStartMonth(params.business.fiscalYearStartMonth);
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const asOf = params.asOf ?? new Date(generatedAt);
  const exportPeriodKeys = fiscalYearExportPeriodKeys(
    fiscalStartMonth,
    params.fiscalYear,
    params.sales,
    asOf,
  );

  const buildParams = {
    sales: params.sales,
    products: params.products,
    expenses: params.expenses,
    assets: params.assets,
    purchases: params.purchases,
    business: params.business,
  };

  const monthlySupportingReports = exportPeriodKeys.map((targetPeriodKey) => {
    const reportPl = buildProfitAndLoss({
      ...buildParams,
      periodKey: targetPeriodKey,
    });
    const closeForPeriod = params.closes.find((entry) => entry.periodKey === targetPeriodKey) ?? null;
    return buildTaxSubmissionReportData({
      business: params.business,
      periodKey: targetPeriodKey,
      pl: reportPl,
      sales: params.sales,
      purchases: params.purchases,
      expenses: params.expenses,
      close: closeForPeriod,
      generatedBy: params.generatedBy,
    });
  });

  const exportReport = buildAnnualReportForExport(params.annualPl, exportPeriodKeys, buildParams);
  const exportNote = buildAnnualExportNote(
    fiscalStartMonth,
    params.fiscalYear,
    exportPeriodKeys,
    asOf,
  );

  return {
    business: params.business,
    report: exportReport,
    generatedBy: params.generatedBy,
    generatedAt,
    monthlySupportingReports,
    exportNote,
  };
}

function buildAnnualReportForExport(
  annualPl: AnnualProfitAndLossReport,
  exportPeriodKeys: string[],
  buildParams: {
    sales: Sale[];
    products: Product[];
    expenses: OfficeExpense[];
    assets: OfficeAsset[];
    purchases: Purchase[];
    business: Business;
  },
): AnnualProfitAndLossReport {
  if (exportPeriodKeys.length === 0) {
    return {
      ...annualPl,
      monthlyBreakdown: [],
      revenue: 0,
      salesDiscounts: 0,
      salesRevenueWithGst: 0,
      salesRevenueWithoutGst: 0,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      operatingExpenses: 0,
      expenseByAccount: {},
      depreciation: 0,
      gstOutput: 0,
      gstInput: 0,
      netGst: 0,
      netProfit: 0,
      netMarginPercent: 0,
    };
  }

  const monthlyReports = exportPeriodKeys.map((periodKey) =>
    buildProfitAndLoss({ ...buildParams, periodKey }),
  );
  const aggregated = aggregateProfitAndLoss(monthlyReports, {
    periodKey: annualPl.periodKey,
    from: periodBounds(exportPeriodKeys[0]).from,
    to: periodBounds(exportPeriodKeys[exportPeriodKeys.length - 1]).to,
  });

  return {
    ...aggregated,
    fiscalYear: annualPl.fiscalYear,
    fiscalYearStartMonth: annualPl.fiscalYearStartMonth,
    fiscalYearLabel: annualPl.fiscalYearLabel,
    monthlyBreakdown: monthlyReports.map((report) => ({
      periodKey: report.periodKey,
      netRevenue: report.netRevenue,
      cogs: report.cogs,
      grossProfit: report.grossProfit,
      operatingExpenses: report.operatingExpenses,
      depreciation: report.depreciation,
      netProfit: report.netProfit,
    })),
  };
}

function buildAnnualExportNote(
  startMonth: number,
  fiscalYear: number,
  exportPeriodKeys: string[],
  asOf: Date,
): string | undefined {
  if (exportPeriodKeys.length === 0) {
    return "No sales were recorded in this fiscal year through the export date, so monthly attachments were omitted.";
  }

  const tillDateKeys = fiscalYearPeriodKeysTillDate(startMonth, fiscalYear, asOf);
  const firstExport = exportPeriodKeys[0];
  const startIndex = tillDateKeys.indexOf(firstExport);
  const skipped = startIndex > 0 ? tillDateKeys.slice(0, startIndex) : [];
  if (skipped.length === 0) return undefined;

  return `Reporting starts from ${firstExport} (first month with sales). Pre-operational months without sales (${skipped.join(", ")}) are excluded from this export.`;
}

function annualExportFileStem(report: AnnualProfitAndLossReport): string {
  const safeLabel = report.fiscalYearLabel.replace(/[^\w-]+/g, "_");
  return `invora_annual_report_${safeLabel}_${new Date().toISOString().slice(0, 10)}`;
}

export async function exportAnnualReportCsv(
  business: Business,
  report: AnnualProfitAndLossReport,
  generatedBy: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isTauri()) {
    return { success: false, error: "CSV export is only available in the desktop app." };
  }

  const destination = await save({
    defaultPath: `${annualExportFileStem(report)}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!destination) {
    return { success: false, error: "Export cancelled." };
  }

  try {
    const generatedAt = new Date().toISOString();
    const contents = annualReportToCsv(business, report, generatedBy, generatedAt);
    await invoke("write_text_file", { path: destination, contents });
    return { success: true, path: destination };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not export annual report CSV.",
    };
  }
}

export async function exportAnnualReportPdf(
  data: AnnualIncomeTaxReportData,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isTauri()) {
    return { success: false, error: "PDF export is only available in the desktop app." };
  }

  const destination = await save({
    defaultPath: `${annualExportFileStem(data.report)}.html`,
    filters: [{ name: "HTML (open & Print to PDF)", extensions: ["html"] }],
  });
  if (!destination) {
    return { success: false, error: "Export cancelled." };
  }

  try {
    const contents = buildAnnualIncomeTaxReportHtml(data);
    await invoke("write_text_file", { path: destination, contents });
    return { success: true, path: destination };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not export annual report.",
    };
  }
}

/** Human-readable export summary for UI messages. */
export function describeAnnualExport(report: AnnualProfitAndLossReport): string {
  return `${report.fiscalYearLabel} (${formatDateGB(report.from)} – ${formatDateGB(report.to)}) · ${formatCurrency(report.netProfit)} net profit`;
}
