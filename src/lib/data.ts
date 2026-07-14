import type { Business, Contact, JournalEntry, MonthlyClose, Office, OfficeAsset, OfficeExpense, Product, ProductOffer, Purchase, PurchaseItem, PurchaseReturn, Quotation, RateMaster, Sale, SalesReturn, StaffMember, CustomerPayment, SupplierPayment, UserRole } from "../types";
import { STORAGE_KEYS, storageGet, storageSet, storageSetMany } from "./storage";
import { normalizePurchaseItemName, productMatchKey, resolveSaleCreditDetails, roundMoney, stockStatus, isLowStock, formatCurrency } from "./constants";
import {
  baseQtyFromSaleItem,
  costPerBaseFromPurchaseLine,
  DEFAULT_BASE_UOM,
  normalizePurchaseItemUom,
  purchaseItemBaseQty,
  retailPricePerBaseFromPurchaseLine,
  usesAlternatePurchaseUom,
  wholesalePricePerPurchaseUomFromPurchaseLine,
  weightedAverageCostPerBase,
} from "./inventoryUom";
import { normalizeRateMasterEntry, normalizeRateMasterUnits } from "./rateMaster";
import { normalizeProductOffer } from "./productOffer";
import { normalizeQuotation } from "./quotation";
import { recordAudit } from "./audit";
import {
  applyCustomerSettlement,
  applyPurchaseReturnStock,
  applySalesReturnStock,
  applySupplierPurchaseReturn,
  createSalesReturnRecord,
  purchaseReturnItemsFromSalesReturn,
  salesReturnItemsFromDraft,
  type SalesReturnDraftLine,
} from "./returns";
import { reverseLoyaltyForReturn } from "./loyalty";
import type { SalesReturnReason, SalesReturnSettlement } from "../types";

async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await storageGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function saveJson<T>(key: string, value: T): Promise<void> {
  await storageSet(key, JSON.stringify(value));
}

/** Atomically persist several JSON documents in one storage transaction. */
export async function saveJsonBatch(
  entries: Array<{ key: string; value: unknown }>,
): Promise<void> {
  await storageSetMany(
    entries.map((entry) => ({
      key: entry.key,
      value: JSON.stringify(entry.value),
    })),
  );
}

type LegacyPurchaseItem = Purchase["items"][number] & {
  shippingCharge?: number;
  sellingPrice?: number;
};
type LegacyPurchase = Omit<Purchase, "shippingCharge" | "items"> & {
  shippingCharge?: number;
  items: LegacyPurchaseItem[];
};

function purchaseItemForInventory(item: PurchaseItem | LegacyPurchaseItem): PurchaseItem {
  const { sellingPrice: _legacy, shippingCharge: _shipping, ...withoutLegacy } =
    item as LegacyPurchaseItem;
  return normalizePurchaseItemUom(withoutLegacy);
}

function normalizePurchase(raw: LegacyPurchase): Purchase {
  let shippingCharge = raw.shippingCharge ?? 0;
  const items = raw.items.map((item) => {
    const legacyShipping = item.shippingCharge ?? 0;
    if (raw.shippingCharge === undefined && legacyShipping > 0) {
      const qty = item.quantity > 0 ? item.quantity : 1;
      shippingCharge += legacyShipping * qty;
    }
    return purchaseItemForInventory(item);
  });
  return { ...raw, shippingCharge, items };
}

export async function getProducts(): Promise<Product[]> {
  const data = await loadJson<Product[] | null>(STORAGE_KEYS.products, null);
  if (!data) {
    return [];
  }

  const purchases = await loadJson<Purchase[] | null>(STORAGE_KEYS.purchases, null);
  const normalizedPurchases = purchases?.map(normalizePurchase) ?? [];

  let products = data.map((product) => ({
    ...product,
    price: roundMoney(product.price),
    costPrice: product.costPrice != null ? roundMoney(product.costPrice) : undefined,
    wholesalePrice:
      product.wholesalePrice != null ? roundMoney(product.wholesalePrice) : undefined,
    status: stockStatus(product.stock, product.lowStockThreshold),
  }));

  const reconciled = reconcileProductPricesFromPurchases(products, normalizedPurchases);
  if (reconciled.changed) {
    await saveProducts(reconciled.products);
    return reconciled.products;
  }

  return products;
}

/** Keep product.price aligned with the latest received purchase line retail price. */
export function reconcileProductPricesFromPurchases(
  products: Product[],
  purchases: Purchase[],
): { products: Product[]; changed: boolean } {
  const latestRetailByKey = new Map<string, { retail: number; purchaseDate: string; purchaseId: string }>();

  for (const purchase of purchases) {
    if (purchase.status !== "received") continue;

    for (const item of purchase.items) {
      const normalized = purchaseItemForInventory(item);
      if (normalized.retailSellingPrice <= 0) continue;

      const key = productMatchKey(normalized.name, normalized.category);
      const retail = roundMoney(normalized.retailSellingPrice);
      const existing = latestRetailByKey.get(key);
      const isNewer =
        !existing ||
        purchase.purchaseDate > existing.purchaseDate ||
        (purchase.purchaseDate === existing.purchaseDate && purchase.id > existing.purchaseId);

      if (isNewer) {
        latestRetailByKey.set(key, {
          retail,
          purchaseDate: purchase.purchaseDate,
          purchaseId: purchase.id,
        });
      }
    }
  }

  let changed = false;
  const next = products.map((product) => {
    const latest = latestRetailByKey.get(productMatchKey(product.name, product.category));
    if (!latest || latest.retail === roundMoney(product.price)) {
      return product;
    }
    changed = true;
    return { ...product, price: latest.retail };
  });

  return { products: next, changed };
}

