import { ChevronDown, Printer, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceCreditPaymentSection } from "../components/invoice/InvoiceCreditPaymentSection";
import { PasswordConfirmDialog } from "../components/PasswordConfirmDialog";
import { SalesReturnModal } from "../components/SalesReturnModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNavigation } from "../contexts/NavigationContext";
import { usePermissions } from "../hooks/usePermissions";
import { recordAudit } from "../lib/audit";
import {
  cancelSale,
  getCustomerPayments,
  getCustomers,
  getSales,
  getSalesReturns,
  saleCreditPaymentContext,
  submitSalesReturn,
} from "../lib/data";
import type { SalesReturnDraftLine } from "../lib/returns";
import { buildInvoicePrintHtml, resolveBillTo, resolveSaleGstAmounts, saleItemGstPercent, saleItemLineGst, saleItemLineTotalInclGst, businessFromLines, billToLines, type SalePrintKind } from "../lib/invoicePrint";
import { printHtmlDocument } from "../lib/reportPrint";
import { cardClass, formatCurrency, formatDateGB, formatSalePaymentSummary, resolveSaleCreditDetails } from "../lib/constants";
import type {
  Contact,
  CustomerPayment,
  Sale,
  SalesReturn,
  SalesReturnReason,
  SalesReturnSettlement,
} from "../types";

const SALE_PRINT_OPTIONS: { kind: SalePrintKind; label: string; description: string }[] = [
  { kind: "invoice", label: "Invoice", description: "Tax invoice for the customer" },
  { kind: "cash_memo", label: "Cash Memo", description: "Simple cash sale memo" },
];

