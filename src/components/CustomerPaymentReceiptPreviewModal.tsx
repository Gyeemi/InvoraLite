import { Printer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildCustomerPaymentReceiptHtml,
  printCustomerPaymentReceipt,
} from "../lib/customerPaymentReceipt";
import { getCustomerPayments, getSales } from "../lib/data";
import type { Business, Contact, CustomerPayment, Sale } from "../types";

interface CustomerPaymentReceiptPreviewModalProps {
  business: Business;
  customer: Contact;
  payment: CustomerPayment;
  customerPayments?: CustomerPayment[];
  onClose: () => void;
}

export function CustomerPaymentReceiptPreviewModal({
  business,
  customer,
  payment,
  customerPayments: customerPaymentsProp,
  onClose,
}: CustomerPaymentReceiptPreviewModalProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>(
    customerPaymentsProp ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [saleList, paymentList] = await Promise.all([
        getSales(),
        customerPaymentsProp ? Promise.resolve(customerPaymentsProp) : getCustomerPayments(),
      ]);
      if (cancelled) return;
      setSales(saleList);
      setCustomerPayments(paymentList);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerPaymentsProp]);

  const receiptHtml = useMemo(
    () => buildCustomerPaymentReceiptHtml(business, customer, payment, sales, customerPayments),
    [business, customer, payment, sales, customerPayments],
  );

  function handlePrint() {
    void printCustomerPaymentReceipt(business, customer, payment, customerPayments);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Payment Receipt Preview</h3>
            <p className="text-xs text-text-muted">{payment.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close receipt preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-main p-4">
          <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-white shadow-inner">
            <iframe
              title={`Payment receipt preview ${payment.id}`}
              srcDoc={receiptHtml}
              className="aspect-[210/148] block w-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/60 px-5 py-4">
          <button
            type="button"
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-green py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90"
          >
            <Printer className="h-4 w-4" />
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