export async function saveProducts(products: Product[]): Promise<void> {
  await saveJson(STORAGE_KEYS.products, products);
}

export async function getRateMasters(): Promise<RateMaster[]> {
  const data = await loadJson<RateMaster[] | null>(STORAGE_KEYS.rateMasters, null);
  if (!data) return [];
  return data.map((entry) => normalizeRateMasterEntry(entry));
}

export async function saveRateMasters(entries: RateMaster[]): Promise<void> {
  await saveJson(
    STORAGE_KEYS.rateMasters,
    entries.map((entry) => {
      const normalized = normalizeRateMasterEntry(entry);
      return {
        ...normalized,
        productName: normalized.productName.trim(),
        category: normalized.category.trim(),
        brand: normalized.brand.trim(),
        sku: normalized.sku.trim(),
        units: normalizeRateMasterUnits(normalized.units),
        notes: normalized.notes?.trim() || undefined,
      };
    }),
  );
}

export async function getProductOffers(): Promise<ProductOffer[]> {
  const data = await loadJson<ProductOffer[] | null>(STORAGE_KEYS.productOffers, null);
  if (!data) return [];
  return data.map((entry) =>
    normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>),
  );
}

export async function saveProductOffers(offers: ProductOffer[]): Promise<void> {
  await saveJson(
    STORAGE_KEYS.productOffers,
    offers.map((entry) =>
      normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>),
    ),
  );
}

export async function getQuotations(): Promise<Quotation[]> {
  const data = await loadJson<Quotation[] | null>(STORAGE_KEYS.quotations, null);
  if (!data) return [];
  return data.map((entry) =>
    normalizeQuotation(entry as Partial<Quotation> & Record<string, unknown>),
  );
}

export async function saveQuotations(quotations: Quotation[]): Promise<void> {
  await saveJson(
    STORAGE_KEYS.quotations,
    quotations.map((entry) =>
      normalizeQuotation(entry as Partial<Quotation> & Record<string, unknown>),
    ),
  );
}

export async function getSalesReturns(): Promise<SalesReturn[]> {
  return loadJson(STORAGE_KEYS.salesReturns, []);
}

export async function saveSalesReturns(returns: SalesReturn[]): Promise<void> {
  await saveJson(STORAGE_KEYS.salesReturns, returns);
}

export async function getPurchaseReturns(): Promise<PurchaseReturn[]> {
  return loadJson(STORAGE_KEYS.purchaseReturns, []);
}

export async function savePurchaseReturns(returns: PurchaseReturn[]): Promise<void> {
  await saveJson(STORAGE_KEYS.purchaseReturns, returns);
}

export async function getSales(): Promise<Sale[]> {
  const data = await loadJson<Sale[] | null>(STORAGE_KEYS.sales, null);
  return data ?? [];
}

export async function saveSales(sales: Sale[]): Promise<void> {
  await saveJson(STORAGE_KEYS.sales, sales);
}

export async function getPurchases(): Promise<Purchase[]> {
  const data = await loadJson<LegacyPurchase[] | null>(STORAGE_KEYS.purchases, null);
  if (!data) {
    return [];
  }
  const suppliers = await getSuppliers();
  const normalized = data.map(normalizePurchase);
  const migrated = migratePurchaseSupplierIds(normalized, suppliers);
  const supplierChanged = migrated.some(
    (purchase, index) => purchase.supplierId !== normalized[index]?.supplierId,
  );
  if (supplierChanged || purchasesNeedPersist(data, migrated)) {
    await saveJson(STORAGE_KEYS.purchases, migrated);
  }
  return migrated;
}

function purchasesNeedPersist(raw: LegacyPurchase[], _migrated: Purchase[]): boolean {
  return raw.some((purchase) =>
    purchase.items.some((item) => {
      const legacyItem = item as LegacyPurchaseItem & { retailSellingPrice?: number };
      return legacyItem.sellingPrice != null || legacyItem.retailSellingPrice == null;
    }),
  );
}

export async function savePurchases(purchases: Purchase[]): Promise<void> {
  await saveJson(STORAGE_KEYS.purchases, purchases);
}

export async function getCustomers(): Promise<Contact[]> {
  const data = await loadJson<Contact[] | null>(STORAGE_KEYS.customers, null);
  if (!data) {
    return [];
  }
  return data.map((c) => ({ ...c, countryCode: c.countryCode ?? "" }));
}

export async function saveCustomers(customers: Contact[]): Promise<void> {
  await saveJson(STORAGE_KEYS.customers, customers);
}

export async function getSuppliers(): Promise<Contact[]> {
  const data = await loadJson<Contact[] | null>(STORAGE_KEYS.suppliers, null);
  return data ?? [];
}

export async function saveSuppliers(suppliers: Contact[]): Promise<void> {
  await saveJson(STORAGE_KEYS.suppliers, suppliers);
}

export async function getStaff(): Promise<StaffMember[]> {
  return loadJson(STORAGE_KEYS.staff, []);
}

export async function saveStaff(staff: StaffMember[]): Promise<void> {
  await saveJson(STORAGE_KEYS.staff, staff);
}

export async function ensureStaffSeed(admin: Business) {
  const staff = await getStaff();
  if (staff.length === 0) {
    const seed: StaffMember = {
      id: nextId("USR", []),
      name: admin.username,
      username: admin.username,
      email: admin.email,
      role: "Admin",
      password: admin.password,
    };
    await saveStaff([seed]);
  }
}

export async function getOffices(): Promise<Office[]> {
  return loadJson(STORAGE_KEYS.offices, []);
}

