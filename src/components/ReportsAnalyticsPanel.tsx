import {
  BarChart3,
  BookOpen,
  Calculator,
  Calendar,
  Download,
  FileText,
  Printer,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccessRestricted } from "./AccessRestricted";
import { PasswordConfirmDialog } from "./PasswordConfirmDialog";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import {
  buildAnnualProfitAndLoss,
  buildMonthlyClose,
  buildProfitAndLoss,
  CHART_OF_ACCOUNTS,
  countEstimatedCogsSaleLines,
  currentFiscalYear,
  fiscalStartMonthInputValue,
  generateJournalEntries,
  isPeriodClosed,
  monthFromMonthInputValue,
  normalizeFiscalYearStartMonth,
  periodBounds,
  periodKeyFromDate,
} from "../lib/accounting";
import { printAnnualIncomeTaxReport } from "../lib/annualIncomeTaxReport";
import {
  buildAnnualIncomeTaxReportPackage,
  describeAnnualExport,
  exportAnnualReportCsv,
  exportAnnualReportPdf,
} from "../lib/annualReportExport";
import {
  getAccountingJournal,
  getMonthlyCloses,
  getOfficeAssets,
  getOfficeExpenses,
  getProducts,
  getPurchases,
  getSales,
  nextId,
  saveAccountingJournal,
  saveMonthlyCloses,
} from "../lib/data";
import { cardClass, formatCurrency, formatDateGB, inputClass, labelClass, tableNoWrapClass } from "../lib/constants";
import { ReportPeriodControls } from "./reports/ReportPeriodControls";
import {
  buildTaxSubmissionReportData,
  printTaxSubmissionReport,
} from "../lib/taxSubmissionReport";
import type { Business, JournalEntry, MonthlyClose } from "../types";

type ReportSection = "dashboard" | "pl" | "annual" | "accounts" | "journal" | "closing";

