import { Check } from "lucide-react";
import { CurrencyInput } from "../CurrencyInput";
import {
  E_PAYMENT_PLATFORMS,
  formatCurrency,
  inputClass,
  labelClass,
} from "../../lib/constants";
import type { NewSaleFormState } from "./useNewSaleForm";

export function SalePaymentSection({ form }: { form: NewSaleFormState }) {
  const {
    paymentCategory,
    creditPartialEnabled,
    amountPaidNow,
    partialPaymentCategory,
    ePaymentPlatform,
    paymentReference,
    creditAmountPaid,
    creditAmountDue,
    paymentMethods,
    setPaymentCategory,
    setCreditPartialEnabled,
    setAmountPaidNow,
    setPartialPaymentCategory,
    setEPaymentPlatform,
    setPaymentReference,
  } = form;

  return (
    <div>
      <label className={labelClass}>Payment Method</label>
      <div className="grid grid-cols-3 gap-3">
        {paymentMethods.map((method) => {
          const selected = paymentCategory === method;
          return (
            <button
              key={method}
              type="button"
              onClick={() => {
                setPaymentCategory(method);
                if (method !== "E-Payment" && method !== "Credit") {
                  setPaymentReference("");
                }
                if (method !== "Credit") {
                  setCreditPartialEnabled(false);
                  setAmountPaidNow(0);
                  setPartialPaymentCategory("Cash");
                }
              }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                  : "border-border bg-bg-main text-text-secondary hover:border-accent-blue/40 hover:bg-bg-hover"
              }`}
              aria-pressed={selected}
            >
              <span>{method}</span>
              {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {paymentCategory === "E-Payment" && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="ePaymentPlatform" className={labelClass}>
              E-Payment platform
            </label>
            <select
              id="ePaymentPlatform"
              value={ePaymentPlatform}
              onChange={(e) => setEPaymentPlatform(e.target.value as typeof ePaymentPlatform)}
              className={inputClass}
            >
              {E_PAYMENT_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paymentReference" className={labelClass}>
              Reference / Transaction ID
            </label>
            <input
              id="paymentReference"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Enter payment reference number"
              className={inputClass}
              required
            />
          </div>
        </div>
      )}

      {paymentCategory === "Credit" && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-bg-main p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Partial payment</p>
              <p className="text-xs text-text-muted">
                Customer pays part now in cash or e-payment; balance goes on credit
              </p>
            </div>
            <button
              type="button"
              role="switch"
              onClick={() => {
                setCreditPartialEnabled((enabled) => {
                  const next = !enabled;
                  if (!next) {
                    setAmountPaidNow(0);
                    setPartialPaymentCategory("Cash");
                    setPaymentReference("");
                  }
                  return next;
                });
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                creditPartialEnabled ? "bg-accent-orange" : "bg-border"
              }`}
              aria-checked={creditPartialEnabled}
              aria-label="Toggle partial payment"
            >
              <span
                className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  creditPartialEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {creditPartialEnabled && (
            <>
              <div>
                <label className={labelClass}>Amount received now</label>
                <CurrencyInput
                  value={amountPaidNow}
                  onChange={setAmountPaidNow}
                  placeholder="Enter partial payment"
                />
              </div>

              <div>
                <label className={labelClass}>Partial payment via</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["Cash", "E-Payment"] as const).map((method) => {
                    const selected = partialPaymentCategory === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPartialPaymentCategory(method);
                          if (method === "Cash") setPaymentReference("");
                        }}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                          selected
                            ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                            : "border-border bg-bg-card text-text-secondary hover:border-accent-blue/40 hover:bg-bg-hover"
                        }`}
                        aria-pressed={selected}
                      >
                        <span>{method}</span>
                        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {partialPaymentCategory === "E-Payment" && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="creditEPaymentPlatform" className={labelClass}>
                      E-Payment platform
                    </label>
                    <select
                      id="creditEPaymentPlatform"
                      value={ePaymentPlatform}
                      onChange={(e) => setEPaymentPlatform(e.target.value as typeof ePaymentPlatform)}
                      className={inputClass}
                    >
                      {E_PAYMENT_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="creditPaymentReference" className={labelClass}>
                      Reference / Transaction ID
                    </label>
                    <input
                      id="creditPaymentReference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Enter payment reference number"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-1 border-t border-border/60 pt-3 text-sm">
            <div className="flex items-center justify-between text-text-secondary">
              <span>Paid now</span>
              <span>{formatCurrency(creditAmountPaid)}</span>
            </div>
            <div className="flex items-center justify-between font-medium text-accent-orange">
              <span>On credit</span>
              <span>{formatCurrency(creditAmountDue)}</span>
            </div>
          </div>

          <p className="text-xs text-text-muted">A registered customer is required for credit sales.</p>
        </div>
      )}
    </div>
  );
}