export async function saveOffices(offices: Office[]): Promise<void> {
  await saveJson(STORAGE_KEYS.offices, offices);
}

export async function getOfficeExpenses(): Promise<OfficeExpense[]> {
  return loadJson(STORAGE_KEYS.officeExpenses, []);
}

export async function saveOfficeExpenses(expenses: OfficeExpense[]): Promise<void> {
  await saveJson(STORAGE_KEYS.officeExpenses, expenses);
}

export async function getOfficeAssets(): Promise<OfficeAsset[]> {
  return loadJson(STORAGE_KEYS.officeAssets, []);
}

export async function saveOfficeAssets(assets: OfficeAsset[]): Promise<void> {
  await saveJson(STORAGE_KEYS.officeAssets, assets);
}

export function nextId(prefix: string, items: { id: string }[]): string {
  const max = items.reduce((acc, item) => {
    const match = item.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(acc, Number.parseInt(match[1], 10)) : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function supplierNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function purchaseMatchesSupplier(purchase: Purchase, supplier: Contact): boolean {
  if (purchase.supplierId) return purchase.supplierId === supplier.id;
  return supplierNameKey(purchase.supplierName) === supplierNameKey(supplier.name);
}

function migratePurchaseSupplierIds(purchases: Purchase[], suppliers: Contact[]): Purchase[] {
  return purchases.map((purchase) => {
    if (purchase.supplierId) return purchase;
    const match = suppliers.find(
      (supplier) => supplierNameKey(supplier.name) === supplierNameKey(purchase.supplierName),
    );
    return match ? { ...purchase, supplierId: match.id } : purchase;
  });
}

export function ensureSupplierInList(suppliers: Contact[], supplierName: string): Contact[] {
  const trimmed = supplierName.trim();
  if (!trimmed) return suppliers;
  const key = supplierNameKey(trimmed);
  if (suppliers.some((supplier) => supplierNameKey(supplier.name) === key)) {
    return suppliers;
  }
  return [
    {
      id: nextId("SUP", suppliers),
      name: trimmed,
      countryCode: "",
      phone: "",
      email: "",
      address: "",
      creditBalance: 0,
    },
    ...suppliers,
  ];
}

export function resolveSupplierForPurchase(
  suppliers: Contact[],
  supplierName: string,
  preferredId?: string,
): { suppliers: Contact[]; supplierId: string } {
  const trimmed = supplierName.trim();
  if (!trimmed) {
    return { suppliers, supplierId: preferredId ?? "" };
  }

  if (preferredId && suppliers.some((supplier) => supplier.id === preferredId)) {
    return { suppliers, supplierId: preferredId };
  }

  const match = suppliers.find(
    (supplier) => supplierNameKey(supplier.name) === supplierNameKey(trimmed),
  );
  if (match) {
    return { suppliers, supplierId: match.id };
  }

  const next = ensureSupplierInList(suppliers, trimmed);
  const created = next.find(
    (supplier) => supplierNameKey(supplier.name) === supplierNameKey(trimmed),
  );
  return { suppliers: next, supplierId: created?.id ?? "" };
}

export function syncSupplierCredits(suppliers: Contact[], purchases: Purchase[]): Contact[] {
  const purchaseCredits = new Map<string, number>();
  for (const purchase of purchases) {
    if (purchase.status === "cancelled") continue;
    const supplier = suppliers.find((entry) => purchaseMatchesSupplier(purchase, entry));
    if (!supplier) continue;
    purchaseCredits.set(
      supplier.id,
      (purchaseCredits.get(supplier.id) ?? 0) + purchase.total,
    );
  }
  return suppliers.map((supplier) => {
    const fromPurchases = purchaseCredits.get(supplier.id) ?? 0;
    return {
      ...supplier,
      creditBalance: supplierOpeningCredit(supplier) + fromPurchases,
    };
  });
}

export function supplierOpeningCredit(supplier: Contact): number {
  if (supplier.openingBalanceType === "advance") return 0;
  return supplier.openingBalance ?? 0;
}

export function supplierOpeningAdvance(supplier: Contact): number {
  if (supplier.openingBalanceType === "advance") return supplier.openingBalance ?? 0;
  return 0;
}

export function supplierNetBalance(supplier: Contact, payments: SupplierPayment[]): number {
  const payable = supplier.creditBalance ?? 0;
  const advance = supplierOpeningAdvance(supplier);
  const paid = supplierTotalPaid(payments, supplier.id);
  return payable - advance - paid;
}

export async function getSupplierPayments(): Promise<SupplierPayment[]> {
  return loadJson(STORAGE_KEYS.supplierPayments, []);
}

export async function saveSupplierPayments(payments: SupplierPayment[]): Promise<void> {
  await saveJson(STORAGE_KEYS.supplierPayments, payments);
}

export function supplierPaymentsFor(
  payments: SupplierPayment[],
  supplierId: string,
): SupplierPayment[] {
  return payments
    .filter((payment) => payment.supplierId === supplierId)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
}

export type SupplierLedgerEntry = {
  kind: "payment" | "purchase" | "purchase_return";
  id: string;
  date: string;
  /** Cash paid (payment), purchase bill, or purchase-return debit total. */
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  notes?: string;
  balanceAfter: number;
  /** For payments: portion that created advance (overpayment). */
  advancePaid: number;
  /** For purchases: advance applied against this bill. */
  advanceApplied: number;
  advanceAfter: number;
  invoiceNo?: string;
};

/**
 * Full supplier ledger: opening → purchases, payments & purchase returns in date order.
 */
export function supplierLedgerWithBalance(
  supplier: Contact,
  purchases: Purchase[],
  payments: SupplierPayment[],
  purchaseReturns: PurchaseReturn[] = [],
): SupplierLedgerEntry[] {
  const supplierPurchases = purchases.filter(
    (purchase) => purchase.status !== "cancelled" && purchaseMatchesSupplier(purchase, supplier),
  );
  const supplierPays = supplierPaymentsFor(payments, supplier.id);
  const supplierReturnDocs = purchaseReturns.filter(
    (entry) =>
      entry.status === "completed" &&
      ((supplier.id && entry.supplierId === supplier.id) ||
        entry.supplierName.trim().toLowerCase() === supplier.name.trim().toLowerCase()),
  );

  type LedgerEvent =
    | { kind: "purchase"; date: string; sortId: string; amount: number; purchase: Purchase }
    | { kind: "payment"; date: string; sortId: string; amount: number; payment: SupplierPayment }
    | {
        kind: "purchase_return";
        date: string;
        sortId: string;
        amount: number;
        purchaseReturn: PurchaseReturn;
      };

  const events: LedgerEvent[] = [
    ...supplierPurchases.map((purchase) => ({
      kind: "purchase" as const,
      date: purchase.purchaseDate,
      sortId: purchase.id,
      amount: purchase.total,
      purchase,
    })),
    ...supplierPays.map((payment) => ({
      kind: "payment" as const,
      date: payment.paymentDate,
      sortId: payment.id,
      amount: payment.amount,
      payment,
    })),
    ...supplierReturnDocs.map((purchaseReturn) => ({
      kind: "purchase_return" as const,
      date: purchaseReturn.returnDate,
      sortId: purchaseReturn.id,
      amount: purchaseReturn.total,
      purchaseReturn,
    })),
  ].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    const rank = (kind: LedgerEvent["kind"]) =>
      kind === "purchase" ? 0 : kind === "payment" ? 1 : 2;
    const byKind = rank(a.kind) - rank(b.kind);
    if (byKind !== 0) return byKind;
    return a.sortId.localeCompare(b.sortId);
  });

  let net = supplierOpeningCredit(supplier) - supplierOpeningAdvance(supplier);
  const result: SupplierLedgerEntry[] = [];

  for (const event of events) {
    if (event.kind === "purchase") {
      const advanceBefore = Math.max(0, -net);
      const advanceApplied = Math.min(advanceBefore, event.amount);
      net += event.amount;
      const invoice = event.purchase.invoiceNo?.trim() || event.purchase.id;
      result.push({
        kind: "purchase",
        id: event.purchase.id,
        date: event.date,
        amount: event.amount,
        paymentMode: "Purchase",
        paymentReference: invoice,
        notes:
          advanceApplied > 0
            ? `Advance adjusted ${formatCurrency(advanceApplied)} against purchase ${invoice}`
            : `Purchase ${invoice}`,
        balanceAfter: Math.max(0, net),
        advancePaid: 0,
        advanceApplied,
        advanceAfter: Math.max(0, -net),
        invoiceNo: invoice,
      });
      continue;
    }

    if (event.kind === "purchase_return") {
      net -= event.amount;
      const debit = event.purchaseReturn.debitNoteNo?.trim() || event.purchaseReturn.id;
      result.push({
        kind: "purchase_return",
        id: event.purchaseReturn.id,
        date: event.date,
        amount: event.amount,
        paymentMode: "Purchase return",
        paymentReference: debit,
        notes: event.purchaseReturn.notes?.trim()
          || `Debit note ${debit}${event.purchaseReturn.salesReturnId ? ` · from ${event.purchaseReturn.salesReturnId}` : ""}`,
        balanceAfter: Math.max(0, net),
        advancePaid: 0,
        advanceApplied: 0,
        advanceAfter: Math.max(0, -net),
        invoiceNo: debit,
      });
      continue;
    }

    const balanceDueBefore = Math.max(0, net);
    const advancePaid = Math.max(0, event.amount - balanceDueBefore);
    net -= event.amount;
    result.push({
      kind: "payment",
      id: event.payment.id,
      date: event.date,
      amount: event.amount,
      paymentMode: event.payment.paymentMode,
      paymentReference: event.payment.paymentReference,
      notes: event.payment.notes,
      balanceAfter: Math.max(0, net),
      advancePaid,
      advanceApplied: 0,
      advanceAfter: Math.max(0, -net),
    });
  }

  return result;
}

/** Payment-only rows (legacy); prefer supplierLedgerWithBalance for UI history. */
export function supplierPaymentsWithBalance(
  supplier: Contact,
  purchases: Purchase[],
  payments: SupplierPayment[],
): Array<{ payment: SupplierPayment; balanceAfter: number; advancePaid: number; advanceAfter: number }> {
  return supplierLedgerWithBalance(supplier, purchases, payments)
    .filter((row) => row.kind === "payment")
    .map((row) => {
      const payment = payments.find((entry) => entry.id === row.id);
      if (!payment) {
        return {
          payment: {
            id: row.id,
            supplierId: supplier.id,
            supplierName: supplier.name,
            paymentDate: row.date,
            paymentMode: row.paymentMode,
            paymentReference: row.paymentReference,
            amount: row.amount,
            balanceAfter: row.balanceAfter,
            notes: row.notes,
          },
          balanceAfter: row.balanceAfter,
          advancePaid: row.advancePaid,
          advanceAfter: row.advanceAfter,
        };
      }
      return {
        payment,
        balanceAfter: row.balanceAfter,
        advancePaid: row.advancePaid,
        advanceAfter: row.advanceAfter,
      };
    });
}

export function supplierTotalPaid(payments: SupplierPayment[], supplierId: string): number {
  return supplierPaymentsFor(payments, supplierId).reduce((sum, payment) => sum + payment.amount, 0);
}

export function supplierBalanceDue(supplier: Contact, payments: SupplierPayment[]): number {
  return Math.max(0, supplierNetBalance(supplier, payments));
}

export function supplierAdvanceRemaining(supplier: Contact, payments: SupplierPayment[]): number {
  return Math.max(0, -supplierNetBalance(supplier, payments));
}

export async function getCustomerPayments(): Promise<CustomerPayment[]> {
  return loadJson(STORAGE_KEYS.customerPayments, []);
}

export async function saveCustomerPayments(payments: CustomerPayment[]): Promise<void> {
  await saveJson(STORAGE_KEYS.customerPayments, payments);
}

export function customerPaymentsFor(
  payments: CustomerPayment[],
  customerId: string,
): CustomerPayment[] {
  return payments
    .filter((payment) => payment.customerId === customerId)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
}

export function customerTotalPaid(payments: CustomerPayment[], customerId: string): number {
  return customerPaymentsFor(payments, customerId).reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
}

export function customerCreditDue(customer: Contact): number {
  return Math.max(0, customer.creditBalance ?? 0);
}

export function customerPaymentsWithBalance(
  customer: Contact,
  payments: CustomerPayment[],
): Array<{ payment: CustomerPayment; balanceAfter: number }> {
  const customerPays = customerPaymentsFor(payments, customer.id);
  let running = customerCreditDue(customer) + customerTotalPaid(payments, customer.id);
  const result: Array<{ payment: CustomerPayment; balanceAfter: number }> = [];

  for (const payment of customerPays) {
    running -= payment.amount;
    result.push({
      payment,
      balanceAfter: Math.max(0, running),
    });
  }

  return result;
}

export type SaleCreditSettlement = {
  payment: CustomerPayment;
  amountApplied: number;
};

export type SaleCreditPaymentContext = {
  amountPaidAtSale: number;
  amountCreditAtSale: number;
  partialPaymentMode?: string;
  paymentReference?: string;
  settlements: SaleCreditSettlement[];
  outstanding: number;
};

export function saleCreditPaymentContext(
  sale: Sale,
  sales: Sale[],
  customerPayments: CustomerPayment[],
): SaleCreditPaymentContext | null {
  const credit = resolveSaleCreditDetails(sale);
  if (!credit || credit.amountCredit <= 0 || !sale.customerId) return null;

  const customerCreditSales = sales
    .filter((entry) => {
      if (entry.status === "cancelled" || entry.customerId !== sale.customerId) return false;
      return (resolveSaleCreditDetails(entry)?.amountCredit ?? 0) > 0;
    })
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.id.localeCompare(b.id));

  const payments = customerPaymentsFor(customerPayments, sale.customerId);
  const saleBalances = new Map<string, number>();

  for (const entry of customerCreditSales) {
    const entryCredit = resolveSaleCreditDetails(entry);
    if (entryCredit) {
      saleBalances.set(entry.id, entryCredit.amountCredit);
    }
  }

  const settlements: SaleCreditSettlement[] = [];

  for (const payment of payments) {
    let remaining = payment.amount;
    for (const entry of customerCreditSales) {
      if (remaining <= 0) break;
      const balance = saleBalances.get(entry.id) ?? 0;
      if (balance <= 0) continue;
      const applied = Math.min(remaining, balance);
      saleBalances.set(entry.id, balance - applied);
      remaining -= applied;
      if (entry.id === sale.id && applied > 0) {
        settlements.push({ payment, amountApplied: applied });
      }
    }
  }

  return {
    amountPaidAtSale: credit.amountPaid,
    amountCreditAtSale: credit.amountCredit,
    partialPaymentMode: credit.partialPaymentMode,
    paymentReference: credit.paymentReference,
    settlements,
    outstanding: Math.max(0, saleBalances.get(sale.id) ?? credit.amountCredit),
  };
}

