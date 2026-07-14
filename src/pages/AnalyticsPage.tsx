import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { ChartValueTooltip } from "../components/ChartValueTooltip";
import { getProducts, getSales } from "../lib/data";
import { cardClass, formatCurrency } from "../lib/constants";
import type { Product, Sale } from "../types";

type ChartPeriod = "weekly" | "monthly" | "yearly";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CHART_COLORS = [
  "#4d7cfe",
  "#00f5ff",
  "#39ff14",
  "#ffe600",
  "#ff6b35",
  "#ff00ff",
  "#bf00ff",
  "#ff3131",
  "#7df9ff",
  "#a3e635",
  "#f472b6",
  "#38bdf8",
] as const;

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  weekly: "Weekly earnings",
  monthly: "Monthly earnings",
  yearly: "Yearly earnings",
};

type ChartDatum = {
  label: string;
  total: number;
  color: string;
};

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: { color?: string };
};

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date): Date {
  const start = new Date(date);
  const weekday = start.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildWeeklyChartData(sales: Sale[]): ChartDatum[] {
  const currentWeekStart = getWeekStart(new Date());
  const weeks: ChartDatum[] = [];

  for (let offset = 11; offset >= 0; offset -= 1) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - offset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startIso = toLocalIsoDate(weekStart);
    const endIso = toLocalIsoDate(weekEnd);
    const total = sales.reduce((sum, sale) => {
      if (sale.saleDate >= startIso && sale.saleDate <= endIso) {
        return sum + sale.total;
      }
      return sum;
    }, 0);

    weeks.push({
      label: weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      total,
      color: CHART_COLORS[(11 - offset) % CHART_COLORS.length],
    });
  }

  return weeks;
}

function buildMonthlyChartData(sales: Sale[]): ChartDatum[] {
  const year = new Date().getFullYear();
  const totals = new Array<number>(12).fill(0);

  for (const sale of sales) {
    const [saleYear, saleMonth] = sale.saleDate.slice(0, 7).split("-").map(Number);
    if (saleYear === year && saleMonth >= 1 && saleMonth <= 12) {
      totals[saleMonth - 1] += sale.total;
    }
  }

  return MONTH_LABELS.map((label, index) => ({
    label,
    total: totals[index],
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function buildYearlyChartData(sales: Sale[]): ChartDatum[] {
  const totals = new Map<number, number>();

  for (const sale of sales) {
    const year = Number(sale.saleDate.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    totals.set(year, (totals.get(year) ?? 0) + sale.total);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, total], index) => ({
      label: String(year),
      total,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
}

function EarningsBar({
  activeIndex,
  ...props
}: BarShapeProps & { activeIndex: number | null }) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } = props;
  const color = payload?.color ?? CHART_COLORS[index % CHART_COLORS.length];
  const isActive = activeIndex === index;
  const scaleX = isActive ? 1.14 : 1;
  const scaleY = isActive ? 1.05 : 1;
  const barWidth = width * scaleX;
  const barHeight = height * scaleY;
  const barX = x + (width - barWidth) / 2;
  const barY = y + height - barHeight;

  return (
    <rect
      x={barX}
      y={barY}
      width={barWidth}
      height={barHeight}
      rx={6}
      ry={6}
      fill={color}
      style={{
        transition: "all 0.22s ease",
        filter: isActive ? `drop-shadow(0 0 18px ${color})` : "none",
        cursor: "pointer",
      }}
    />
  );
}

export function AnalyticsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("monthly");
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([getSales(), getProducts()]);
      setSales(s.filter((x) => x.status !== "cancelled"));
      setProducts(p);
    })();
  }, []);

  const earnings = sales.reduce((sum, s) => sum + s.total, 0);

  const chartData = useMemo(() => {
    if (chartPeriod === "weekly") return buildWeeklyChartData(sales);
    if (chartPeriod === "yearly") return buildYearlyChartData(sales);
    return buildMonthlyChartData(sales);
  }, [sales, chartPeriod]);

  const lowStock = products.filter((p) => p.status === "low" || p.status === "out");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Sales Insights</h2>
        <p className="text-sm text-text-secondary">Sales overview and earnings insights</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`${cardClass} p-6`}>
          <p className="text-xs uppercase tracking-wider text-text-muted">Total Sales</p>
          <p className="mt-2 text-3xl font-bold text-accent-blue">{sales.length}</p>
        </div>
        <div className={`${cardClass} p-6`}>
          <p className="text-xs uppercase tracking-wider text-text-muted">Till Date Earnings</p>
          <p className="mt-2 text-3xl font-bold text-accent-green">{formatCurrency(earnings)}</p>
        </div>
        <div className={`${cardClass} p-6`}>
          <p className="text-xs uppercase tracking-wider text-text-muted">Low / Out of Stock</p>
          <p className="mt-2 text-3xl font-bold text-accent-orange">{lowStock.length}</p>
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{PERIOD_LABELS[chartPeriod]}</h3>
          <div className="flex flex-wrap gap-2">
            {(["weekly", "monthly", "yearly"] as ChartPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => {
                  setChartPeriod(period);
                  setActiveBarIndex(null);
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                  chartPeriod === period
                    ? "bg-accent-blue text-white"
                    : "border border-border text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[280px]">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              No sales recorded yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="18%"
                onMouseLeave={() => setActiveBarIndex(null)}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={chartPeriod === "weekly" ? 11 : 12}
                  interval={0}
                  angle={chartPeriod === "weekly" ? -35 : 0}
                  textAnchor={chartPeriod === "weekly" ? "end" : "middle"}
                  height={chartPeriod === "weekly" ? 56 : 30}
                />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                  content={<ChartValueTooltip valueLabel="Earnings" />}
                />
                <Bar
                  dataKey="total"
                  barSize={52}
                  maxBarSize={52}
                  radius={[6, 6, 0, 0]}
                  shape={(props: unknown) => (
                    <EarningsBar {...(props as BarShapeProps)} activeIndex={activeBarIndex} />
                  )}
                  onMouseEnter={(_, index) => setActiveBarIndex(index)}
                  onMouseLeave={() => setActiveBarIndex(null)}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
