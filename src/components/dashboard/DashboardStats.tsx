import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChartValueTooltip } from "../ChartValueTooltip";
import { getProducts, getPurchases, getSales, getCustomers, getSuppliers, getLowStockProducts } from "../../lib/data";
import { cardClass, formatCurrency, splitCurrency } from "../../lib/constants";
import type { Product, Purchase, Sale } from "../../types";

const PRODUCT_EARNINGS_COLORS = [
  "#00f5ff",
  "#39ff14",
  "#ff00ff",
  "#ffe600",
  "#ff3131",
  "#bf00ff",
  "#ff6b35",
  "#7df9ff",
];

type EarningsPeriod = "today" | "week" | "month" | "tillDate";

const EARNINGS_PERIOD_OPTIONS: { id: EarningsPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "tillDate", label: "Till Date" },
];

const EARNINGS_PERIOD_TITLES: Record<EarningsPeriod, string> = {
  today: "Today's Earnings",
  week: "This Week's Earnings",
  month: "This Month's Earnings",
  tillDate: "Till Date Earnings",
};

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartSunday(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function filterSalesByEarningsPeriod(sales: Sale[], period: EarningsPeriod): Sale[] {
  if (period === "tillDate") return sales;

  const now = new Date();

  if (period === "today") {
    const today = toLocalIsoDate(now);
    return sales.filter((sale) => sale.saleDate === today);
  }

  if (period === "week") {
    const weekStart = getWeekStartSunday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const from = toLocalIsoDate(weekStart);
    const to = toLocalIsoDate(weekEnd);
    return sales.filter((sale) => sale.saleDate >= from && sale.saleDate <= to);
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const from = toLocalIsoDate(new Date(year, month, 1));
  const to = toLocalIsoDate(new Date(year, month + 1, 0));
  return sales.filter((sale) => sale.saleDate >= from && sale.saleDate <= to);
}

function earningsEmptyLabel(period: EarningsPeriod): string {
  if (period === "today") return "No sales recorded today";
  if (period === "week") return "No sales recorded this week";
  if (period === "month") return "No sales recorded this month";
  return "No sales recorded yet";
}

function earningsByProduct(sales: Sale[]) {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.items.length > 0) {
      for (const item of sale.items) {
        totals.set(item.productName, (totals.get(item.productName) ?? 0) + item.total);
      }
      continue;
    }
    if (sale.productName) {
      totals.set(sale.productName, (totals.get(sale.productName) ?? 0) + sale.total);
    }
  }
  return [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, total], index) => ({
      name,
      total,
      color: PRODUCT_EARNINGS_COLORS[index % PRODUCT_EARNINGS_COLORS.length],
    }));
}

function buildProductColorMap(productData: ReturnType<typeof earningsByProduct>) {
  return new Map(productData.map((item) => [item.name, item.color]));
}

function ProductColorDot({ color }: { color: string }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
      style={{ backgroundColor: color, color }}
      aria-hidden="true"
    />
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string }; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl border border-border bg-bg-card px-3 py-2 shadow-lg shadow-black/30">
      <p className="text-sm font-medium text-text-primary">{item.payload.name}</p>
      <p className="text-sm font-semibold text-accent-green">{formatCurrency(item.value)}</p>
    </div>
  );
}