export type CustomerPaymentSaleAllocation = {
  saleId: string;
  amountApplied: number;
  outstandingAfter: number;
};

function customerCreditSalesFor(customerId: string, sales: Sale[]): Sale[] {
  return sales
    .filter((entry) => {
      if (entry.status === "cancelled" || entry.customerId !== customerId) return false;
      return (resolveSaleCreditDetails(entry)?.amountCredit ?? 0) > 0;
    })
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.id.localeCompare(b.id));
}

function applyCustomerPaymentToSaleBalances(
  paymentAmount: number,
  customerCreditSales: Sale[],
  saleBalances: Map<string, number>,
  record?: (saleId: string, amountApplied: number, outstandingAfter: number) => void,
): void {
  let remaining = paymentAmount;
  for (const entry of customerCreditSales) {
    if (remaining <= 0) break;
    const balance = saleBalances.get(entry.id) ?? 0;
    if (balance <= 0) continue;
    const applied = Math.min(remaining, balance);
    const outstandingAfter = balance - applied;
    saleBalances.set(entry.id, outstandingAfter);
    remaining -= applied;
    if (applied > 0) {
      record?.(entry.id, applied, outstandingAfter);
    }
  }
}

/** FIFO allocation of a customer payment against credit sales (invoice numbers = sale ids). */
export function customerPaymentSaleAllocations(
  payment: CustomerPayment,
  sales: Sale[],
  customerPayments: CustomerPayment[],
): CustomerPaymentSaleAllocation[] {
  const customerCreditSales = customerCreditSalesFor(payment.customerId, sales);
  const saleBalances = new Map<string, number>();
  for (const entry of customerCreditSales) {
    const entryCredit = resolveSaleCreditDetails(entry);
    if (entryCredit) {
      saleBalances.set(entry.id, entryCredit.amountCredit);
    }
  }

  const sortedPayments = [...customerPaymentsFor(customerPayments, payment.customerId)].sort(
    (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id),
  );

  const allocations: CustomerPaymentSaleAllocation[] = [];

  for (const entry of sortedPayments) {
    if (entry.id === payment.id) {
      applyCustomerPaymentToSaleBalances(
        payment.amount,
        customerCreditSales,
        saleBalances,
        (saleId, amountApplied, outstandingAfter) => {
          allocations.push({ saleId, amountApplied, outstandingAfter });
        },
      );
      break;
    }
    applyCustomerPaymentToSaleBalances(entry.amount, customerCreditSales, saleBalances);
  }

  return allocations;
}