export function InvoicePage() {
  const { business, verifyPassword, user } = useAuth();
  const { canManageSales } = usePermissions();
  const { showSuccess, showError } = useToast();
  const { invoicePreview } = useNavigation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  async function reloadSales(preferredId?: string) {
    const [saleList, customerList, payments, returns] = await Promise.all([
      getSales(),
      getCustomers(),
      getCustomerPayments(),
      getSalesReturns(),
    ]);
    const completed = saleList.filter((entry) => entry.status !== "cancelled");
    setSales(completed);
    setCustomers(customerList);
    setCustomerPayments(payments);
    setSalesReturns(returns);
    if (preferredId && completed.some((entry) => entry.id === preferredId)) {
      setSelectedId(preferredId);
    } else if (completed[0]) {
      setSelectedId(completed[0].id);
    } else {
      setSelectedId("");
    }
  }

  useEffect(() => {
    void reloadSales(invoicePreview?.id);
  }, [invoicePreview]);

  useEffect(() => {
    if (!printMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!printMenuRef.current?.contains(event.target as Node)) {
        setPrintMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPrintMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [printMenuOpen]);

  useEffect(() => {
    setPrintMenuOpen(false);
  }, [selectedId]);

  const sale = sales.find((s) => s.id === selectedId) ?? invoicePreview;

  const billTo = useMemo(
    () => (sale ? resolveBillTo(sale, customers) : null),
    [sale, customers],
  );

  const creditPaymentContext = useMemo(
    () => (sale ? saleCreditPaymentContext(sale, sales, customerPayments) : null),
    [sale, sales, customerPayments],
  );

  function printSaleDocument(kind: SalePrintKind) {
    if (!sale || !business || !billTo) return;
    setPrintMenuOpen(false);
    const html = buildInvoicePrintHtml(business, sale, billTo, sales, customerPayments, kind);
    printHtmlDocument(html);
  }

  async function handleConfirmVoid(password: string) {
    if (!voidTarget) return false;
    const ok = await verifyPassword(password);
    if (!ok) return false;

    setVoiding(true);
    try {
      const cancelled = await cancelSale(voidTarget.id);
      if (!cancelled) {
        showError("Could not void this sale.");
        return false;
      }
      if (user) {
        await recordAudit(user.username, "stock_change", voidTarget.id, "success", "sale_cancelled");
      }
      await reloadSales();
      showSuccess(`Sale ${voidTarget.id} voided. Stock has been restored.`);
      setVoidTarget(null);
      return true;
    } finally {
      setVoiding(false);
    }
  }

  async function handleSalesReturn(payload: {
    draftLines: SalesReturnDraftLine[];
    reason: SalesReturnReason;
    settlement: SalesReturnSettlement;
    supplierLiable: boolean;
    notes: string;
    returnDate: string;
  }) {
    if (!sale) return;
    setReturning(true);
    try {
      const result = await submitSalesReturn({
        sale,
        draftLines: payload.draftLines,
        reason: payload.reason,
        settlement: payload.settlement,
        supplierLiable: payload.supplierLiable,
        notes: payload.notes,
        returnDate: payload.returnDate,
        createdBy: user?.role ?? user?.username ?? "Admin",
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      if (user) {
        await recordAudit(
          user.username,
          "stock_change",
          result.salesReturn.id,
          "success",
          `sales_return:${sale.id}`,
        );
      }
      await reloadSales(sale.id);
      setReturnOpen(false);
      const tip = payload.supplierLiable
        ? " Marked supplier-liable — complete Stage 2 on Purchase."
        : "";
      showSuccess(`Sales return ${result.salesReturn.id} saved. Stock updated.${tip}`);
    } finally {
      setReturning(false);
    }
  }

  const returnsForSale = useMemo(
    () => (sale ? salesReturns.filter((entry) => entry.saleId === sale.id) : []),
    [sale, salesReturns],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Invoice</h2>
          <p className="text-sm text-text-secondary">Select a sale to preview the invoice</p>
        </div>
        {sale && (
          <div className="flex flex-wrap gap-2">
            {canManageSales && sale.status !== "cancelled" && (
              <>
                <button
                  type="button"
                  onClick={() => setReturnOpen(true)}
                  disabled={returning}
                  className="flex items-center gap-2 rounded-xl border border-accent-blue/40 px-4 py-2.5 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/10 disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  Sales Return
                </button>
                <button
                  type="button"
                  onClick={() => setVoidTarget(sale)}
                  disabled={voiding}
                  className="flex items-center gap-2 rounded-xl border border-accent-red/40 px-4 py-2.5 text-sm font-semibold text-accent-red transition-colors hover:bg-accent-red/10 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Void Sale
                </button>
              </>
            )}
            <div className="relative" ref={printMenuRef}>
              <button
                type="button"
                onClick={() => setPrintMenuOpen((open) => !open)}
                aria-expanded={printMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black"
              >
                <Printer className="h-4 w-4" />
                Print
                <ChevronDown className={`h-4 w-4 transition-transform ${printMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {printMenuOpen && (
                <div
                  role="menu"
                  aria-label="Print as"
                  className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-bg-card shadow-xl"
                >
                  {SALE_PRINT_OPTIONS.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      role="menuitem"
                      onClick={() => printSaleDocument(option.kind)}
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-bg-hover"
                    >
                      <span className="text-sm font-semibold text-text-primary">{option.label}</span>
                      <span className="text-xs text-text-muted">{option.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        <div
          className={`${cardClass} flex w-full shrink-0 flex-col overflow-hidden lg:w-[430px]`}
        >
          <h3 className="shrink-0 border-b border-border p-4 text-sm font-semibold">
            Sales Record
          </h3>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sales.length === 0 ? (
              <p className="p-6 text-sm text-text-muted">No sales available for invoice preview</p>
            ) : (
              sales.map((s) => {
                const customerPhone = resolveBillTo(s, customers).phone;
                return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full flex-col border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
                    selectedId === s.id ? "bg-bg-hover" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">{s.id}</span>
                    <span className="shrink-0 text-xs text-text-muted">{formatDateGB(s.saleDate)}</span>
                  </div>
                  <span className="text-xs text-text-muted">{s.customerName}</span>
                  {customerPhone && (
                    <span className="text-xs text-text-muted">{customerPhone}</span>
                  )}
                  <span className="text-sm text-accent-green">{formatCurrency(s.total)}</span>
                </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className="hidden shrink-0 self-stretch lg:block"
          role="separator"
          aria-orientation="vertical"
        >
          <div className="h-full w-px bg-border" />
        </div>

        <div className={`${cardClass} min-h-[400px] min-w-0 flex-1 p-8`}>
          {!sale ? (
            <p className="text-center text-sm text-text-muted">Select a sale to preview the invoice</p>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-text-primary">TAX Invoice</h3>
                <p className="text-sm text-text-muted">Original Tax Invoice</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-text-muted">From</p>
                  <p className="font-semibold text-text-primary">{business?.businessName}</p>
                  {business &&
                    businessFromLines(business).map((line) => (
                      <p key={line} className="text-sm text-text-secondary whitespace-pre-line">
                        {line}
                      </p>
                    ))}
                </div>
                <div className="text-right sm:text-right">
                  <p className="text-sm">
                    <span className="text-text-muted">Invoice No:</span> {sale.id}
                  </p>
                  <p className="text-sm">
                    <span className="text-text-muted">Date:</span> {formatDateGB(sale.saleDate)}
                  </p>
                  <div className="mt-3 text-sm sm:ml-auto sm:max-w-xs">
                    <p className="text-xs uppercase text-text-muted">Bill To</p>
                    {billTo &&
                      billToLines(billTo).map((line, index) => (
                        <p
                          key={`${line}-${index}`}
                          className={
                            index === 0
                              ? "font-semibold text-text-primary"
                              : "text-text-secondary whitespace-pre-line"
                          }
                        >
                          {line}
                        </p>
                      ))}
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="py-2">Item</th>
                    <th className="py-2">Qty</th>
                    <th className="py-2">Price</th>
                    {business?.hasGst && <th className="py-2">GST</th>}
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, i) => {
                    const lineGst = business?.hasGst ? saleItemLineGst(item) : 0;
                    const lineTotal = business?.hasGst ? saleItemLineTotalInclGst(item) : item.total;
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-3 text-text-primary">
                          {item.productName}
                          {item.imei1 && (
                            <p className="mt-0.5 text-xs text-text-muted">IMEI: {item.imei1}</p>
                          )}
                        </td>
                        <td className="py-3">{item.quantity}</td>
                        <td className="py-3">{formatCurrency(item.unitPrice)}</td>
                        {business?.hasGst && (
                          <td className="py-3">
                            {formatCurrency(lineGst)}
                            <p className="mt-0.5 text-xs text-text-muted">{saleItemGstPercent(item)}%</p>
                          </td>
                        )}
                        <td className="py-3 text-right font-medium">{formatCurrency(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="space-y-1 text-right text-sm">
                {(() => {
                  const gstAmounts = business ? resolveSaleGstAmounts(business, sale) : null;
                  if (gstAmounts) {
                    return (
                      <>
                        <p className="text-text-secondary">
                          Selling price: {formatCurrency(gstAmounts.sellingSubtotal)}
                        </p>
                        {(sale.discountAmount ?? 0) > 0 && (
                          <>
                            <p className="text-accent-orange">
                              Discount: -{formatCurrency(sale.discountAmount ?? 0)}
                            </p>
                            <p className="text-text-secondary">
                              Net selling price: {formatCurrency(gstAmounts.netSelling)}
                            </p>
                          </>
                        )}
                        <p className="text-text-secondary">
                          {gstAmounts.gstLabel}: {formatCurrency(gstAmounts.gstAmount)}
                        </p>
                      </>
                    );
                  }
                  if ((sale.discountAmount ?? 0) > 0) {
                    return (
                      <>
                        <p className="text-text-secondary">
                          Subtotal:{" "}
                          {formatCurrency(
                            sale.subtotal ?? sale.items.reduce((sum, item) => sum + item.total, 0),
                          )}
                        </p>
                        <p className="text-accent-orange">
                          Discount: -{formatCurrency(sale.discountAmount ?? 0)}
                        </p>
                      </>
                    );
                  }
                  return null;
                })()}
                <p className="text-lg font-bold text-text-primary">
                  Grand Total: {formatCurrency(sale.total)}
                </p>
                {creditPaymentContext ? (
                  <InvoiceCreditPaymentSection sale={sale} context={creditPaymentContext} />
                ) : (
                  (() => {
                    const credit = resolveSaleCreditDetails(sale);
                    if (!credit) {
                      return (
                        <p className="text-sm text-text-secondary">
                          {formatSalePaymentSummary(sale)}
                        </p>
                      );
                    }
                    return (
                      <div className="ml-auto mt-4 max-w-sm rounded-xl border border-border bg-bg-main p-4 text-left text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Payment
                        </p>
                        <p className="mt-1 font-medium text-text-primary">{sale.paymentMode}</p>
                        {credit.partialPaymentMode && (
                          <p className="mt-1 text-text-secondary">
                            Partial via {credit.partialPaymentMode}
                          </p>
                        )}
                        {credit.paymentReference && (
                          <p className="mt-1 text-text-secondary">Ref: {credit.paymentReference}</p>
                        )}
                        <div className="mt-3 space-y-1 border-t border-border/60 pt-3">
                          <div className="flex items-start justify-between gap-3 text-text-secondary">
                            <span>
                              Paid now{" "}
                              <span className="text-xs text-text-muted">
                                ({formatDateGB(sale.saleDate)})
                              </span>
                            </span>
                            <span>{formatCurrency(credit.amountPaid)}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3 font-medium text-accent-orange">
                            <span>
                              On credit{" "}
                              <span className="text-xs font-normal text-text-muted">
                                ({formatDateGB(sale.saleDate)})
                              </span>
                            </span>
                            <span>{formatCurrency(credit.amountCredit)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
              {returnsForSale.length > 0 && (
                <div className="rounded-xl border border-border bg-bg-main/60 px-4 py-3 text-left text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Returns on this sale
                  </p>
                  <ul className="mt-2 space-y-1">
                    {returnsForSale.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-text-secondary"
                      >
                        <span>
                          {entry.id} · {formatDateGB(entry.returnDate)}
                          {entry.supplierLiable && (
                            <span className="ml-2 text-xs text-accent-orange">
                              {entry.purchaseReturnId
                                ? `→ ${entry.purchaseReturnId}`
                                : "supplier-liable"}
                            </span>
                          )}
                        </span>
                        <span className="font-medium text-text-primary">
                          {formatCurrency(entry.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SalesReturnModal
        open={returnOpen}
        sale={sale}
        existingReturns={salesReturns}
        saving={returning}
        onClose={() => setReturnOpen(false)}
        onSubmit={handleSalesReturn}
      />

      <PasswordConfirmDialog
        open={voidTarget !== null}
        title="Void sale"
        description={
          voidTarget
            ? `Enter your password to void ${voidTarget.id}. Stock will be restored and any credit reversed.`
            : "Enter your password to continue."
        }
        confirmLabel={voiding ? "Voiding…" : "Void Sale"}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
      />
    </div>
  );
}