function SectionTab({
  active,
  onClick,
  icon,
  label,
  tabId,
  panelId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap bg-transparent px-1 py-3 text-sm font-medium transition-colors ${
        active ? "text-accent-purple" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

type PlDisplayRow = {
  label: string;
  value: number;
  bold?: boolean;
  debit?: boolean;
  hide?: boolean;
  highlight?: boolean;
  note?: string;
};

function PlSection({
  title,
  rows,
}: {
  title: string;
  rows: PlDisplayRow[];
}) {
  const visible = rows.filter((row) => !row.hide);
  if (visible.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h4>
      <div className="divide-y divide-border/50">
        {visible.map((row) => (
          <div
            key={row.label}
            className={`flex items-start justify-between gap-4 py-3 text-sm ${
              row.bold ? "font-semibold text-text-primary" : "text-text-primary"
            } ${row.highlight ? "bg-accent-green/5 -mx-2 rounded-lg px-2" : ""}`}
          >
            <div className="min-w-0">
              <span>{row.label}</span>
              {row.note && <p className="mt-0.5 text-xs font-normal text-text-muted">{row.note}</p>}
            </div>
            <span className={`shrink-0 tabular-nums ${row.debit ? "text-accent-orange" : row.value < 0 ? "text-text-secondary" : ""}`}>
              {row.value < 0 ? "−" : ""}
              {formatCurrency(Math.abs(row.value))}
              {row.debit ? " (Dr)" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPlDisplaySections(
  hasGst: boolean,
  pl: ReturnType<typeof buildProfitAndLoss>,
  options?: { incomeTax?: boolean },
) {
  const incomeTax = options?.incomeTax ?? false;
  const revenueRows: PlDisplayRow[] = [
    {
      label: "Gross Sales Revenue",
      value: pl.revenue,
      note: incomeTax ? "Exclusive of GST — remitted monthly" : undefined,
    },
    {
      label: "Less: Sales Discounts",
      value: -pl.salesDiscounts,
      hide: pl.salesDiscounts <= 0,
    },
    ...(hasGst && !incomeTax
      ? [
          {
            label: "Sales Revenue (Inclusive of GST)",
            value: pl.salesRevenueWithGst,
            note: "Products sold with GST added",
          },
          {
            label: "Sales Revenue (Exclusive of GST)",
            value: pl.salesRevenueWithoutGst,
            note: "Products sold without GST added",
          },
        ]
      : []),
    { label: "Net Revenue", value: pl.netRevenue, bold: true },
  ];

  const costsRows: PlDisplayRow[] = [
    { label: "Cost of Goods Sold (COGS)", value: pl.cogs, debit: true },
    { label: "Gross Profit", value: pl.grossProfit, bold: true },
    { label: "Operating Expenses", value: pl.operatingExpenses, debit: true },
    { label: "Depreciation", value: pl.depreciation, debit: true, hide: pl.depreciation <= 0 },
    { label: "Net Profit", value: pl.netProfit, bold: true, highlight: true },
  ];

  return { revenueRows, costsRows };
}

function EstimatedCogsBanner({ lineCount }: { lineCount: number }) {
  if (lineCount <= 0) return null;

  return (
    <div className="rounded-xl border border-accent-orange/30 bg-accent-orange/10 px-4 py-3 text-sm text-accent-orange">
      {lineCount} sales line{lineCount === 1 ? "" : "s"} used estimated COGS — set cost prices on
      products for accurate profit.
    </div>
  );
}

export function ReportsAnalyticsPanel() {
  const { business, user, updateBusiness, verifyPassword } = useAuth();
  const { canManageReports } = usePermissions();
  const [unlocked, setUnlocked] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(true);
  const [section, setSection] = useState<ReportSection>("dashboard");
  const fiscalStartMonth = normalizeFiscalYearStartMonth(business?.fiscalYearStartMonth);
  const [fiscalYear, setFiscalYear] = useState(() => currentFiscalYear(fiscalStartMonth));
  const [periodKey, setPeriodKey] = useState(periodKeyFromDate(new Date().toISOString()));
  const [sales, setSales] = useState<Awaited<ReturnType<typeof getSales>>>([]);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof getProducts>>>([]);
  const [purchases, setPurchases] = useState<Awaited<ReturnType<typeof getPurchases>>>([]);
  const [expenses, setExpenses] = useState<Awaited<ReturnType<typeof getOfficeExpenses>>>([]);
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof getOfficeAssets>>>([]);
  const [manualJournal, setManualJournal] = useState<JournalEntry[]>([]);
  const [closes, setCloses] = useState<MonthlyClose[]>([]);
  const [message, setMessage] = useState("");
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState({
    description: "",
    debitAccount: "1000",
    creditAccount: "5300",
    amount: 0,
  });

  useEffect(() => {
    setFiscalYear(currentFiscalYear(fiscalStartMonth));
  }, [fiscalStartMonth]);

  useEffect(() => {
    if (!unlocked || !canManageReports) return;
    void (async () => {
      const [saleList, productList, purchaseList, expenseList, assetList, journal, closeList] =
        await Promise.all([
          getSales(),
          getProducts(),
          getPurchases(),
          getOfficeExpenses(),
          getOfficeAssets(),
          getAccountingJournal(),
          getMonthlyCloses(),
        ]);
      setSales(saleList.filter((sale) => sale.status !== "cancelled"));
      setProducts(productList);
      setPurchases(purchaseList.filter((purchase) => purchase.status !== "cancelled"));
      setExpenses(expenseList);
      setAssets(assetList);
      setManualJournal(journal);
      setCloses(closeList);
    })();
  }, [unlocked, canManageReports]);

  const biz = business as Business;
  const closed = isPeriodClosed(periodKey, closes);

  const pl = useMemo(
    () =>
      buildProfitAndLoss({
        periodKey,
        sales,
        products,
        expenses,
        assets,
        purchases,
        business: biz,
      }),
    [periodKey, sales, products, expenses, assets, purchases, biz],
  );

  const annualPl = useMemo(
    () =>
      buildAnnualProfitAndLoss({
        fiscalYear,
        sales,
        products,
        expenses,
        assets,
        purchases,
        business: biz,
      }),
    [fiscalYear, sales, products, expenses, assets, purchases, biz],
  );

  const annualPlSections = buildPlDisplaySections(biz.hasGst, annualPl, { incomeTax: true });

  const estimatedCogsLines = useMemo(
    () => countEstimatedCogsSaleLines(sales, products, pl.from, pl.to),
    [sales, products, pl.from, pl.to],
  );

  const annualEstimatedCogsLines = useMemo(
    () => countEstimatedCogsSaleLines(sales, products, annualPl.from, annualPl.to),
    [sales, products, annualPl.from, annualPl.to],
  );

  const journalEntries = useMemo(
    () =>
      generateJournalEntries({
        periodKey,
        sales,
        products,
        expenses,
        assets,
        purchases,
        business: biz,
        manualEntries: manualJournal,
      }),
    [periodKey, sales, products, expenses, assets, purchases, biz, manualJournal],
  );

  const trend = useMemo(() => {
    const keys = new Set<string>();
    for (const sale of sales) keys.add(periodKeyFromDate(sale.saleDate));
    for (const expense of expenses) keys.add(periodKeyFromDate(expense.expenseDate));
    const sorted = [...keys].sort().slice(-6);
    return sorted.map((key) => {
      const report = buildProfitAndLoss({
        periodKey: key,
        sales,
        products,
        expenses,
        assets,
        purchases,
        business: biz,
      });
      return { periodKey: key, netProfit: report.netProfit, revenue: report.netRevenue };
    });
  }, [sales, expenses, products, assets, purchases, biz]);

  async function handleMonthlyClose() {
    if (closed) {
      setMessage("This period is already closed.");
      return;
    }
    const close = buildMonthlyClose(periodKey, pl, user?.name ?? "Admin");
    const next = [close, ...closes.filter((item) => item.periodKey !== periodKey)];
    await saveMonthlyCloses(next);
    setCloses(next);
    setMessage(`Period ${periodKey} closed. Net profit: ${formatCurrency(pl.netProfit)}`);
  }

  function printTaxReport(targetPeriodKey = periodKey, closeRecord?: MonthlyClose | null) {
    if (!business) {
      setMessage("Business profile is required to print tax reports.");
      return;
    }

    const reportPl = buildProfitAndLoss({
      periodKey: targetPeriodKey,
      sales,
      products,
      expenses,
      assets,
      purchases,
      business: biz,
    });
    const closeForPeriod =
      closeRecord ?? closes.find((entry) => entry.periodKey === targetPeriodKey) ?? null;

    const reportData = buildTaxSubmissionReportData({
      business: biz,
      periodKey: targetPeriodKey,
      pl: reportPl,
      sales,
      purchases,
      expenses,
      close: closeForPeriod,
      generatedBy: user?.name ?? "Admin",
    });

    printTaxSubmissionReport(reportData);
    setMessage(`Tax submission report opened for printing (${targetPeriodKey}).`);
  }

  function printAnnualReport() {
    if (!business) {
      setMessage("Business profile is required to print annual reports.");
      return;
    }

    const generatedBy = user?.name ?? "Admin";
    const packageData = buildAnnualIncomeTaxReportPackage({
      business: biz,
      fiscalYear,
      annualPl,
      sales,
      products,
      expenses,
      assets,
      purchases,
      closes,
      generatedBy,
    });

    printAnnualIncomeTaxReport(packageData);
    const monthCount = packageData.monthlySupportingReports?.length ?? 0;
    const skippedNote = packageData.exportNote ? ` ${packageData.exportNote}` : "";
    setMessage(
      `Annual income tax report opened for printing (${annualPl.fiscalYearLabel}) with ${monthCount} monthly supporting report${monthCount === 1 ? "" : "s"}.${skippedNote}`,
    );
  }

  async function handleExportAnnualCsv() {
    if (!business) {
      setMessage("Business profile is required to export annual reports.");
      return;
    }
    const generatedBy = user?.name ?? "Admin";
    const packageData = buildAnnualIncomeTaxReportPackage({
      business: biz,
      fiscalYear,
      annualPl,
      sales,
      products,
      expenses,
      assets,
      purchases,
      closes,
      generatedBy,
    });
    const result = await exportAnnualReportCsv(biz, packageData.report, generatedBy);
    if (result.success) {
      const attachmentNote =
        packageData.exportNote ??
        `${packageData.monthlySupportingReports?.length ?? 0} monthly attachment${(packageData.monthlySupportingReports?.length ?? 0) === 1 ? "" : "s"}`;
      setMessage(`Annual report CSV saved — ${describeAnnualExport(packageData.report)} · ${attachmentNote}`);
    } else if (result.error && result.error !== "Export cancelled.") {
      setMessage(result.error);
    }
  }

  async function handleExportAnnualPdf() {
    if (!business) {
      setMessage("Business profile is required to export annual reports.");
      return;
    }
    const generatedBy = user?.name ?? "Admin";
    const packageData = buildAnnualIncomeTaxReportPackage({
      business: biz,
      fiscalYear,
      annualPl,
      sales,
      products,
      expenses,
      assets,
      purchases,
      closes,
      generatedBy,
    });
    const result = await exportAnnualReportPdf(packageData);
    if (result.success) {
      setMessage(
        `Annual report saved as HTML — open it in your browser and choose Print → Save as PDF. ${describeAnnualExport(annualPl)}`,
      );
    } else if (result.error && result.error !== "Export cancelled.") {
      setMessage(result.error);
    }
  }

  async function handleFiscalYearStartChange(value: string) {
    const normalized = monthFromMonthInputValue(value);
    const ok = await updateBusiness({ fiscalYearStartMonth: normalized });
    if (ok) {
      setFiscalYear(currentFiscalYear(normalized));
      setMessage(`Fiscal year start set to ${fiscalStartMonthInputValue(normalized)}.`);
    }
  }

  async function handleFiscalPreset(startMonth: number) {
    if (normalizeFiscalYearStartMonth(fiscalStartMonth) === startMonth) return;
    const ok = await updateBusiness({ fiscalYearStartMonth: startMonth });
    if (ok) {
      setFiscalYear(currentFiscalYear(startMonth));
      setMessage(`Fiscal year preset applied — starts ${fiscalStartMonthInputValue(startMonth)}.`);
    }
  }

  async function handleAddManualEntry(e: React.FormEvent) {
    e.preventDefault();
    if (closed) {
      setMessage("Cannot add entries to a closed period.");
      return;
    }
    if (manualForm.amount <= 0 || !manualForm.description.trim()) {
      setMessage("Enter a description and amount greater than zero.");
      return;
    }

    const debit = CHART_OF_ACCOUNTS.find((account) => account.code === manualForm.debitAccount);
    const credit = CHART_OF_ACCOUNTS.find((account) => account.code === manualForm.creditAccount);
    if (!debit || !credit) return;

    const { to } = periodBounds(periodKey);
    const entry: JournalEntry = {
      id: nextId("JE", manualJournal),
      entryDate: to,
      periodKey,
      reference: "MANUAL",
      source: "manual",
      description: manualForm.description.trim(),
      lines: [
        {
          accountCode: debit.code,
          accountName: debit.name,
          debit: manualForm.amount,
          credit: 0,
        },
        {
          accountCode: credit.code,
          accountName: credit.name,
          debit: 0,
          credit: manualForm.amount,
        },
      ],
    };

    const next = [entry, ...manualJournal];
    await saveAccountingJournal(next);
    setManualJournal(next);
    setManualForm({ description: "", debitAccount: "1000", creditAccount: "5300", amount: 0 });
    setMessage("Manual journal entry saved.");
  }

  const plSections = buildPlDisplaySections(biz.hasGst, pl);

  async function handlePasswordConfirm(password: string): Promise<boolean> {
    const ok = await verifyPassword(password);
    if (ok) {
      setUnlocked(true);
      setPasswordOpen(false);
    }
    return ok;
  }

  if (!canManageReports) {
    return (
      <AccessRestricted description="Only Super Admin can access reports, accounting, and monthly closing." />
    );
  }

  if (!unlocked) {
    return (
      <div className="space-y-4">
        <PasswordConfirmDialog
          open={passwordOpen && !unlocked}
          title="Accounting & tax reports"
          description="Enter your password to view P&amp;L, annual reports, journal entries, and monthly closing."
          confirmLabel="View reports"
          onClose={() => setPasswordOpen(false)}
          onConfirm={handlePasswordConfirm}
        />

        <div className={`${cardClass} flex flex-col items-center gap-4 p-10 text-center`}>
          <div className="rounded-2xl bg-accent-blue/10 p-4 text-accent-blue">
            <Shield className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Reports are protected</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Confirm your password to access accounting, tax reports, and financial closing for your business.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="rounded-xl bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
          >
            Unlock reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-text-secondary">
          Retail accounting with COGS, expense classification, depreciation, GST separation, P&amp;L,
          annual income tax reporting, chart of accounts, journal entries, and monthly closing.
        </p>
      </div>

      <ReportPeriodControls
        mode={section === "annual" ? "annual" : "monthly"}
        periodKey={periodKey}
        onPeriodKeyChange={setPeriodKey}
        fiscalStartMonth={fiscalStartMonth}
        fiscalYear={fiscalYear}
        onFiscalYearChange={setFiscalYear}
        onFiscalStartMonthChange={(value) => void handleFiscalYearStartChange(value)}
        onFiscalPreset={(startMonth) => void handleFiscalPreset(startMonth)}
        periodClosed={section !== "annual" && closed}
      />

      {message && (
        <div className="rounded-xl bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue">{message}</div>
      )}

      <div
        className="grid grid-cols-6 border-b border-border"
        role="tablist"
        aria-label="Report sections"
      >
        <SectionTab
          tabId="reports-dashboard-tab"
          panelId="reports-dashboard-panel"
          active={section === "dashboard"}
          onClick={() => setSection("dashboard")}
          icon={<TrendingUp className="h-4 w-4 shrink-0" />}
          label="Net Profit Dashboard"
        />
        <SectionTab
          tabId="reports-pl-tab"
          panelId="reports-pl-panel"
          active={section === "pl"}
          onClick={() => setSection("pl")}
          icon={<FileText className="h-4 w-4 shrink-0" />}
          label="P&amp;L Report"
        />
        <SectionTab
          tabId="reports-annual-tab"
          panelId="reports-annual-panel"
          active={section === "annual"}
          onClick={() => setSection("annual")}
          icon={<Calendar className="h-4 w-4 shrink-0" />}
          label="Annual Report"
        />
        <SectionTab
          tabId="reports-accounts-tab"
          panelId="reports-accounts-panel"
          active={section === "accounts"}
          onClick={() => setSection("accounts")}
          icon={<BookOpen className="h-4 w-4 shrink-0" />}
          label="Chart of Accounts"
        />
        <SectionTab
          tabId="reports-journal-tab"
          panelId="reports-journal-panel"
          active={section === "journal"}
          onClick={() => setSection("journal")}
          icon={<Calculator className="h-4 w-4 shrink-0" />}
          label="Journal Entries"
        />
        <SectionTab
          tabId="reports-closing-tab"
          panelId="reports-closing-panel"
          active={section === "closing"}
          onClick={() => setSection("closing")}
          icon={<BarChart3 className="h-4 w-4 shrink-0" />}
          label="Monthly Closing"
        />
      </div>

      {section === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net Revenue"
              value={formatCurrency(pl.netRevenue)}
              accent="text-accent-blue"
            />
            <StatCard label="COGS" value={formatCurrency(pl.cogs)} accent="text-accent-orange" />
            <StatCard
              label="Gross Profit"
              value={formatCurrency(pl.grossProfit)}
              accent="text-accent-green"
              sub={`${pl.grossMarginPercent.toFixed(1)}% margin`}
            />
            <StatCard
              label="Net Profit"
              value={formatCurrency(pl.netProfit)}
              accent={pl.netProfit >= 0 ? "text-accent-green" : "text-accent-red"}
              sub={`${pl.netMarginPercent.toFixed(1)}% net margin`}
            />
          </div>

          <div className={`${cardClass} p-5`}>
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Net profit trend (last periods)</h3>
            {trend.length === 0 ? (
              <p className="text-sm text-text-muted">No accounting data yet.</p>
            ) : (
              <div className="space-y-2">
                {trend.map((item) => (
                  <div key={item.periodKey} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">{item.periodKey}</span>
                    <span className="text-text-muted">{formatCurrency(item.revenue)} revenue</span>
                    <span
                      className={`font-semibold ${
                        item.netProfit >= 0 ? "text-accent-green" : "text-accent-red"
                      }`}
                    >
                      {formatCurrency(item.netProfit)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {section === "pl" && (
        <div className="space-y-4">
          <EstimatedCogsBanner lineCount={estimatedCogsLines} />
          <div className={`${cardClass} p-6`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Profit &amp; Loss — {periodKey}
              </h3>
              <p className="text-xs text-text-muted">
                {formatDateGB(pl.from)} to {formatDateGB(pl.to)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => printTaxReport()}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
            >
              <Printer className="h-4 w-4" />
              Print Tax Report
            </button>
          </div>
          <div className="space-y-8">
            <PlSection title="Revenue Breakdown" rows={plSections.revenueRows} />
            <PlSection title="Costs & Profitability" rows={plSections.costsRows} />
          </div>

          {biz.hasGst && (
            <div className="mt-6 rounded-xl border border-border bg-bg-main p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Tax separation (GST)
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">GST Output (estimated)</span>
                  <span>{formatCurrency(pl.gstOutput)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">GST Input (purchases)</span>
                  <span>{formatCurrency(pl.gstInput)}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 font-medium">
                  <span>Net GST payable</span>
                  <span className={pl.netGst > 0 ? "text-accent-orange" : "text-accent-green"}>
                    {formatCurrency(pl.netGst)}
                  </span>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {section === "annual" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue">
            Annual figures aggregate monthly accounting data across your fiscal year for income tax
            compliance. All amounts exclude GST — GST is reported and remitted via monthly tax reports.
          </div>

          <EstimatedCogsBanner lineCount={annualEstimatedCogsLines} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net Revenue"
              value={formatCurrency(annualPl.netRevenue)}
              accent="text-accent-blue"
            />
            <StatCard label="COGS" value={formatCurrency(annualPl.cogs)} accent="text-accent-orange" />
            <StatCard
              label="Gross Profit"
              value={formatCurrency(annualPl.grossProfit)}
              accent="text-accent-green"
              sub={`${annualPl.grossMarginPercent.toFixed(1)}% margin`}
            />
            <StatCard
              label="Net Profit"
              value={formatCurrency(annualPl.netProfit)}
              accent={annualPl.netProfit >= 0 ? "text-accent-green" : "text-accent-red"}
              sub={`${annualPl.netMarginPercent.toFixed(1)}% net margin`}
            />
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Annual P&amp;L — {annualPl.fiscalYearLabel}
                </h3>
                <p className="text-xs text-text-muted">
                  {formatDateGB(annualPl.from)} to {formatDateGB(annualPl.to)} · 12 monthly periods
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printAnnualReport()}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportAnnualCsv()}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportAnnualPdf()}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  <FileText className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>
            <div className="space-y-8">
              <PlSection title="Revenue Breakdown" rows={annualPlSections.revenueRows} />
              <PlSection title="Costs & Profitability" rows={annualPlSections.costsRows} />
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">Monthly breakdown</h3>
              <p className="text-xs text-text-muted">Per-period totals within the fiscal year</p>
            </div>
            <table className={`w-full text-left text-sm ${tableNoWrapClass}`}>
              <thead>
                <tr className="border-b border-border bg-bg-main/60 text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Net Revenue</th>
                  <th className="px-4 py-3 text-right">COGS</th>
                  <th className="px-4 py-3 text-right">Gross Profit</th>
                  <th className="px-4 py-3 text-right">Op. Expenses</th>
                  <th className="px-4 py-3 text-right">Depreciation</th>
                  <th className="px-4 py-3 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {annualPl.monthlyBreakdown.map((month) => (
                  <tr key={month.periodKey}>
                    <td className="px-4 py-3 font-mono text-text-primary">{month.periodKey}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatCurrency(month.netRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatCurrency(month.cogs)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatCurrency(month.grossProfit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatCurrency(month.operatingExpenses)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatCurrency(month.depreciation)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        month.netProfit >= 0 ? "text-accent-green" : "text-accent-red"
                      }`}
                    >
                      {formatCurrency(month.netProfit)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-bg-main/60 font-semibold">
                  <td className="px-4 py-3 text-text-primary">Annual total</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(annualPl.netRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(annualPl.cogs)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(annualPl.grossProfit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(annualPl.operatingExpenses)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(annualPl.depreciation)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      annualPl.netProfit >= 0 ? "text-accent-green" : "text-accent-red"
                    }`}
                  >
                    {formatCurrency(annualPl.netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "accounts" && (
        <div className={`${cardClass} overflow-hidden`}>
          <table className={`text-left text-sm ${tableNoWrapClass}`}>
            <thead>
              <tr className="border-b border-border bg-bg-main/60 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {CHART_OF_ACCOUNTS.map((account) => (
                <tr key={account.code}>
                  <td className="px-4 py-3 font-mono text-text-primary">{account.code}</td>
                  <td className="px-4 py-3 text-text-primary">{account.name}</td>
                  <td className="px-4 py-3 capitalize text-text-secondary">{account.type}</td>
                  <td className="px-4 py-3 text-text-muted">{account.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === "journal" && (
        <div className="space-y-4">
          {!closed && (
            <form onSubmit={(e) => void handleAddManualEntry(e)} className={`${cardClass} space-y-3 p-5`}>
              <h3 className="text-sm font-semibold text-text-primary">Add manual journal entry</h3>
              <input
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                placeholder="Description"
                className={inputClass}
                required
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Debit account</label>
                  <select
                    value={manualForm.debitAccount}
                    onChange={(e) => setManualForm({ ...manualForm, debitAccount: e.target.value })}
                    className={inputClass}
                  >
                    {CHART_OF_ACCOUNTS.map((account) => (
                      <option key={account.code} value={account.code}>
                        {account.code} — {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Credit account</label>
                  <select
                    value={manualForm.creditAccount}
                    onChange={(e) => setManualForm({ ...manualForm, creditAccount: e.target.value })}
                    className={inputClass}
                  >
                    {CHART_OF_ACCOUNTS.map((account) => (
                      <option key={account.code} value={account.code}>
                        {account.code} — {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Amount</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={manualForm.amount || ""}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, amount: Number.parseFloat(e.target.value) || 0 })
                    }
                    placeholder="Amount"
                    className={inputClass}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-accent-purple px-4 py-2 text-sm font-semibold text-white"
              >
                Post Entry
              </button>
            </form>
          )}

          <div className={`${cardClass} divide-y divide-border/50`}>
            {journalEntries.length === 0 ? (
              <p className="p-6 text-sm text-text-muted">No journal entries for this period.</p>
            ) : (
              journalEntries.map((entry) => (
                <div key={entry.id} className="p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEntryId((current) => (current === entry.id ? null : entry.id))
                    }
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{entry.description}</p>
                      <p className="text-xs text-text-muted">
                        {entry.reference} · {entry.source} · {formatDateGB(entry.entryDate)}
                      </p>
                    </div>
                    <span className="text-xs text-text-muted">{entry.lines.length} lines</span>
                  </button>
                  {expandedEntryId === entry.id && (
                    <table className={`mt-3 text-sm ${tableNoWrapClass}`}>
                      <thead>
                        <tr className="text-left text-xs text-text-muted">
                          <th className="py-1">Account</th>
                          <th className="py-1 text-right">Debit</th>
                          <th className="py-1 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((journalLine, index) => (
                          <tr key={`${entry.id}-${index}`} className="border-t border-border/30">
                            <td className="py-2 text-text-secondary">
                              {journalLine.accountCode} — {journalLine.accountName}
                            </td>
                            <td className="py-2 text-right text-text-primary">
                              {journalLine.debit > 0 ? formatCurrency(journalLine.debit) : "—"}
                            </td>
                            <td className="py-2 text-right text-text-primary">
                              {journalLine.credit > 0 ? formatCurrency(journalLine.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {section === "closing" && (
        <div className="space-y-4">
          <div className={`${cardClass} p-6`}>
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Close period {periodKey}</h3>
            <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-text-muted">Revenue:</span>{" "}
                <span className="font-medium">{formatCurrency(pl.netRevenue)}</span>
              </p>
              <p>
                <span className="text-text-muted">COGS:</span>{" "}
                <span className="font-medium">{formatCurrency(pl.cogs)}</span>
              </p>
              <p>
                <span className="text-text-muted">Operating expenses:</span>{" "}
                <span className="font-medium">{formatCurrency(pl.operatingExpenses)}</span>
              </p>
              <p>
                <span className="text-text-muted">Depreciation:</span>{" "}
                <span className="font-medium">{formatCurrency(pl.depreciation)}</span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-text-muted">Net profit:</span>{" "}
                <span
                  className={`text-lg font-bold ${
                    pl.netProfit >= 0 ? "text-accent-green" : "text-accent-red"
                  }`}
                >
                  {formatCurrency(pl.netProfit)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={closed}
                onClick={() => void handleMonthlyClose()}
                className="rounded-xl bg-accent-purple px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {closed ? "Period Already Closed" : "Close Month"}
              </button>
              <button
                type="button"
                onClick={() => printTaxReport()}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-bg-hover"
              >
                <Printer className="h-4 w-4" />
                Print Tax Submission Report
              </button>
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Closing history</h3>
            {closes.length === 0 ? (
              <p className="text-sm text-text-muted">No periods closed yet.</p>
            ) : (
              <div className="space-y-3">
                {closes.map((close) => (
                  <div
                    key={close.periodKey}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{close.periodKey}</p>
                      <p className="text-xs text-text-muted">
                        Closed {formatDateGB(close.closedAt.slice(0, 10))} by {close.closedBy}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        GST payable: {formatCurrency(Math.max(0, close.gstOutput - close.gstInput))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p
                        className={`font-semibold ${
                          close.netProfit >= 0 ? "text-accent-green" : "text-accent-red"
                        }`}
                      >
                        {formatCurrency(close.netProfit)}
                      </p>
                      <button
                        type="button"
                        onClick={() => printTaxReport(close.periodKey, close)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                        title={`Print tax submission report for ${close.periodKey}`}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
