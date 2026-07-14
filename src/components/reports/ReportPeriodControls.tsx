import { Lock } from "lucide-react";
import {
  FISCAL_YEAR_PRESETS,
  fiscalStartMonthInputValue,
  normalizeFiscalYearStartMonth,
} from "../../lib/accounting";
import { inputClass, labelClass } from "../../lib/constants";

export type ReportPeriodMode = "monthly" | "annual";

export function ReportPeriodControls({
  mode,
  periodKey,
  onPeriodKeyChange,
  fiscalStartMonth,
  fiscalYear,
  onFiscalYearChange,
  onFiscalStartMonthChange,
  onFiscalPreset,
  periodClosed = false,
}: {
  mode: ReportPeriodMode;
  periodKey: string;
  onPeriodKeyChange: (value: string) => void;
  fiscalStartMonth: number;
  fiscalYear: number;
  onFiscalYearChange: (year: number) => void;
  onFiscalStartMonthChange: (monthInputValue: string) => void;
  onFiscalPreset: (startMonth: number) => void;
  periodClosed?: boolean;
}) {
  const normalizedStartMonth = normalizeFiscalYearStartMonth(fiscalStartMonth);

  if (mode === "monthly") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px]">
          <label className={labelClass} htmlFor="report-period-month">
            Accounting period
          </label>
          <input
            id="report-period-month"
            type="month"
            value={periodKey}
            onChange={(e) => onPeriodKeyChange(e.target.value)}
            className={inputClass}
          />
        </div>
        {periodClosed && (
          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-accent-green/15 px-3 py-1 text-xs font-medium text-accent-green">
            <Lock className="h-3.5 w-3.5" />
            Period closed
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px]">
          <label className={labelClass} htmlFor="report-fiscal-start">
            Fiscal year starts
          </label>
          <input
            id="report-fiscal-start"
            type="month"
            value={fiscalStartMonthInputValue(normalizedStartMonth, fiscalYear)}
            onChange={(e) => onFiscalStartMonthChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="min-w-[140px]">
          <label className={labelClass} htmlFor="report-fiscal-year">
            Fiscal year
          </label>
          <input
            id="report-fiscal-year"
            type="number"
            min={2000}
            max={2100}
            value={fiscalYear}
            onChange={(e) => onFiscalYearChange(Number.parseInt(e.target.value, 10) || fiscalYear)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-muted">Presets:</span>
        {FISCAL_YEAR_PRESETS.map((preset) => {
          const active = normalizedStartMonth === preset.startMonth;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onFiscalPreset(preset.startMonth)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-accent-purple/15 text-accent-purple"
                  : "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
