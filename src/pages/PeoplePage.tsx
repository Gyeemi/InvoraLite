import { Banknote, Check, History, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ContactEditDialog } from "../components/ContactEditDialog";
import { CountryCodeSelect } from "../components/CountryCodeSelect";
import { CurrencyInput } from "../components/CurrencyInput";
import { CustomerPaymentModal } from "../components/CustomerPaymentModal";
import { PasswordConfirmDialog } from "../components/PasswordConfirmDialog";
import {
  PaymentHistoryModal,
  toHistoryPayments,
  toSupplierHistoryPayments,
} from "../components/PaymentHistoryModal";
import { SupplierPaymentModal } from "../components/SupplierPaymentModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { SaveButton } from "../components/SaveButton";
import {
  customerCreditDue,
  customerPaymentsFor,
  customerTotalPaid,
  getCustomerPayments,
  getCustomers,
  getPurchaseReturns,
  getPurchases,
  getSupplierPayments,
  getSuppliers,
  nextId,
  saveCustomerPayments,
  saveCustomers,
  saveSupplierPayments,
  saveSuppliers,
  supplierAdvanceRemaining,
  supplierBalanceDue,
  supplierNetBalance,
  supplierPaymentsFor,
  supplierLedgerWithBalance,
  supplierTotalPaid,
  syncSupplierCredits,
  purchaseMatchesSupplier,
} from "../lib/data";
import {
  cardClass,
  formatContactLabel,
  formatCurrency,
  formatPhoneLocal,
  inputClass,
  labelClass,
  normalizePhone,
  phoneInnerInputClass,
  phoneInputGroupClass,
  phoneMaxLength,
  phonePlaceholder,
} from "../lib/constants";
import { DEFAULT_COUNTRY_CODE } from "../lib/countryCodes";
import type { Contact, CustomerPayment, Purchase, PurchaseReturn, SupplierPayment } from "../types";

type Tab = "customers" | "suppliers";
type OpeningBalanceType = "none" | "credit";

type PendingAction =
  | { type: "edit"; contact: Contact }
  | { type: "delete"; contact: Contact };

