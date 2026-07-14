import { CurrencyInput } from "../CurrencyInput";
import { inputClass, labelClass } from "../../lib/constants";
import type { NewSaleFormState } from "./useNewSaleForm";

export function SaleDiscountSection({ form }: { form: NewSaleFormState }) {
  const {
    discountEnabled,
    discountAmount,
    setDiscountEnabled,
    setDiscountAmount,
    couponCode,
    setCouponCode,
    couponOffer,
    couponDiscount,
    couponError,
    selectedCustomer,
    redeemLoyaltyPoints,
    setRedeemLoyaltyPoints,
  } = form;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-bg-main p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Discount</p>
            <p className="text-xs text-text-muted">Apply a manual discount to this invoice</p>
          </div>
          <button
            type="button"
            role="switch"
            onClick={() => {
              setDiscountEnabled((enabled) => {
                const next = !enabled;
                if (!next) setDiscountAmount(0);
                return next;
              });
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
              discountEnabled ? "bg-accent-orange" : "bg-border"
            }`}
            aria-checked={discountEnabled}
            aria-label="Toggle discount"
          >
            <span
              className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                discountEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {discountEnabled && (
          <div className="mt-3">
            <label className={labelClass}>Discount amount</label>
            <CurrencyInput
              value={discountAmount}
              onChange={setDiscountAmount}
              placeholder="Enter discount"
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-bg-main p-4">
        <p className="text-sm font-medium text-text-primary">Coupon code</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Enter a code from Pricing → Offers (Coupon). Manual discount overrides coupon when both are set.
        </p>
        <div className="mt-3">
          <label className={labelClass}>Code</label>
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="e.g. SAVE20"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {couponCode.trim() && couponError && (
          <p className="mt-2 text-xs text-accent-red">{couponError}</p>
        )}
        {!discountEnabled && couponOffer && couponDiscount > 0 && (
          <p className="mt-2 text-xs text-accent-green">
            Applied: {couponOffer.name} (−
            {couponOffer.discountType === "PERCENT"
              ? `${couponOffer.discountValue}%`
              : couponDiscount.toFixed(2)}
            )
          </p>
        )}
      </div>

      {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-bg-main p-4">
          <p className="text-sm font-medium text-text-primary">Loyalty points</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Balance {selectedCustomer.loyaltyPoints}. Redeem as invoice credit (default 1 point = Nu
            1; set redeem value on a LOYALTY offer).
          </p>
          <div className="mt-3">
            <label className={labelClass}>Points to redeem</label>
            <input
              type="number"
              min={0}
              max={selectedCustomer.loyaltyPoints ?? 0}
              step={1}
              value={redeemLoyaltyPoints || ""}
              onChange={(e) =>
                setRedeemLoyaltyPoints(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
              }
              className={inputClass}
              placeholder="0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
