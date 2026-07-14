import { describe, expect, it } from "vitest";
import type { Business, Sale } from "../types";
import type { AnnualProfitAndLossReport } from "./accounting";
import { annualReportToCsv, buildAnnualIncomeTaxReportPackage } from "./annualReportExport";

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

function sale(saleDate: string): Sale {
  return {
    id: "S-1",
    saleDate,
    customerName: "Customer",
    items: [],
    productId: "P-1",
    productName: "Widget",
    quantity: 1,
    unitPrice: 100,
    total: 100,
    status: "completed",
    paymentMode: "Cash",
  };
}

function annualReport(): AnnualProfitAndLossReport {
  return {
    periodKey: "FY-2025",
    from: "2025-07-01",
    to: "2026-06-30",
    revenue: 50000,
    salesDiscounts: 0,
    salesRevenueWithGst: 0,
    salesRevenueWithoutGst: 0,
    netRevenue: 50000,
    cogs: 20000,
    grossProfit: 30000,
    grossMarginPercent: 60,
    operatingExpenses: 8000,
    expenseByAccount: { "5300": 8000 },
    depreciation: 1000,
    gstOutput: 0,
    gstInput: 0,
    netGst: 0,
    netProfit: 21000,
    netMarginPercent: 42,
    fiscalYear: 2025,
    fiscalYearStartMonth: 7,
    fiscalYearLabel: "July 2025 – June 2026",
    monthlyBreakdown: [
      {
        periodKey: "2025-07",
        netRevenue: 50000,
        cogs: 20000,
        grossProfit: 30000,
        operatingExpenses: 8000,
        depreciation: 1000,
        netProfit: 21000,
      },
    ],
  };
}

describe("annualReportToCsv", () => {
  it("includes summary and monthly breakdown rows", () => {
    const csv = annualReportToCsv(business(), annualReport(), "Admin", "2026-06-15T10:00:00.000Z");

    expect(csv).toContain("Business,Fiscal Year,From,To,Generated,Prepared By");
    expect(csv).toContain("Test Shop");
    expect(csv).toContain("July 2025 – June 2026");
    expect(csv).toContain("Net Revenue,50000");
    expect(csv).toContain("2025-07,50000");
    expect(csv).toContain("All amounts exclude GST");
  });
});

describe("buildAnnualIncomeTaxReportPackage", () => {
  it("omits monthly attachments when no sales exist in the fiscal year", () => {
    const pkg = buildAnnualIncomeTaxReportPackage({
      business: business(),
      fiscalYear: 2025,
      annualPl: annualReport(),
      sales: [],
      products: [],
      expenses: [],
      assets: [],
      purchases: [],
      closes: [],
      generatedBy: "Admin",
      generatedAt: "2026-01-15T10:00:00.000Z",
    });

    expect(pkg.monthlySupportingReports).toEqual([]);
    expect(pkg.report.monthlyBreakdown).toEqual([]);
    expect(pkg.exportNote).toContain("No sales were recorded");
  });

  it("starts attachments from the first month with sales", () => {
    const pkg = buildAnnualIncomeTaxReportPackage({
      business: business(),
      fiscalYear: 2025,
      annualPl: annualReport(),
      sales: [sale("2025-09-12")],
      products: [],
      expenses: [],
      assets: [],
      purchases: [],
      closes: [],
      generatedBy: "Admin",
      generatedAt: "2026-01-15T10:00:00.000Z",
    });

    expect(pkg.monthlySupportingReports?.map((report) => report.periodKey)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(pkg.report.monthlyBreakdown.map((month) => month.periodKey)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(pkg.exportNote).toContain("2025-09");
    expect(pkg.exportNote).toContain("2025-07");
    expect(pkg.exportNote).toContain("2025-08");
  });
});
