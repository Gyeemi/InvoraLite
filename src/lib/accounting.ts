import type {
  Business,
  ChartAccount,
  JournalEntry,
  JournalLine,
  MonthlyClose,
  OfficeAsset,
  OfficeExpense,
  Product,
  Purchase,
  Sale,
} from "../types";
import {
  DEFAULT_GST_RATE_PERCENT,
  saleAmountsFromGstLines,
} from "./gst";
import { saleLineCogs } from "./inventoryUom";
import { isDateInRange, monthRange } from "./officeExpenses";

export const CHART_OF_ACCOUNTS: ChartAccount[] = [
  { code: "1000", name: "Cash & Bank", type: "asset", category: "Current Assets" },
  { code: "1100", name: "Inventory", type: "asset", category: "Current Assets" },
  { code: "1200", name: "Fixed Assets", type: "asset", category: "Non-Current Assets" },
  { code: "1210", name: "Accumulated Depreciation", type: "asset", category: "Non-Current Assets" },
  { code: "1300", name: "GST Input Recoverable", type: "asset", category: "Tax" },
  { code: "2000", name: "Accounts Payable", type: "liability", category: "Current Liabilities" },
  { code: "2100", name: "GST Output Payable", type: "liability", category: "Tax" },
  { code: "3000", name: "Owner's Equity", type: "equity", category: "Equity" },
  { code: "3100", name: "Retained Earnings", type: "equity", category: "Equity" },
  { code: "4000", name: "Sales Revenue", type: "revenue", category: "Revenue" },
  { code: "4100", name: "Sales Discounts", type: "revenue", category: "Contra Revenue" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", category: "COGS" },
  { code: "5100", name: "Utility Expenses", type: "expense", category: "Operating" },
  { code: "5200", name: "Payroll Expenses", type: "expense", category: "Operating" },
  { code: "5300", name: "Operating Expenses", type: "expense", category: "Operating" },
  { code: "5400", name: "Marketing Expenses", type: "expense", category: "Operating" },
  { code: "5500", name: "Software & Subscriptions", type: "expense", category: "Operating" },
  { code: "5600", name: "Maintenance & Repairs", type: "expense", category: "Operating" },
  { code: "5700", name: "Travel & Accommodation", type: "expense", category: "Operating" },
  { code: "5800", name: "Professional Fees", type: "expense", category: "Operating" },
  { code: "5900", name: "Miscellaneous Expenses", type: "expense", category: "Operating" },
  { code: "6000", name: "Depreciation Expense", type: "expense", category: "Non-Cash" },
];

const EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  "Utility Bills": "5100",
  "Staff & Payroll": "5200",
  "Operating Expenses": "5300",
  "Marketing & Promotion": "5400",
  "Software & Subscriptions": "5500",
  "Maintenance & Repairs": "5600",
  "Travel & Accommodation": "5700",
  "Professional Fees": "5800",
  "Miscellaneous Expenses": "5900",
};

const ASSET_USEFUL_LIFE_YEARS: Record<string, number> = {
  "Computer / Laptop": 3,
  Furniture: 5,
  Vehicle: 5,
  Equipment: 5,
  "Other Asset": 5,
};

export interface ProfitAndLossReport {
  periodKey: string;
  from: string;
  to: string;
  revenue: number;
  salesDiscounts: number;
  /** Net selling on lines where GST was charged (after discounts). */
  salesRevenueWithGst: number;
  /** Net selling on GST-exempt / zero-rate lines (after discounts). */
  salesRevenueWithoutGst: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  expenseByAccount: Record<string, number>;
  depreciation: number;
  gstOutput: number;
  gstInput: number;
  netGst: number;
  netProfit: number;
  netMarginPercent: number;
}

export const FISCAL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface FiscalYearPreset {
  id: string;
  label: string;
  startMonth: number;
}

/** Common fiscal-year configurations for quick selection in reports and settings. */
export const FISCAL_YEAR_PRESETS: FiscalYearPreset[] = [
  { id: "jan-dec", label: "Jan – Dec", startMonth: 1 },
  { id: "jul-jun", label: "Jul – Jun", startMonth: 7 },
  { id: "apr-mar", label: "Apr – Mar", startMonth: 4 },
  { id: "oct-sep", label: "Oct – Sep", startMonth: 10 },
];

export function normalizeFiscalYearStartMonth(value?: number | null): number {
  if (value == null || Number.isNaN(value)) return 1;
  return Math.min(12, Math.max(1, Math.round(value)));
}

