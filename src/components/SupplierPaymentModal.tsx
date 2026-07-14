import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CurrencyInput } from "./CurrencyInput";
import {
  E_PAYMENT_PLATFORMS,
  cardClass,
  formatCurrency,
  inputClass,
  labelClass,
  resolveSupplierPaymentMode,
  SUPPLIER_PAYMENT_MODES,
  type EPaymentPlatform,
  type SupplierPaymentCategory,
} from "../lib/constants";
import type { Contact } from "../types";

interface SupplierPaymentModalProps {
  open: boolean;
  supplier: Contact | null;
  balanceDue: number;
  advanceRemaining: number;
  onClose: () => void;
  onSave: (payload: {
    amount: number;
    paymentDate: string;
    paymentMode: string;
    paymentReference?: string;
    notes: string;
  }) => Promise<boolean>;
}

export function SupplierPaymentModal({
  open,
  supplier,
  balanceDue,
  advanceRemaining,
  onClose,
  onSave,
}: SupplierPaymentModalProps) {
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentCategory, setPaymentCategory] = useState<SupplierPaymentCategory>("Cash");
  const [ePaymentPlatform, setEPaymentPlatform] = useState<EPaymentPlatform>(E_PAYMENT_PLATFORMS[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isAdvanceOnly = balanceDue <= 0;
  const overpaymentAmount = balanceDue > 0 ? Math.max(0, amount - balanceDue) : amount;

  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentCategory("Cash");
    setEPaymentPlatform(E_PAYMENT_PLATFORMS[0]);
    setPaymentReference("");
    setNotes("");
    setError("");
    setSubmitting(false);
  }, [open, supplier?.id]);

  if (!open || !supplier) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (paymentCategory === "E-Payment" && !paymentReference.trim()) {
      setError("Enter the payment reference / transaction ID.");
      return;
    }
    if (paymentCategory === "Cheque" && !paymentReference.trim()) {
      setError("Enter the cheque number.");
      return;
    }
    if (paymentCategory === "Bank Transfer" && !paymentReference.trim()) {
      setError("Enter the deposit slip number.");
      return;
    }

    setSubmitting(true);
    setError("");
    const ok = await onSave({
      amount,
      paymentDate,
      paymentMode: resolveSupplierPaymentMode(paymentCategory, ePaymentPlatform),
      paymentReference: paymentReference.trim() || undefined,
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (!ok) {
      setError("Could not record payment. Please try again.");
    }
  }

  function payFullBalance() {
    setAmount(balanceDue);
  }

  function selectPaymentCategory(category: SupplierPaymentCategory) {
    setPaymentCategory(category);
    setPaymentReference("");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div
        className={`flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden ${cardClass} shadow-2xl`}
      >
        <div className="shrink-0 border-b border-border/60 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                {isAdvanceOnly ? "Record Advance" : "Record Payment"}
              </h3>
              <p className="text-sm text-text-secondary">{supplier.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-bg-main px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-text-muted">Balance due</p>
              <p className="text-xl font-bold text-accent-red">{formatCurrency(balanceDue)}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg-main px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-text-muted">Advance available</p>
              <p className="text-xl font-bold text-accent-green">
                {formatCurrency(advanceRemaining)}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="sale-modal-scroll min-h-0 flex-1 space-y-4 px-6 py-4">
            {isAdvanceOnly ? (
              <p className="text-sm text-text-secondary">
                No balance is due. This payment will be stored as prepaid advance for future
                purchases.
              </p>
            ) : (
              <p className="text-sm text-text-secondary">
                You can pay more than the balance due. Any extra amount is saved as advance.
              </p>
            )}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className={labelClass}>
                {isAdvanceOnly ? "Advance amount" : "Payment amount"}
              </label>
              {!isAdvanceOnly && balanceDue > 0 && (
                <button
                  type="button"
                  onClick={payFullBalance}
                  className="text-xs font-medium text-accent-blue hover:underline"
                >
                  Pay full balance
                </button>
              )}
            </div>
            <CurrencyInput value={amount} onChange={setAmount} placeholder="Enter amount" />
            {overpaymentAmount > 0 && (
              <p className="mt-2 text-xs text-accent-green">
                {formatCurrency(overpaymentAmount)} will be added as advance after clearing the
                balance.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Payment date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Payment mode</label>
            <div className="grid grid-cols-2 gap-3">
              {SUPPLIER_PAYMENT_MODES.map((mode) => {
                const selected = paymentCategory === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectPaymentCategory(mode)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                      selected
                        ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                        : "border-border bg-bg-main text-text-secondary hover:border-accent-blue/40 hover:bg-bg-hover"
                    }`}
                    aria-pressed={selected}
                  >
                    <span>{mode}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {paymentCategory === "E-Payment" && (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="supplierEPaymentPlatform" className={labelClass}>
                    E-Payment platform
                  </label>
                  <select
                    id="supplierEPaymentPlatform"
                    value={ePaymentPlatform}
                    onChange={(e) => setEPaymentPlatform(e.target.value as EPaymentPlatform)}
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
                  <label htmlFor="supplierPaymentReference" className={labelClass}>
                    Reference / Transaction ID
                  </label>
                  <input
                    id="supplierPaymentReference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Enter payment reference number"
                    className={inputClass}
                    required
                  />
                </div>
              </div>
            )}

            {paymentCategory === "Cheque" && (
              <div className="mt-3">
                <label htmlFor="supplierChequeNo" className={labelClass}>
                  Cheque No.
                </label>
                <input
                  id="supplierChequeNo"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Enter cheque number"
                  className={inputClass}
                  required
                />
              </div>
            )}

            {paymentCategory === "Bank Transfer" && (
              <div className="mt-3">
                <label htmlFor="supplierDepositSlipNo" className={labelClass}>
                  Deposit Slip No.
                </label>
                <input
                  id="supplierDepositSlipNo"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Enter deposit slip number"
                  className={inputClass}
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional remarks"
              className={inputClass}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>
          )}
          </div>

          <div className="shrink-0 border-t border-border/60 bg-bg-card px-6 py-4">
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-accent-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90 disabled:opacity-50"
              >
                {submitting ? "Saving…" : isAdvanceOnly ? "Save Advance" : "Save Payment"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
