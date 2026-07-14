import { describe, expect, it } from "vitest";
import type { Business, Sale } from "../types";
import {
  aggregateProfitAndLoss,
  buildAnnualProfitAndLoss,
  buildProfitAndLoss,
  currentFiscalYear,
  FISCAL_YEAR_PRESETS,
  fiscalYearBounds,
  fiscalYearExportPeriodKeys,
  fiscalYearPeriodKeys,
  fiscalYearPeriodKeysTillDate,
  fiscalStartMonthInputValue,
  monthFromMonthInputValue,
  normalizeFiscalYearStartMonth,
} from "./accounting";

function business(overrides: Partial<Business> = {}): Business {
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
    ...overrides,
  };
}

describe("FISCAL_YEAR_PRESETS", () => {
  it("includes common Jul-Jun and calendar year presets", () => {
    expect(FISCAL_YEAR_PRESETS.map((preset) => preset.startMonth)).toEqual([1, 7, 4, 10]);
    expect(FISCAL_YEAR_PRESETS.find((preset) => preset.id === "jul-jun")?.label).toBe("Jul – Jun");
  });
});

describe("normalizeFiscalYearStartMonth", () => {
  it("defaults to January", () => {
    expect(normalizeFiscalYearStartMonth()).toBe(1);
    expect(normalizeFiscalYearStartMonth(undefined)).toBe(1);
  });

  it("clamps to valid month range", () => {
    expect(normalizeFiscalYearStartMonth(0)).toBe(1);
    expect(normalizeFiscalYearStartMonth(13)).toBe(12);
    expect(normalizeFiscalYearStartMonth(7)).toBe(7);
  });
});

describe("fiscalYearExportPeriodKeys", () => {
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

  it("excludes pre-operational months without sales", () => {
    const keys = fiscalYearExportPeriodKeys(
      7,
      2025,
      [sale("2025-09-10")],
      new Date("2026-01-15"),
    );
    expect(keys).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
  });

  it("returns empty when no sales exist in the fiscal year", () => {
    const keys = fiscalYearExportPeriodKeys(7, 2025, [], new Date("2026-01-15"));
    expect(keys).toEqual([]);
  });

  it("starts at the first month with sales when fiscal year begins with activity", () => {
    const keys = fiscalYearExportPeriodKeys(
      7,
      2025,
      [sale("2025-07-02")],
      new Date("2025-09-15"),
    );
    expect(keys).toEqual(["2025-07", "2025-08", "2025-09"]);
  });
});

describe("fiscalStartMonthInputValue", () => {
  it("formats month for type=month inputs", () => {
    expect(fiscalStartMonthInputValue(7, 2026)).toBe("2026-07");
    expect(monthFromMonthInputValue("2026-07")).toBe(7);
  });

  it("normalizes invalid month input", () => {
    expect(monthFromMonthInputValue("2026-00")).toBe(1);
  });
});

describe("fiscalYearPeriodKeysTillDate", () => {
  it("includes months through the current month", () => {
    const keys = fiscalYearPeriodKeysTillDate(1, 2025, new Date("2025-06-15"));
    expect(keys).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
    ]);
  });

  it("includes the full fiscal year when it has ended", () => {
    const keys = fiscalYearPeriodKeysTillDate(7, 2024, new Date("2026-01-01"));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2024-07");
    expect(keys[11]).toBe("2025-06");
  });
});

describe("fiscalYearPeriodKeys", () => {
  it("returns calendar year months for January start", () => {
    expect(fiscalYearPeriodKeys(1, 2025)).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
    ]);
  });

  it("returns Jul–Jun span for July start", () => {
    expect(fiscalYearPeriodKeys(7, 2025)).toEqual([
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });
});

describe("fiscalYearBounds", () => {
  it("labels Jul–Jun fiscal years", () => {
    const bounds = fiscalYearBounds(7, 2025);
    expect(bounds.label).toBe("July 2025 – June 2026");
    expect(bounds.from).toBe("2025-07-01");
    expect(bounds.to).toBe("2026-06-30");
  });
});

describe("currentFiscalYear", () => {
  it("uses calendar year for January start", () => {
    expect(currentFiscalYear(1, new Date("2025-08-15"))).toBe(2025);
  });

  it("uses prior year before fiscal start month", () => {
    expect(currentFiscalYear(7, new Date("2026-03-01"))).toBe(2025);
    expect(currentFiscalYear(7, new Date("2026-08-01"))).toBe(2026);
  });
});

describe("buildAnnualProfitAndLoss", () => {
  it("aggregates monthly figures and excludes GST from annual totals", () => {
    const biz = business({ fiscalYearStartMonth: 1 });
    const annual = buildAnnualProfitAndLoss({
      fiscalYear: 2025,
      sales: [],
      products: [],
      expenses: [],
      assets: [],
      purchases: [],
      business: biz,
    });

    expect(annual.monthlyBreakdown).toHaveLength(12);
    expect(annual.gstOutput).toBe(0);
    expect(annual.gstInput).toBe(0);
    expect(annual.netGst).toBe(0);
    expect(annual.fiscalYearLabel).toBe("Calendar year 2025");
  });

  it("sums monthly P&L into annual totals", () => {
    const biz = business({ fiscalYearStartMonth: 1, hasGst: false });
    const params = {
      sales: [],
      products: [],
      expenses: [],
      assets: [],
      purchases: [],
      business: biz,
    };
    const monthly = fiscalYearPeriodKeys(1, 2025).map((periodKey) =>
      buildProfitAndLoss({ ...params, periodKey }),
    );
    const aggregated = aggregateProfitAndLoss(monthly, {
      periodKey: "FY-2025",
      from: "2025-01-01",
      to: "2025-12-31",
    });
    const annual = buildAnnualProfitAndLoss({ fiscalYear: 2025, ...params });

    expect(annual.netRevenue).toBe(aggregated.netRevenue);
    expect(annual.netProfit).toBe(aggregated.netProfit);
  });
});