/** `type="month"` value for picking a fiscal start month (year portion is display-only). */
export function fiscalStartMonthInputValue(
  month: number,
  referenceYear = new Date().getFullYear(),
): string {
  const normalized = normalizeFiscalYearStartMonth(month);
  return `${referenceYear}-${String(normalized).padStart(2, "0")}`;
}

export function monthFromMonthInputValue(value: string): number {
  const monthPart = value.split("-")[1];
  return normalizeFiscalYearStartMonth(Number.parseInt(monthPart ?? "1", 10));
}

export function fiscalYearPeriodKeys(startMonth: number, fiscalYear: number): string[] {
  const start = normalizeFiscalYearStartMonth(startMonth);
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = start - 1 + i;
    const year = fiscalYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

/** Fiscal year months from the start through the current month (or full year if already ended). */
export function fiscalYearPeriodKeysTillDate(
  startMonth: number,
  fiscalYear: number,
  asOf = new Date(),
): string[] {
  const keys = fiscalYearPeriodKeys(startMonth, fiscalYear);
  const asOfKey = periodKeyFromDate(asOf.toISOString());
  return keys.filter((key) => key <= asOfKey);
}

/** True when at least one non-cancelled sale falls within the accounting period. */
export function periodHasRecordedSales(sales: Sale[], periodKey: string): boolean {
  const { from, to } = periodBounds(periodKey);
  return sales.some(
    (sale) => sale.status !== "cancelled" && isDateInRange(sale.saleDate, from, to),
  );
}

/** First period (in order) with recorded sales, or undefined when none. */
export function firstOperationalPeriodKey(
  periodKeys: string[],
  sales: Sale[],
): string | undefined {
  return periodKeys.find((periodKey) => periodHasRecordedSales(sales, periodKey));
}

/**
 * Export/attachment periods: from the first month with sales through fiscal year-end
 * (capped at today). Pre-operational months with zero sales are excluded.
 */
export function fiscalYearExportPeriodKeys(
  startMonth: number,
  fiscalYear: number,
  sales: Sale[],
  asOf = new Date(),
): string[] {
  const tillDateKeys = fiscalYearPeriodKeysTillDate(startMonth, fiscalYear, asOf);
  const firstOperational = firstOperationalPeriodKey(tillDateKeys, sales);
  if (!firstOperational) return [];

  const startIndex = tillDateKeys.indexOf(firstOperational);
  return startIndex < 0 ? tillDateKeys : tillDateKeys.slice(startIndex);
}

export function fiscalYearBounds(startMonth: number, fiscalYear: number) {
  const normalizedStart = normalizeFiscalYearStartMonth(startMonth);
  const periodKeys = fiscalYearPeriodKeys(normalizedStart, fiscalYear);
  const from = periodBounds(periodKeys[0]).from;
  const to = periodBounds(periodKeys[11]).to;
  const [endYear, endMonth] = periodKeys[11].split("-").map(Number);
  const label =
    normalizedStart === 1
      ? `Calendar year ${fiscalYear}`
      : `${FISCAL_MONTH_NAMES[normalizedStart - 1]} ${fiscalYear} – ${FISCAL_MONTH_NAMES[endMonth - 1]} ${endYear}`;
  return {
    from,
    to,
    periodKeys,
    label,
    fiscalYear,
    startMonth: normalizedStart,
  };
}

export function currentFiscalYear(startMonth: number, date = new Date()): number {
  const start = normalizeFiscalYearStartMonth(startMonth);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (start === 1) return year;
  return month >= start ? year : year - 1;
}

export interface AnnualProfitAndLossReport extends ProfitAndLossReport {
  fiscalYear: number;
  fiscalYearStartMonth: number;
  fiscalYearLabel: string;
  monthlyBreakdown: Array<{
    periodKey: string;
    netRevenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    depreciation: number;
    netProfit: number;
  }>;
}

export function aggregateProfitAndLoss(
  reports: ProfitAndLossReport[],
  meta: { periodKey: string; from: string; to: string },
): ProfitAndLossReport {
  const expenseByAccount: Record<string, number> = {};
  let revenue = 0;
  let salesDiscounts = 0;
  let salesRevenueWithGst = 0;
  let salesRevenueWithoutGst = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let depreciation = 0;

  for (const report of reports) {
    revenue += report.revenue;
    salesDiscounts += report.salesDiscounts;
    salesRevenueWithGst += report.salesRevenueWithGst;
    salesRevenueWithoutGst += report.salesRevenueWithoutGst;
    cogs += report.cogs;
    operatingExpenses += report.operatingExpenses;
    depreciation += report.depreciation;
    for (const [code, amount] of Object.entries(report.expenseByAccount)) {
      expenseByAccount[code] = (expenseByAccount[code] ?? 0) + amount;
    }
  }

  const netRevenue = revenue - salesDiscounts;
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - operatingExpenses - depreciation;

  return {
    periodKey: meta.periodKey,
    from: meta.from,
    to: meta.to,
    revenue,
    salesDiscounts,
    salesRevenueWithGst,
    salesRevenueWithoutGst,
    netRevenue,
    cogs,
    grossProfit,
    grossMarginPercent: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    operatingExpenses,
    expenseByAccount,
    depreciation,
    gstOutput: 0,
    gstInput: 0,
    netGst: 0,
    netProfit,
    netMarginPercent: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0,
  };
}

export function buildAnnualProfitAndLoss(params: {
  fiscalYear: number;
  sales: Sale[];
  products: Product[];
  expenses: OfficeExpense[];
  assets: OfficeAsset[];
  purchases: Purchase[];
  business: Business;
}): AnnualProfitAndLossReport {
  const startMonth = normalizeFiscalYearStartMonth(params.business.fiscalYearStartMonth);
  const bounds = fiscalYearBounds(startMonth, params.fiscalYear);
  const monthlyReports = bounds.periodKeys.map((periodKey) =>
    buildProfitAndLoss({ ...params, periodKey }),
  );
  const aggregated = aggregateProfitAndLoss(monthlyReports, {
    periodKey: `FY-${params.fiscalYear}`,
    from: bounds.from,
    to: bounds.to,
  });

  return {
    ...aggregated,
    fiscalYear: params.fiscalYear,
    fiscalYearStartMonth: startMonth,
    fiscalYearLabel: bounds.label,
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

function accountName(code: string): string {
  return CHART_OF_ACCOUNTS.find((account) => account.code === code)?.name ?? code;
}

function line(accountCode: string, debit: number, credit: number): JournalLine {
  return { accountCode, accountName: accountName(accountCode), debit, credit };
}

export function periodKeyFromDate(date: string): string {
  return date.slice(0, 7);
}

export function periodBounds(periodKey: string): { from: string; to: string } {
  const [year, month] = periodKey.split("-").map(Number);
  return monthRange(year, month - 1);
}

function inPeriod(date: string, from: string, to: string): boolean {
  return isDateInRange(date, from, to);
}

function saleItems(sale: Sale): Sale["items"] {
  if (sale.items.length > 0) return sale.items;
  return [
    {
      productId: sale.productId,
      productName: sale.productName,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      total: sale.total,
    },
  ];
}

export function calculateCogs(
  sales: Sale[],
  products: Product[],
  from: string,
  to: string,
): number {
  const productMap = new Map(products.map((product) => [product.id, product]));
  let cogs = 0;

  for (const sale of sales) {
    if (sale.status === "cancelled" || !inPeriod(sale.saleDate, from, to)) continue;
    for (const item of saleItems(sale)) {
      const product = productMap.get(item.productId);
      cogs += saleLineCogs(item, product);
    }
  }

  return cogs;
}

/** Sale line items in the period where product cost price was missing and COGS was estimated. */
export function countEstimatedCogsSaleLines(
  sales: Sale[],
  products: Product[],
  from: string,
  to: string,
): number {
  const productMap = new Map(products.map((product) => [product.id, product]));
  let count = 0;

  for (const sale of sales) {
    if (sale.status === "cancelled" || !inPeriod(sale.saleDate, from, to)) continue;
    for (const item of saleItems(sale)) {
      const product = productMap.get(item.productId);
      if (product?.costPrice == null && item.costPerBaseAtSale == null) count += 1;
    }
  }

  return count;
}

export function calculateSalesDiscounts(sales: Sale[], from: string, to: string): number {
  return sales
    .filter((sale) => sale.status !== "cancelled" && inPeriod(sale.saleDate, from, to))
    .reduce((sum, sale) => sum + (sale.discountAmount ?? 0), 0);
}

export function calculateRevenue(sales: Sale[], from: string, to: string): number {
  return sales
    .filter((sale) => sale.status !== "cancelled" && inPeriod(sale.saleDate, from, to))
    .reduce((sum, sale) => sum + (sale.subtotal ?? sale.total + (sale.discountAmount ?? 0)), 0);
}

export function calculateRevenueBreakdown(
  sales: Sale[],
  business: Business,
  from: string,
  to: string,
): { salesRevenueWithGst: number; salesRevenueWithoutGst: number } {
  let salesRevenueWithGst = 0;
  let salesRevenueWithoutGst = 0;

  for (const sale of sales) {
    if (sale.status === "cancelled" || !inPeriod(sale.saleDate, from, to)) continue;

    const items = saleItems(sale);
    const subtotal = sale.subtotal ?? items.reduce((sum, item) => sum + item.total, 0);
    const discount = sale.discountAmount ?? 0;

    for (const item of items) {
      const share = subtotal > 0 ? item.total / subtotal : 0;
      const lineNet = item.total - discount * share;
      const rate = business.hasGst ? (item.gstPercent ?? DEFAULT_GST_RATE_PERCENT) : 0;

      if (business.hasGst && rate > 0) {
        salesRevenueWithGst += lineNet;
      } else {
        salesRevenueWithoutGst += lineNet;
      }
    }
  }

  return { salesRevenueWithGst, salesRevenueWithoutGst };
}

export function classifyOperatingExpenses(
  expenses: OfficeExpense[],
  from: string,
  to: string,
): { total: number; byAccount: Record<string, number> } {
  const byAccount: Record<string, number> = {};

  for (const expense of expenses) {
    if (expense.category === "Asset Purchases (Fixed Assets)") continue;
    if (!inPeriod(expense.expenseDate, from, to)) continue;
    const code = EXPENSE_ACCOUNT_BY_CATEGORY[expense.category] ?? "5900";
    byAccount[code] = (byAccount[code] ?? 0) + expense.amount;
  }

  const total = Object.values(byAccount).reduce((sum, value) => sum + value, 0);
  return { total, byAccount };
}

export function calculateDepreciation(assets: OfficeAsset[], periodKey: string): number {
  const { to } = periodBounds(periodKey);
  let total = 0;

  for (const asset of assets) {
    if (asset.purchaseDate > to) continue;
    const years = ASSET_USEFUL_LIFE_YEARS[asset.category] ?? 5;
    const monthly = asset.amount / (years * 12);
    if (monthly <= 0) continue;

    const start = asset.purchaseDate.slice(0, 7);
    if (periodKey < start) continue;

    total += monthly;
  }

  return total;
}

export function calculateGstInput(
  purchases: Purchase[],
  business: Business,
  from: string,
  to: string,
): number {
  if (!business.hasGst) return 0;

  let gst = 0;
  for (const purchase of purchases) {
    if (purchase.status === "cancelled" || !inPeriod(purchase.purchaseDate, from, to)) continue;
    for (const item of purchase.items) {
      const qty = item.quantity > 0 ? item.quantity : 1;
      gst += item.costPrice * (item.gstPercent / 100) * qty;
    }
  }
  return gst;
}

export function calculateGstOutput(
  sales: Sale[],
  business: Business,
  from: string,
  to: string,
): number {
  if (!business.hasGst) return 0;

  let gst = 0;
  for (const sale of sales) {
    if (sale.status === "cancelled" || !inPeriod(sale.saleDate, from, to)) continue;
    if (sale.gstAmount != null) {
      gst += sale.gstAmount;
      continue;
    }
    const gstLines = sale.items.map((item) => ({
      lineTotal: item.total,
      gstPercent: item.gstPercent ?? DEFAULT_GST_RATE_PERCENT,
    }));
    const discount = sale.discountAmount ?? 0;
    gst += saleAmountsFromGstLines(gstLines, discount, true).gstAmount;
  }
  return gst;
}

export function buildProfitAndLoss(params: {
  periodKey: string;
  sales: Sale[];
  products: Product[];
  expenses: OfficeExpense[];
  assets: OfficeAsset[];
  purchases: Purchase[];
  business: Business;
}): ProfitAndLossReport {
  const { periodKey, sales, products, expenses, assets, purchases, business } = params;
  const { from, to } = periodBounds(periodKey);

  const revenue = calculateRevenue(sales, from, to);
  const salesDiscounts = calculateSalesDiscounts(sales, from, to);
  const { salesRevenueWithGst, salesRevenueWithoutGst } = calculateRevenueBreakdown(
    sales,
    business,
    from,
    to,
  );
  const netRevenue = revenue - salesDiscounts;
  const cogs = calculateCogs(sales, products, from, to);
  const grossProfit = netRevenue - cogs;
  const { total: operatingExpenses, byAccount: expenseByAccount } = classifyOperatingExpenses(
    expenses,
    from,
    to,
  );
  const depreciation = calculateDepreciation(assets, periodKey);
  const gstOutput = calculateGstOutput(sales, business, from, to);
  const gstInput = calculateGstInput(purchases, business, from, to);
  const netGst = gstOutput - gstInput;
  const netProfit = grossProfit - operatingExpenses - depreciation;

  return {
    periodKey,
    from,
    to,
    revenue,
    salesDiscounts,
    salesRevenueWithGst,
    salesRevenueWithoutGst,
    netRevenue,
    cogs,
    grossProfit,
    grossMarginPercent: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    operatingExpenses,
    expenseByAccount,
    depreciation,
    gstOutput,
    gstInput,
    netGst,
    netProfit,
    netMarginPercent: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0,
  };
}

export function generateJournalEntries(params: {
  periodKey: string;
  sales: Sale[];
  products: Product[];
  expenses: OfficeExpense[];
  assets: OfficeAsset[];
  purchases: Purchase[];
  business: Business;
  manualEntries?: JournalEntry[];
}): JournalEntry[] {
  const pl = buildProfitAndLoss(params);
  const entries: JournalEntry[] = [];
  const { from, to } = periodBounds(params.periodKey);

  if (pl.netRevenue > 0 || pl.salesDiscounts > 0) {
    const lines: JournalLine[] = [];
    if (pl.netRevenue > 0) {
      lines.push(line("1000", pl.netRevenue, 0));
      lines.push(line("4000", 0, pl.revenue));
    }
    if (pl.salesDiscounts > 0) {
      lines.push(line("4100", pl.salesDiscounts, 0));
    }
    entries.push({
      id: `AUTO-SALES-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "SALES",
      source: "auto",
      description: "Record sales revenue and discounts",
      lines,
    });
  }

  if (pl.cogs > 0) {
    entries.push({
      id: `AUTO-COGS-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "COGS",
      source: "auto",
      description: "Cost of goods sold",
      lines: [line("5000", pl.cogs, 0), line("1100", 0, pl.cogs)],
    });
  }

  for (const [code, amount] of Object.entries(pl.expenseByAccount)) {
    if (amount <= 0) continue;
    entries.push({
      id: `AUTO-EXP-${code}-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "OPEX",
      source: "auto",
      description: `Operating expense — ${accountName(code)}`,
      lines: [line(code, amount, 0), line("1000", 0, amount)],
    });
  }

  if (pl.depreciation > 0) {
    entries.push({
      id: `AUTO-DEP-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "DEPR",
      source: "auto",
      description: "Monthly depreciation on fixed assets",
      lines: [line("6000", pl.depreciation, 0), line("1210", 0, pl.depreciation)],
    });
  }

  if (pl.gstOutput > 0) {
    entries.push({
      id: `AUTO-GST-OUT-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "GST-OUT",
      source: "auto",
      description: "GST output on taxable sales (estimated)",
      lines: [line("2100", 0, pl.gstOutput), line("4000", pl.gstOutput, 0)],
    });
  }

  if (pl.gstInput > 0) {
    entries.push({
      id: `AUTO-GST-IN-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "GST-IN",
      source: "auto",
      description: "GST input on purchases",
      lines: [line("1300", pl.gstInput, 0), line("1100", 0, pl.gstInput)],
    });
  }

  const inventoryPurchases = params.purchases
    .filter((purchase) => purchase.status !== "cancelled" && inPeriod(purchase.purchaseDate, from, to))
    .reduce((sum, purchase) => sum + purchase.total, 0);

  if (inventoryPurchases > 0) {
    entries.push({
      id: `AUTO-INV-${params.periodKey}`,
      entryDate: to,
      periodKey: params.periodKey,
      reference: "PURCHASE",
      source: "auto",
      description: "Inventory purchases received",
      lines: [line("1100", inventoryPurchases, 0), line("2000", 0, inventoryPurchases)],
    });
  }

  for (const manual of params.manualEntries ?? []) {
    if (manual.periodKey === params.periodKey) {
      entries.push(manual);
    }
  }

  return entries;
}

export function buildMonthlyClose(
  periodKey: string,
  pl: ProfitAndLossReport,
  closedBy: string,
): MonthlyClose {
  return {
    periodKey,
    closedAt: new Date().toISOString(),
    closedBy,
    revenue: pl.netRevenue,
    cogs: pl.cogs,
    grossProfit: pl.grossProfit,
    operatingExpenses: pl.operatingExpenses,
    depreciation: pl.depreciation,
    gstOutput: pl.gstOutput,
    gstInput: pl.gstInput,
    netProfit: pl.netProfit,
  };
}

export function isPeriodClosed(periodKey: string, closes: MonthlyClose[]): boolean {
  return closes.some((close) => close.periodKey === periodKey);
}