export function purchaseTotal(
  items: Purchase["items"],
  hasGst: boolean,
  shippingCharge = 0,
): number {
  const itemsTotal = items.reduce((sum, item) => {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const gst = hasGst ? item.costPrice * (item.gstPercent / 100) : 0;
    return sum + (item.costPrice + gst) * qty;
  }, 0);
  return itemsTotal + shippingCharge;
}

function findProductForPurchaseItem(products: Product[], item: PurchaseItem): Product | undefined {
  const key = productMatchKey(item.name, item.category);
  return products.find((p) => productMatchKey(p.name, p.category) === key);
}

function applyPurchaseItemToProduct(product: Product, item: PurchaseItem, addQty: number): Product {
  const normalizedItem = purchaseItemForInventory(item);
  const qty = addQty > 0 ? addQty : normalizedItem.quantity > 0 ? normalizedItem.quantity : 1;
  const baseQtyReceived = purchaseItemBaseQty(normalizedItem, qty);
  const incomingCostPerBase = costPerBaseFromPurchaseLine(
    normalizedItem.costPrice,
    normalizedItem.conversionFactor,
  );
  const newStock = product.stock + baseQtyReceived;
  const newCostPerBase = weightedAverageCostPerBase(
    product.stock,
    product.costPrice,
    baseQtyReceived,
    incomingCostPerBase,
  );

  const alternateUom = usesAlternatePurchaseUom(normalizedItem);

  return {
    ...product,
    name: normalizePurchaseItemName(normalizedItem.name),
    category: normalizedItem.category,
    brand: normalizedItem.brand,
    ...(normalizedItem.sku?.trim() ? { sku: normalizedItem.sku.trim() } : {}),
    price: retailPricePerBaseFromPurchaseLine(normalizedItem.retailSellingPrice),
    ...(alternateUom && normalizedItem.wholesaleSellingPrice > 0
      ? {
          wholesalePrice: wholesalePricePerPurchaseUomFromPurchaseLine(
            normalizedItem.wholesaleSellingPrice,
          ),
          wholesaleConversionFactor: normalizedItem.conversionFactor,
        }
      : {
          wholesalePrice: undefined,
          wholesaleConversionFactor: undefined,
        }),
    costPrice: newCostPerBase,
    stock: newStock,
    status: stockStatus(newStock, product.lowStockThreshold),
    hasSpecification: normalizedItem.hasSpecification,
    specification: normalizedItem.specification,
    baseUom: product.baseUom ?? normalizedItem.baseUom ?? (
      usesAlternatePurchaseUom(normalizedItem) ? DEFAULT_BASE_UOM : (normalizedItem.uom ?? DEFAULT_BASE_UOM)
    ),
    ...(normalizedItem.gstPercent != null && normalizedItem.gstPercent > 0
      ? { gstPercent: normalizedItem.gstPercent }
      : {}),
  };
}

