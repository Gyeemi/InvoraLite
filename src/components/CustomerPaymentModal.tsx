import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { CurrencyInput } from "./CurrencyInput";
import { CustomerPaymentReceiptPreviewModal } from "./CustomerPaymentReceiptPreviewModal";
import {
  CUSTOMER_PAYMENT_MODES,
  E_PAYMENT_PLATFORMS,
  cardClass,
  formatCurrency,
  inputClass,
  labelClass,
  resolveCustomerPaymentMode,
  type CustomerPaymentCategory,
  type EPaymentPlatform,
} from "../lib/constants";
import type { Contact, CustomerPayment } from "../types";

interface CustomerPaymentModalProps {
  open: boolean;
  customer: Contact | null;
  creditDue: number;
  onClose: () => void;
  onSave: (payload: {
    amount: number;
    paymentDate: string;
    paymentMode: string;
    paymentReference?: string;
    notes: string;
  }) => Promise<CustomerPayment | null>;
}

export function CustomerPaymentModal({
  open,
  customer,
  creditDue,
  onClose,
  onSave,
}: CustomerPaymentModalProps) {
  const { business } = useAuth();
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentCategory, setPaymentCategory] = useState<CustomerPaymentCategory>("Cash");
  const [ePaymentPlatform, setEPaymentPlatform] = useState<EPaymentPlatform>(E_PAYMENT_PLATFORMS[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<CustomerPayment | null>(null);

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
    setReceiptPayment(null);
  }, [open, customer?.id]);

  if (!open || !customer) return null;

  async function handleSubmit(e: React.FormEvent, printReceipt = false) {
    e.preventDefault();
    if (amount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (amount > creditDue) {
      setError(`Payment cannot exceed the credit due of ${formatCurrency(creditDue)}.`);
      return;
    }
    if (paymentCategory === "E-Payment" && !paymentReference.trim()) {
      setError("Enter the payment reference / transaction ID.");
      return;
    }

    setSubmitting(true);
    setError("");
    const payment = await onSave({
      amount,
      paymentDate,
      paymentMode: resolveCustomerPaymentMode(paymentCategory, ePaymentPlatform),
      paymentReference: paymentReference.trim() || undefined,
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (!payment) {
      setError("Could not record payment. Please try again.");
      return;
    }
    if (printReceipt && business) {
      setReceiptPayment(payment);
    } else {
      onClose();
    }
  }

  function handleReceiptClose() {
    setReceiptPayment(null);
    onClose();
  }

  function payFullBalance() {
    setAmount(creditDue);
  }

  function selectPaymentCategory(category: CustomerPaymentCategory) {
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
              <h3 className="text-lg font-semibold text-text-primary">Mark Paid</h3>
              <p className="text-sm text-text-secondary">{customer.name}</p>
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

          <div className="mt-4 rounded-xl border border-border bg-bg-main px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-muted">Credit due</p>
            <p className="text-xl font-bold text-accent-orange">{formatCurrency(creditDue)}</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="sale-modal-scroll min-h-0 flex-1 space-y-4 px-6 py-4">
            <p className="text-sm text-text-secondary">
              Record payment received from this customer against their outstanding credit balance.
            </p>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className={labelClass}>Payment amount</label>
                <button
                  type="button"
                  onClick={payFullBalance}
                  className="text-xs font-medium text-accent-blue hover:underline"
                >
                  Pay full balance
                </button>
              </div>
              <CurrencyInput value={amount} onChange={setAmount} placeholder="Enter amount" />
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
              <label className={labelClass}>Payment method</label>
              <div className="grid grid-cols-2 gap-3">
                {CUSTOMER_PAYMENT_MODES.map((mode) => {
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
                    <label htmlFor="customerEPaymentPlatform" className={labelClass}>
                      E-Payment platform
                    </label>
                    <select
                      id="customerEPaymentPlatform"
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
                    <label htmlFor="customerPaymentReference" className={labelClass}>
                      Reference / Transaction ID
                    </label>
                    <input
                      id="customerPaymentReference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Enter payment reference number"
                      className={inputClass}
                      required
                    />
                  </div>
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
        </form>

        <div className="shrink-0 border-t border-border/60 bg-bg-card px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={submitting}
              onClick={(e) => void handleSubmit(e, false)}
              className="flex-1 rounded-xl bg-accent-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save Payment"}
            </button>
            <button
              type="button"
              disabled={submitting || !business}
              onClick={(e) => void handleSubmit(e, true)}
              className="flex-1 rounded-xl border border-accent-green bg-accent-green/10 py-2.5 text-sm font-semibold text-accent-green transition-colors hover:bg-accent-green/20 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save Payment & Print Payment Receipt"}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
        </div>
      </div>

      {receiptPayment && business && (
        <CustomerPaymentReceiptPreviewModal
          business={business}
          customer={customer}
          payment={receiptPayment}
          onClose={handleReceiptClose}
        />
      )}
    </div>
  );
}