function EarningsPeriodPicker({
  period,
  onPeriodChange,
}: {
  period: EarningsPeriod;
  onPeriodChange: (period: EarningsPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {EARNINGS_PERIOD_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.id === "week" ? "Sunday – Saturday" : undefined}
          onClick={() => onPeriodChange(option.id)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
            period === option.id
              ? "bg-accent-green text-white"
              : "border border-border text-text-secondary hover:bg-bg-hover"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EarningsDonutPanel({
  period,
  total,
  salesCount,
  productData,
}: {
  period: EarningsPeriod;
  total: number;
  salesCount: number;
  productData: ReturnType<typeof earningsByProduct>;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-border bg-bg-main px-4 py-5">
        <div className="h-[128px] w-full">
          {productData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productData}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={60}
                  paddingAngle={0}
                  stroke="none"
                  strokeWidth={0}
                >
                  {productData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              {earningsEmptyLabel(period)}
            </div>
          )}
        </div>
        <p className="mt-1 text-center text-3xl font-bold tracking-tight text-text-primary">
          {formatCurrency(total)}
        </p>
        <p className="mt-1 text-center text-xs text-text-muted">
          From {salesCount} completed sale{salesCount === 1 ? "" : "s"}
        </p>
      </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function SectionHeader({
  title,
  summary,
  open,
  onToggle,
  showChevron = true,
}: {
  title: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  showChevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-bg-hover/40"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-text-secondary">{title}</span>
        {!open && summary}
      </div>
      {showChevron && (
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      )}
    </button>
  );
}

function EarningsOverviewCard({
  open,
  onToggle,
  earningsTitle,
  earningsToolbar,
  earningsSummary,
  chartSummary,
  earningsContent,
  chartContent,
}: {
  open: boolean;
  onToggle: () => void;
  earningsTitle: string;
  earningsToolbar: ReactNode;
  earningsSummary: ReactNode;
  chartSummary: ReactNode;
  earningsContent: ReactNode;
  chartContent: ReactNode;
}) {
  const panelGridClass =
    "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)]";
  const dividerClass = "border-border border-t lg:border-t-0 lg:border-l";

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className={panelGridClass}>
        <div>
          <SectionHeader
            title={earningsTitle}
            summary={earningsSummary}
            open={open}
            onToggle={onToggle}
            showChevron={false}
          />
          <div className="px-4 pb-4">{earningsToolbar}</div>
        </div>
        <div className={dividerClass} aria-hidden="true" />
        <SectionHeader
          title="Sales overview"
          summary={chartSummary}
          open={open}
          onToggle={onToggle}
        />
      </div>

      {open && (
        <div className={`border-t border-border ${panelGridClass}`}>
          <div className="px-6 pb-6 pt-4">{earningsContent}</div>
          <div className={dividerClass} aria-hidden="true" />
          <div className="px-6 pb-6 pt-4">{chartContent}</div>
        </div>
      )}
    </div>
  );
}

export function DashboardStats({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState(0);
  const [suppliers, setSuppliers] = useState(0);
  const [earningsOverviewOpen, setEarningsOverviewOpen] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<EarningsPeriod>("today");

  useEffect(() => {
    void (async () => {
      const [p, s, pu, c, sup] = await Promise.all([
        getProducts(),
        getSales(),
        getPurchases(),
        getCustomers(),
        getSuppliers(),
      ]);
      setProducts(p);
      setSales(s.filter((x: Sale) => x.status !== "cancelled"));
      setPurchases(pu.filter((x: Purchase) => x.status !== "cancelled"));
      setCustomers(c.length);
      setSuppliers(sup.length);
    })();
  }, [refreshKey]);

  const periodSales = useMemo(
    () => filterSalesByEarningsPeriod(sales, earningsPeriod),
    [sales, earningsPeriod],
  );

  const earnings = useMemo(
    () => periodSales.reduce((sum, s) => sum + s.total, 0),
    [periodSales],
  );

  const productEarnings = useMemo(() => earningsByProduct(periodSales), [periodSales]);
  const productColors = useMemo(() => buildProductColorMap(productEarnings), [productEarnings]);

  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const sale of sales) {
      const month = sale.saleDate.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + sale.total);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, total]) => ({
        month: new Date(`${month}-01`).toLocaleDateString("en-GB", { month: "short" }),
        total,
      }));
  }, [sales]);

  const { symbol, whole, decimal } = splitCurrency(earnings);
  const lowStockProducts = useMemo(() => getLowStockProducts(products), [products]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Products" value={String(products.length)} accent="text-accent-green" />
        <StatCard label="Total Purchases" value={String(purchases.length)} accent="text-accent-orange" />
        <StatCard label="Total Customers" value={String(customers)} accent="text-accent-purple" />
        <StatCard label="Total Suppliers" value={String(suppliers)} accent="text-sky-400" />
      </div>

      {lowStockProducts.length > 0 && (
        <div className={`${cardClass} border-accent-orange/30 bg-accent-orange/5 p-5`}>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-accent-orange" />
            <h3 className="font-semibold text-text-primary">Low stock alerts</h3>
            <span className="rounded-full bg-accent-orange/15 px-2.5 py-0.5 text-xs font-medium text-accent-orange">
              {lowStockProducts.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStockProducts.slice(0, 6).map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-4 py-3 text-sm"
              >
                <span className="truncate text-text-secondary">{product.name}</span>
                <span className="ml-3 shrink-0 font-semibold text-accent-orange">{product.stock}</span>
              </div>
            ))}
          </div>
          {lowStockProducts.length > 6 && (
            <p className="mt-3 text-xs text-text-muted">
              {lowStockProducts.length - 6} more product{lowStockProducts.length - 6 === 1 ? "" : "s"} need restocking.
            </p>
          )}
        </div>
      )}

      <EarningsOverviewCard
        open={earningsOverviewOpen}
        onToggle={() => setEarningsOverviewOpen((value) => !value)}
        earningsTitle={EARNINGS_PERIOD_TITLES[earningsPeriod]}
        earningsToolbar={
          <EarningsPeriodPicker period={earningsPeriod} onPeriodChange={setEarningsPeriod} />
        }
        earningsSummary={
          <span className="text-lg font-bold text-text-primary">
            {symbol} {whole}
            <span className="text-base text-text-muted">.{decimal}</span>
          </span>
        }
        chartSummary={
          <span className="text-xs text-text-muted">
            {chartData.length > 0
              ? `${chartData.length} month${chartData.length === 1 ? "" : "s"} of data`
              : "No sales recorded yet"}
          </span>
        }
        earningsContent={
          <EarningsDonutPanel
            period={earningsPeriod}
            total={earnings}
            salesCount={periodSales.length}
            productData={productEarnings}
          />
        }
        chartContent={
          <div className="h-[220px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip content={<ChartValueTooltip valueLabel="Sales" />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#4d7cfe"
                    fill="#4d7cfe33"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No sales recorded yet
              </div>
            )}
          </div>
        }
      />

      <div className={`${cardClass} p-6`}>
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Recent Sales</h3>
        {sales.length === 0 ? (
          <p className="text-sm text-text-muted">No sales recorded yet</p>
        ) : (
          <div className="space-y-3">
            {sales.map((sale) => {
              const color =
                productColors.get(sale.productName) ??
                PRODUCT_EARNINGS_COLORS[0];
              return (
                <div
                  key={sale.id}
                  className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <ProductColorDot color={color} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">{sale.productName}</p>
                      <p className="text-xs text-text-muted">{sale.customerName || "Walk-in"}</p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-text-primary">
                    {formatCurrency(sale.total)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