function removeOrphanZeroStockProducts(products: Product[]): Product[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = productMatchKey(product.name, product.category);
    const list = groups.get(key) ?? [];
    list.push(product);
    groups.set(key, list);
  }

  const removeIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const keeper =
      group.find((product) => product.stock > 0) ??
      group.reduce((best, product) => (product.id < best.id ? product : best));
    for (const product of group) {
      if (product.id !== keeper.id && product.stock === 0) {
        removeIds.add(product.id);
      }
    }
  }

  return products.filter((product) => !removeIds.has(product.id));
}

export function mergePurchaseIntoProducts(
  products: Product[],
  purchase: Purchase,
): Product[] {
  let next = [...products];
  for (const item of purchase.items) {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const existing = findProductForPurchaseItem(next, item);
    if (existing) {
      next = next.map((p) =>
        p.id === existing.id ? applyPurchaseItemToProduct(p, item, qty) : p,
      );
    } else {
      const normalizedItem = purchaseItemForInventory(item);
      const normalizedName = normalizePurchaseItemName(normalizedItem.name);
      const baseQtyReceived = purchaseItemBaseQty(normalizedItem, qty);
      const id = nextId("PRD", next);
      next.unshift({
        id,
        name: normalizedName,
        category: normalizedItem.category,
        brand: normalizedItem.brand,
        sku:
          normalizedItem.sku?.trim() ||
          `${normalizedItem.brand.slice(0, 3).toUpperCase() || "PRD"}-01`,
        price: retailPricePerBaseFromPurchaseLine(normalizedItem.retailSellingPrice),
        ...(usesAlternatePurchaseUom(normalizedItem) && normalizedItem.wholesaleSellingPrice > 0
          ? {
              wholesalePrice: wholesalePricePerPurchaseUomFromPurchaseLine(
                normalizedItem.wholesaleSellingPrice,
              ),
              wholesaleConversionFactor: normalizedItem.conversionFactor,
            }
          : {}),
        costPrice: costPerBaseFromPurchaseLine(
          normalizedItem.costPrice,
          normalizedItem.conversionFactor,
        ),
        stock: baseQtyReceived,
        status: stockStatus(baseQtyReceived),
        image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(normalizedName)}`,
        hasSpecification: normalizedItem.hasSpecification,
        specification: normalizedItem.specification,
        baseUom:
          normalizedItem.baseUom ??
          (usesAlternatePurchaseUom(normalizedItem)
            ? DEFAULT_BASE_UOM
            : (normalizedItem.uom ?? DEFAULT_BASE_UOM)),
        ...(normalizedItem.gstPercent != null && normalizedItem.gstPercent > 0
          ? { gstPercent: normalizedItem.gstPercent }
          : {}),
      });
    }
  }
  return next;
}

export function reversePurchaseFromProducts(
  products: Product[],
  purchase: Purchase,
): Product[] {
  let next = [...products];
  for (const item of purchase.items) {
    const qty = item.quantity > 0 ? item.quantity : 1;
    const existing = findProductForPurchaseItem(next, item);
    if (!existing) continue;

    const baseQty = purchaseItemBaseQty(normalizePurchaseItemUom(item), qty);
    const newStock = Math.max(0, existing.stock - baseQty);
    next = next.map((p) =>
      p.id === existing.id
        ? {
            ...p,
            stock: newStock,
            status: stockStatus(newStock, p.lowStockThreshold),
          }
        : p,
    );
  }
  return next;
}

export function updateProductsFromPurchaseEdit(
  products: Product[],
  oldPurchase: Purchase,
  newPurchase: Purchase,
): Product[] {
  const productIdsByOldIndex = oldPurchase.items.map(
    (item) => findProductForPurchaseItem(products, item)?.id,
  );

  let next = reversePurchaseFromProducts(products, oldPurchase);

  for (let i = 0; i < newPurchase.items.length; i++) {
    const item = newPurchase.items[i];
    const qty = item.quantity > 0 ? item.quantity : 1;
    const priorProductId = productIdsByOldIndex[i];
    let existing = priorProductId ? next.find((p) => p.id === priorProductId) : undefined;
    if (!existing) {
      existing = findProductForPurchaseItem(next, item);
    }

    if (existing) {
      next = next.map((p) => (p.id === existing!.id ? applyPurchaseItemToProduct(p, item, qty) : p));
    } else {
      next = mergePurchaseIntoProducts(next, { ...newPurchase, items: [item] });
    }
  }

  return removeOrphanZeroStockProducts(next);
}

export async function getAccountingJournal(): Promise<JournalEntry[]> {
  return loadJson(STORAGE_KEYS.accountingJournal, []);
}

export async function saveAccountingJournal(entries: JournalEntry[]): Promise<void> {
  await saveJson(STORAGE_KEYS.accountingJournal, entries);
}

export async function getMonthlyCloses(): Promise<MonthlyClose[]> {
  return loadJson(STORAGE_KEYS.accountingCloses, []);
}

export async function saveMonthlyCloses(closes: MonthlyClose[]): Promise<void> {
  await saveJson(STORAGE_KEYS.accountingCloses, closes);
}

export function getLowStockProducts(products: Product[]): Product[] {
  return products
    .filter((product) => isLowStock(product))
    .sort((a, b) => a.stock - b.stock);
}

export type StockAdjustReason = "stocktake" | "damage" | "theft" | "other";

export async function adjustProductStock(params: {
  productId: string;
  delta: number;
  audit?: {
    username: string;
    reason: StockAdjustReason;
    note?: string;
  };
}): Promise<Product | null> {
  const products = await getProducts();
  const index = products.findIndex((product) => product.id === params.productId);
  if (index < 0) return null;

  const product = products[index];
  const newStock = Math.max(0, product.stock + params.delta);
  const updated: Product = {
    ...product,
    stock: newStock,
    status: stockStatus(newStock, product.lowStockThreshold),
  };
  const next = [...products];
  next[index] = updated;
  await saveProducts(next);

  if (params.audit) {
    const noteSuffix = params.audit.note?.trim() ? `:${params.audit.note.trim()}` : "";
    await recordAudit(
      params.audit.username,
      "stock_change",
      product.id,
      "success",
      `${params.audit.reason}:${params.delta > 0 ? "+" : ""}${params.delta}${noteSuffix}`,
    );
  }

  return updated;
}

export async function updateProductLowStockThreshold(
  productId: string,
  lowStockThreshold: number | null,
): Promise<Product | null> {
  const products = await getProducts();
  const index = products.findIndex((product) => product.id === productId);
  if (index < 0) return null;

  const product = products[index];
  const threshold = lowStockThreshold === null ? undefined : lowStockThreshold;
  const updated: Product = {
    ...product,
    lowStockThreshold: threshold,
    status: stockStatus(product.stock, threshold),
  };
  const next = [...products];
  next[index] = updated;
  await saveProducts(next);
  return updated;
}

export async function updateProductGstPercent(
  productId: string,
  gstPercent: number,
): Promise<Product | null> {
  const products = await getProducts();
  const index = products.findIndex((product) => product.id === productId);
  if (index < 0) return null;

  const rate = Math.min(100, Math.max(0, gstPercent));
  const updated: Product = {
    ...products[index],
    gstPercent: rate,
  };
  const next = [...products];
  next[index] = updated;
  await saveProducts(next);
  return updated;
}

export async function cancelSale(saleId: string): Promise<boolean> {
  const sales = await getSales();
  const sale = sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status === "cancelled") return false;

  let products = await getProducts();
  for (const item of sale.items) {
    if (item.productId === "MANUAL") continue;
    products = products.map((product) => {
      if (product.id !== item.productId) return product;
      const stock = product.stock + baseQtyFromSaleItem(item);
      return { ...product, stock, status: stockStatus(stock, product.lowStockThreshold) };
    });
  }
  await saveProducts(products);

  if (sale.customerId && (sale.amountCredit ?? 0) > 0) {
    const customers = await getCustomers();
    const updatedCustomers = customers.map((customer) =>
      customer.id === sale.customerId
        ? {
            ...customer,
            creditBalance: Math.max(0, (customer.creditBalance ?? 0) - (sale.amountCredit ?? 0)),
          }
        : customer,
    );
    await saveCustomers(updatedCustomers);
  }

  const updatedSales = sales.map((entry) =>
    entry.id === saleId ? { ...entry, status: "cancelled" as const } : entry,
  );
  await saveSales(updatedSales);
  return true;
}

export async function submitSalesReturn(input: {
  sale: Sale;
  draftLines: SalesReturnDraftLine[];
  reason: SalesReturnReason;
  settlement: SalesReturnSettlement;
  supplierLiable: boolean;
  notes?: string;
  returnDate: string;
  createdBy?: UserRole | string;
}): Promise<{ ok: true; salesReturn: SalesReturn } | { ok: false; error: string }> {
  const existingReturns = await getSalesReturns();
  const items = salesReturnItemsFromDraft(input.draftLines);
  if (!items) {
    return { ok: false, error: "Select at least one returnable line with a valid quantity." };
  }

  const salesReturn = createSalesReturnRecord({
    id: nextId("SRN", existingReturns),
    sale: input.sale,
    items,
    reason: input.reason,
    settlement: input.settlement,
    supplierLiable: input.supplierLiable,
    notes: input.notes,
    returnDate: input.returnDate,
    createdBy: input.createdBy ?? "Admin",
  });

  const products = await getProducts();
  const nextProducts = applySalesReturnStock(products, items);
  const customers = await getCustomers();
  let nextCustomers = applyCustomerSettlement(
    customers,
    input.sale.customerId,
    input.settlement,
    salesReturn.total,
  );
  nextCustomers = reverseLoyaltyForReturn(nextCustomers, input.sale, salesReturn.total);

  const batch: Array<{ key: string; value: unknown }> = [
    { key: STORAGE_KEYS.products, value: nextProducts },
    { key: STORAGE_KEYS.salesReturns, value: [salesReturn, ...existingReturns] },
  ];
  if (nextCustomers !== customers) {
    batch.push({ key: STORAGE_KEYS.customers, value: nextCustomers });
  }
  await saveJsonBatch(batch);
  return { ok: true, salesReturn };
}

export async function submitPurchaseReturnFromSalesReturn(input: {
  salesReturn: SalesReturn;
  supplierId?: string;
  supplierName: string;
  debitNoteNo: string;
  returnDate: string;
  notes?: string;
  createdBy?: UserRole | string;
}): Promise<{ ok: true; purchaseReturn: PurchaseReturn } | { ok: false; error: string }> {
  if (!input.salesReturn.supplierLiable) {
    return { ok: false, error: "This sales return is not marked supplier-liable." };
  }
  if (input.salesReturn.purchaseReturnId) {
    return { ok: false, error: "A purchase return already exists for this sales return." };
  }
  if (!input.supplierName.trim()) {
    return { ok: false, error: "Select or enter a supplier." };
  }
  if (!input.debitNoteNo.trim()) {
    return { ok: false, error: "Enter a debit note / return reference number." };
  }

  const products = await getProducts();
  const items = purchaseReturnItemsFromSalesReturn(input.salesReturn, products);
  const nextProducts = applyPurchaseReturnStock(products, items);
  if (!nextProducts) {
    return {
      ok: false,
      error: "Insufficient stock to return these items to the supplier.",
    };
  }

  const existing = await getPurchaseReturns();
  const purchaseReturn: PurchaseReturn = {
    id: nextId("PRN", existing),
    salesReturnId: input.salesReturn.id,
    supplierId: input.supplierId,
    supplierName: input.supplierName.trim(),
    returnDate: input.returnDate,
    debitNoteNo: input.debitNoteNo.trim(),
    notes: input.notes?.trim() || undefined,
    items,
    total: roundMoney(items.reduce((sum, item) => sum + item.total, 0)),
    status: "completed",
    createdBy: String(input.createdBy ?? "Admin"),
    createdAt: new Date().toISOString(),
  };

  const suppliers = await getSuppliers();
  const nextSuppliers = applySupplierPurchaseReturn(
    suppliers,
    input.supplierId,
    input.supplierName,
    purchaseReturn.total,
  );

  const salesReturns = await getSalesReturns();
  const nextSalesReturns = salesReturns.map((entry) =>
    entry.id === input.salesReturn.id
      ? {
          ...entry,
          status: "sent_to_supplier" as const,
          purchaseReturnId: purchaseReturn.id,
        }
      : entry,
  );

  await saveJsonBatch([
    { key: STORAGE_KEYS.products, value: nextProducts },
    { key: STORAGE_KEYS.purchaseReturns, value: [purchaseReturn, ...existing] },
    { key: STORAGE_KEYS.salesReturns, value: nextSalesReturns },
    { key: STORAGE_KEYS.suppliers, value: nextSuppliers },
  ]);

  return { ok: true, purchaseReturn };
}
