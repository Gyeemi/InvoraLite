import { formatCurrency } from "../lib/constants";

interface ChartValueTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ value: number; payload?: { color?: string } }>;
  valueLabel?: string;
}

export function ChartValueTooltip({
  active,
  label,
  payload,
  valueLabel = "Earnings",
}: ChartValueTooltipProps) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const color = entry.payload?.color;

  return (
    <div className="rounded-xl border border-border bg-bg-card px-3.5 py-2.5 shadow-lg shadow-black/25">
      <div className="flex items-center gap-2">
        {color ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        ) : null}
        <p className="text-sm font-semibold text-text-primary">{label}</p>
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wider text-text-muted">
        {valueLabel}
      </p>
      <p className="mt-0.5 text-base font-bold text-accent-green">
        {formatCurrency(Number(entry.value))}
      </p>
    </div>
  );
}
