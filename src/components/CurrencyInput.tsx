import {
  CURRENCY_SYMBOL,
  currencyInnerInputClass,
  currencyInputGroupClass,
  roundMoney,
} from "../lib/constants";

interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  placeholder?: string;
  min?: number;
  step?: number | string;
  id?: string;
  disabled?: boolean;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0.00",
  min = 0,
  step = 0.01,
  id,
  disabled = false,
}: CurrencyInputProps) {
  const displayValue = value === "" || value === 0 ? "" : value;

  return (
    <div
      className={`${currencyInputGroupClass}${disabled ? " opacity-50" : ""}`}
    >
      <span className="shrink-0 border-r border-border px-3 py-2.5 text-sm font-medium text-text-muted">
        {CURRENCY_SYMBOL}
      </span>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={displayValue}
        onChange={(e) => onChange(roundMoney(Number(e.target.value) || 0))}
        placeholder={placeholder}
        disabled={disabled}
        className={`${currencyInnerInputClass} disabled:cursor-not-allowed`}
      />
    </div>
  );
}
