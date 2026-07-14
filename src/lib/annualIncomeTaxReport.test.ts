import { describe, expect, it, vi } from "vitest";
import type { Business } from "../types";
import {
  buildAnnualIncomeTaxReportPageContent,
  buildAnnualIncomeTaxReportHtml,
  printAnnualIncomeTaxReport,
} from "./annualIncomeTaxReport";
import type { AnnualProfitAndLossReport } from "./accounting";
import * as reportPrint from "./reportPrint";
import { buildTaxSubmissionReportData } from "./taxSubmissionReport";

function business(): Business {
  return {
    businessName: "Test Shop",
    licenseNo: "LIC-1",
    tpnNo: "TPN-1",
    address: "Thimphu",
    phoneCountryCode: "+975",
    phone: "17123456",
    hasGst: true,
    gstRegistrationNo: "GST-1",
    email: "shop@example.com",
    password: "hash",
    username: "owner",
    fiscalYearStartMonth: 7,
  };
}

function annualReport(overrides: Partial<AnnualProfitAndLossReport> = {}): AnnualProfitAndLossReport {
  return {
    periodKey: "FY-2025",
    from: "2025-07-01",
    to: "2026-06-30",
    revenue: 100000,
    salesDiscounts: 0,
    salesRevenueWithGst: 0,
    salesRevenueWithoutGst: 0,
    netRevenue: 100000,
    cogs: 40000,
    grossProfit: 60000,
    grossMarginPercent: 60,
    operatingExpenses: 15000,
    expenseByAccount: { "5300": 15000 },
    depreciation: 2000,
    gstOutput: 0,
    gstInput: 0,
    netGst: 0,
    netProfit: 43000,
    netMarginPercent: 43,
    fiscalYear: 2025,
    fiscalYearStartMonth: 7,
    fiscalYearLabel: "July 2025 – June 2026",
    monthlyBreakdown: [
      {
        periodKey: "2025-07",
        netRevenue: 10000,
        cogs: 4000,
        grossProfit: 6000,
        operatingExpenses: 1500,
        depreciation: 200,
        netProfit: 4300,
      },
    ],
    ...overrides,
  };
}

describe("buildAnnualIncomeTaxReportPageContent", () => {
  it("includes fiscal year label and GST exclusion notice", () => {
    const html = buildAnnualIncomeTaxReportPageContent({
      business: business(),
      report: annualReport(),
      generatedBy: "Admin",
      generatedAt: "2026-06-15T10:00:00.000Z",
    });

    expect(html).toContain("Annual Income Tax Report");
    expect(html).toContain("July 2025 – June 2026");
    expect(html).toContain("GST excluded");
    expect(html).toContain("Test Shop");
    expect(html).toContain("2025-07");
  });
});

describe("buildAnnualIncomeTaxReportHtml", () => {
  it("wraps annual content in a printable HTML document", () => {
    const html = buildAnnualIncomeTaxReportHtml({
      business: business(),
      report: annualReport(),
      generatedBy: "Admin",
      generatedAt: "2026-06-15T10:00:00.000Z",
      monthlySupportingReports: [],
    });

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<style>");
    expect(html).toContain("Annual Income Tax Report");
  });

  it("includes supporting monthly report pages when provided", () => {
    const monthlyReport = buildTaxSubmissionReportData({
      business: business(),
      periodKey: "2025-07",
      pl: annualReport(),
      sales: [],
      purchases: [],
      expenses: [],
      close: null,
      generatedBy: "Admin",
    });

    const html = buildAnnualIncomeTaxReportHtml({
      business: business(),
      report: annualReport(),
      generatedBy: "Admin",
      generatedAt: "2026-06-15T10:00:00.000Z",
      monthlySupportingReports: [monthlyReport],
    });

    expect(html).toContain("Supporting Documents");
    expect(html).toContain("2025-07");
  });
});

describe("printAnnualIncomeTaxReport", () => {
  it("delegates to printHtmlDocument", () => {
    const printSpy = vi.spyOn(reportPrint, "printHtmlDocument").mockImplementation(() => {});

    printAnnualIncomeTaxReport({
      business: business(),
      report: annualReport(),
      generatedBy: "Admin",
      generatedAt: "2026-06-15T10:00:00.000Z",
    });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(printSpy.mock.calls[0]?.[0]).toContain("Annual Income Tax Report");
    printSpy.mockRestore();
  });
});