export function PeoplePage() {
  const { verifyPassword } = useAuth();
  const { showSuccess } = useToast();
  const { canManageCustomers, canManageSuppliers, canViewSuppliers, canDelete } = usePermissions();
  const [tab, setTab] = useState<Tab>("customers");
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [paymentSupplier, setPaymentSupplier] = useState<Contact | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<Contact | null>(null);
  const [historyContact, setHistoryContact] = useState<Contact | null>(null);
  const [historyKind, setHistoryKind] = useState<"customer" | "supplier">("supplier");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState(0);
  const [openingBalanceType, setOpeningBalanceType] = useState<OpeningBalanceType>("none");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);

  const canWriteTab = tab === "customers" ? canManageCustomers : canManageSuppliers;

  const availableTabs = useMemo(() => {
    const tabs: Tab[] = ["customers"];
    if (canViewSuppliers) tabs.push("suppliers");
    return tabs;
  }, [canViewSuppliers]);

  useEffect(() => {
    if (tab === "suppliers" && !canViewSuppliers) {
      setTab("customers");
    }
  }, [canViewSuppliers, tab]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const [
      customerList,
      supplierList,
      purchaseList,
      supplierPaymentList,
      customerPaymentList,
      purchaseReturnList,
    ] = await Promise.all([
      getCustomers(),
      getSuppliers(),
      getPurchases(),
      getSupplierPayments(),
      getCustomerPayments(),
      getPurchaseReturns(),
    ]);
    setCustomers(customerList);
    const syncedSuppliers = syncSupplierCredits(supplierList, purchaseList);
    await saveSuppliers(syncedSuppliers);
    setSuppliers(syncedSuppliers);
    setPurchases(purchaseList);
    setPurchaseReturns(purchaseReturnList);
    setSupplierPayments(supplierPaymentList);
    setCustomerPayments(customerPaymentList);
  }

  function resetForm() {
    setName("");
    setCountryCode(DEFAULT_COUNTRY_CODE);
    setPhone("");
    setAddress("");
    setOpeningBalanceAmount(0);
    setOpeningBalanceType("none");
  }

  const contactLabel = tab === "customers" ? "customer" : "supplier";

  async function persistCustomers(next: Contact[]) {
    await saveCustomers(next);
    setCustomers(next);
  }

  async function persistSuppliers(next: Contact[]) {
    await saveSuppliers(next);
    setSuppliers(next);
  }

  async function persistSupplierPayments(next: SupplierPayment[]) {
    await saveSupplierPayments(next);
    setSupplierPayments(next);
  }

  async function persistCustomerPayments(next: CustomerPayment[]) {
    await saveCustomerPayments(next);
    setCustomerPayments(next);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
    const phoneDigits = normalizePhone(phone);

    if (tab === "customers") {
      const contact: Contact = {
        id: nextId("CUS", customers),
        name: trimmed,
        countryCode: phoneDigits ? countryCode : "",
        phone: phoneDigits,
        email: "",
        address: address.trim(),
      };
      await persistCustomers([contact, ...customers]);
    } else {
      const openingBalance =
        openingBalanceType === "credit" && openingBalanceAmount > 0 ? openingBalanceAmount : undefined;
      const contact: Contact = {
        id: nextId("SUP", suppliers),
        name: trimmed,
        countryCode: phoneDigits ? countryCode : "",
        phone: phoneDigits,
        email: "",
        address: address.trim(),
        openingBalance,
        creditBalance: openingBalance ?? 0,
      };
      await persistSuppliers([contact, ...suppliers]);
    }
    resetForm();
    showSuccess(
      tab === "customers"
        ? `${trimmed} was added as a customer.`
        : `${trimmed} was added as a supplier.`,
    );
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(contact: Contact) {
    if (tab === "customers") {
      await persistCustomers(customers.filter((c) => c.id !== contact.id));
      const nextPayments = customerPayments.filter((payment) => payment.customerId !== contact.id);
      await persistCustomerPayments(nextPayments);
    } else {
      await persistSuppliers(suppliers.filter((c) => c.id !== contact.id));
      const nextPayments = supplierPayments.filter((payment) => payment.supplierId !== contact.id);
      await persistSupplierPayments(nextPayments);
    }
  }

  async function handleSaveEdit(updated: Contact) {
    if (tab === "customers") {
      await persistCustomers(customers.map((c) => (c.id === updated.id ? updated : c)));
      const nextPayments = customerPayments.map((payment) =>
        payment.customerId === updated.id ? { ...payment, customerName: updated.name } : payment,
      );
      await persistCustomerPayments(nextPayments);
    } else {
      await persistSuppliers(suppliers.map((c) => (c.id === updated.id ? updated : c)));
      const nextPayments = supplierPayments.map((payment) =>
        payment.supplierId === updated.id ? { ...payment, supplierName: updated.name } : payment,
      );
      await persistSupplierPayments(nextPayments);
    }
    showSuccess(`${updated.name} was updated.`);
  }

  async function handleRecordPayment(payload: {
    amount: number;
    paymentDate: string;
    paymentMode: string;
    paymentReference?: string;
    notes: string;
  }) {
    if (!paymentSupplier) return false;

    const netBefore = supplierNetBalance(paymentSupplier, supplierPayments);
    if (payload.amount <= 0) return false;

    const payment: SupplierPayment = {
      id: nextId("PAY", supplierPayments),
      supplierId: paymentSupplier.id,
      supplierName: paymentSupplier.name,
      paymentDate: payload.paymentDate,
      paymentMode: payload.paymentMode,
      paymentReference: payload.paymentReference,
      amount: payload.amount,
      balanceAfter: Math.max(0, netBefore - payload.amount),
      notes: payload.notes || undefined,
    };

    const next = [payment, ...supplierPayments];
    await persistSupplierPayments(next);
    setPaymentSupplier(null);
    showSuccess(`Payment of ${formatCurrency(payload.amount)} recorded for ${paymentSupplier.name}.`);
    return true;
  }

  async function handleRecordCustomerPayment(payload: {
    amount: number;
    paymentDate: string;
    paymentMode: string;
    paymentReference?: string;
    notes: string;
  }): Promise<CustomerPayment | null> {
    if (!paymentCustomer) return null;

    const balanceBefore = customerCreditDue(paymentCustomer);
    if (balanceBefore <= 0 || payload.amount <= 0) return null;

    const amount = Math.min(payload.amount, balanceBefore);
    const payment: CustomerPayment = {
      id: nextId("RCP", customerPayments),
      customerId: paymentCustomer.id,
      customerName: paymentCustomer.name,
      paymentDate: payload.paymentDate,
      paymentMode: payload.paymentMode,
      paymentReference: payload.paymentReference,
      amount,
      balanceAfter: balanceBefore - amount,
      notes: payload.notes || undefined,
    };

    const nextPayments = [payment, ...customerPayments];
    const nextCustomers = customers.map((entry) =>
      entry.id === paymentCustomer.id
        ? { ...entry, creditBalance: balanceBefore - amount }
        : entry,
    );

    await persistCustomerPayments(nextPayments);
    await persistCustomers(nextCustomers);

    showSuccess(`Payment of ${formatCurrency(amount)} recorded for ${paymentCustomer.name}.`);
    return payment;
  }

  async function handlePasswordConfirm(password: string) {
    const ok = await verifyPassword(password);
    if (!ok || !pendingAction) return false;

    if (pendingAction.type === "delete") {
      await handleDelete(pendingAction.contact);
      showSuccess(`${pendingAction.contact.name} was deleted.`);
      setPendingAction(null);
      return true;
    }

    setEditingContact(pendingAction.contact);
    setPendingAction(null);
    return true;
  }

  const list = tab === "customers" ? customers : suppliers;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">People</h2>
        <p className="text-sm text-text-secondary">
          Manage parties you buy from and sell to
        </p>
      </div>

      <div className="flex gap-2">
        {availableTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              resetForm();
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-accent-purple text-white"
                : "border border-border text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {canWriteTab && (
      <form onSubmit={(e) => void handleAdd(e)} className={`${cardClass} flex flex-wrap gap-3 p-5`}>
        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Add ${contactLabel}`}
            className={inputClass}
            required
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <label className={labelClass}>Phone number</label>
          <div className={phoneInputGroupClass}>
            <CountryCodeSelect
              value={countryCode}
              onChange={(code) => {
                setCountryCode(code);
                setPhone(formatPhoneLocal(code, phone));
              }}
            />
            <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneLocal(countryCode, e.target.value))}
              placeholder={phonePlaceholder(countryCode)}
              inputMode="numeric"
              maxLength={phoneMaxLength(countryCode)}
              className={phoneInnerInputClass}
            />
          </div>
        </div>
        <div className="min-w-[240px] flex-1">
          <label className={labelClass}>Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Billing address"
            className={inputClass}
          />
        </div>
        {tab === "suppliers" && (
          <div className="min-w-[280px] flex-1">
            <label className={labelClass}>Opening Balance</label>
            <CurrencyInput
              value={openingBalanceAmount}
              onChange={(amount) => {
                setOpeningBalanceAmount(amount);
                if (amount > 0) {
                  setOpeningBalanceType("credit");
                } else {
                  setOpeningBalanceType("none");
                }
              }}
              placeholder="0.00"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  { id: "none", label: "None" },
                  { id: "credit", label: "Credit" },
                ] as const
              ).map((option) => {
                const selected = openingBalanceType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={option.id === "credit" && openingBalanceAmount <= 0}
                    onClick={() => setOpeningBalanceType(option.id)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                        : "border-border bg-bg-main text-text-secondary hover:border-accent-blue/40 hover:bg-bg-hover"
                    }`}
                    aria-pressed={selected}
                  >
                    <span>{option.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Credit = payable balance you already owe this supplier
            </p>
          </div>
        )}
        <div className="flex w-full items-end sm:w-auto">
          <SaveButton
            label="Add"
            saving={adding}
            savingLabel="Adding…"
            variant="primary"
            className="bg-accent-purple hover:bg-accent-purple/90"
          />
        </div>
      </form>
      )}

      <div className={`${cardClass} divide-y divide-border/50`}>
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">No contacts found</p>
        ) : (
          list.map((c) => {
            const credited = c.creditBalance ?? 0;
            const customerPaid =
              tab === "customers" ? customerTotalPaid(customerPayments, c.id) : 0;
            const customerDue = tab === "customers" ? customerCreditDue(c) : 0;
            const paid = tab === "suppliers" ? supplierTotalPaid(supplierPayments, c.id) : 0;
            const balance = tab === "suppliers" ? supplierBalanceDue(c, supplierPayments) : 0;
            const advanceRemaining =
              tab === "suppliers" ? supplierAdvanceRemaining(c, supplierPayments) : 0;

            return (
              <div key={c.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">{formatContactLabel(c)}</p>
                    {tab === "customers" && (customerDue > 0 || customerPaid > 0) && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <p>
                          <span className="text-text-muted">Credit due:</span>{" "}
                          <span className="font-semibold text-accent-orange">
                            {formatCurrency(customerDue)}
                          </span>
                        </p>
                        {customerPaid > 0 && (
                          <p>
                            <span className="text-text-muted">Paid:</span>{" "}
                            <span className="font-semibold text-accent-green">
                              {formatCurrency(customerPaid)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    {tab === "customers" && (c.loyaltyPoints ?? 0) > 0 && (
                      <p className="mt-1 text-sm text-text-secondary">
                        Loyalty points:{" "}
                        <span className="font-semibold text-text-primary">
                          {c.loyaltyPoints}
                        </span>
                      </p>
                    )}
                    {tab === "suppliers" && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {(c.openingBalance ?? 0) > 0 && (
                          <p>
                            <span className="text-text-muted">Opening:</span>{" "}
                            <span className="font-semibold text-text-primary">
                              {formatCurrency(c.openingBalance ?? 0)}
                            </span>
                          </p>
                        )}
                        <p>
                          <span className="text-text-muted">Credited:</span>{" "}
                          <span className="font-semibold text-accent-orange">
                            {formatCurrency(credited)}
                          </span>
                        </p>
                        <p>
                          <span className="text-text-muted">Paid:</span>{" "}
                          <span className="font-semibold text-accent-green">
                            {formatCurrency(paid)}
                          </span>
                        </p>
                        <p>
                          <span className="text-text-muted">Balance:</span>{" "}
                          <span className="font-semibold text-accent-red">
                            {formatCurrency(balance)}
                          </span>
                        </p>
                        {advanceRemaining > 0 && (
                          <p>
                            <span className="text-text-muted">Advance:</span>{" "}
                            <span className="font-semibold text-accent-green">
                              {formatCurrency(advanceRemaining)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    {c.address.trim() && (
                      <p className="mt-1 text-sm text-text-secondary whitespace-pre-line">
                        {c.address}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-text-muted">{c.id}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {(tab === "suppliers"
                      ? supplierPaymentsFor(supplierPayments, c.id).length > 0 ||
                        purchases.some(
                          (purchase) =>
                            purchase.status !== "cancelled" &&
                            purchaseMatchesSupplier(purchase, c),
                        ) ||
                        (c.openingBalance ?? 0) > 0
                      : customerPaymentsFor(customerPayments, c.id).length > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryKind(tab === "suppliers" ? "supplier" : "customer");
                          setHistoryContact(c);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-purple/40 hover:bg-accent-purple/10 hover:text-accent-purple"
                      >
                        <History className="h-3.5 w-3.5" />
                        Payment History
                      </button>
                    )}
                    {tab === "customers" && canWriteTab && customerDue > 0 && (
                      <button
                        type="button"
                        onClick={() => setPaymentCustomer(c)}
                        className="flex items-center gap-1.5 rounded-lg bg-accent-green/15 px-3 py-1.5 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/25"
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        Mark Paid
                      </button>
                    )}
                    {tab === "suppliers" && canWriteTab && (
                      <button
                        type="button"
                        onClick={() => setPaymentSupplier(c)}
                        className="flex items-center gap-1.5 rounded-lg bg-accent-green/15 px-3 py-1.5 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/25"
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        {balance > 0 ? "Record Payment" : "Record Advance"}
                      </button>
                    )}
                    {canWriteTab && (
                    <button
                      type="button"
                      onClick={() => setPendingAction({ type: "edit", contact: c })}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    )}
                    {canDelete && (
                    <button
                      type="button"
                      onClick={() => setPendingAction({ type: "delete", contact: c })}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-red/40 hover:bg-accent-red/10 hover:text-accent-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <PasswordConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.type === "delete"
            ? `Delete ${contactLabel}`
            : `Edit ${contactLabel}`
        }
        description={
          pendingAction?.type === "delete"
            ? `Enter your password to delete ${pendingAction.contact.name}.`
            : `Enter your password to edit ${pendingAction?.contact.name ?? contactLabel}.`
        }
        confirmLabel={pendingAction?.type === "delete" ? "Delete" : "Continue"}
        onClose={() => setPendingAction(null)}
        onConfirm={handlePasswordConfirm}
      />

      <ContactEditDialog
        open={editingContact !== null}
        contact={editingContact}
        contactLabel={contactLabel}
        onClose={() => setEditingContact(null)}
        onSave={handleSaveEdit}
      />

      <CustomerPaymentModal
        open={paymentCustomer !== null}
        customer={paymentCustomer}
        creditDue={paymentCustomer ? customerCreditDue(paymentCustomer) : 0}
        onClose={() => setPaymentCustomer(null)}
        onSave={handleRecordCustomerPayment}
      />

      <SupplierPaymentModal
        open={paymentSupplier !== null}
        supplier={paymentSupplier}
        balanceDue={
          paymentSupplier ? supplierBalanceDue(paymentSupplier, supplierPayments) : 0
        }
        advanceRemaining={
          paymentSupplier ? supplierAdvanceRemaining(paymentSupplier, supplierPayments) : 0
        }
        onClose={() => setPaymentSupplier(null)}
        onSave={handleRecordPayment}
      />

      <PaymentHistoryModal
        open={historyContact !== null}
        contact={historyContact}
        contactKind={historyKind}
        payments={
          historyContact
            ? historyKind === "supplier"
              ? toSupplierHistoryPayments(
                  supplierLedgerWithBalance(
                    historyContact,
                    purchases,
                    supplierPayments,
                    purchaseReturns,
                  ),
                )
              : toHistoryPayments(
                  customerPaymentsFor(customerPayments, historyContact.id),
                )
            : []
        }
        onClose={() => setHistoryContact(null)}
      />
    </div>
  );
}
