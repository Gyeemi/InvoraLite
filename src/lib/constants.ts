export const PURCHASE_ROLES = ["Admin", "Manager", "Store Keeper"] as const;

export const ALL_ROLES = ["Admin", "Manager", "Store Keeper", "Cashier", "Viewer"] as const;

export const DEFAULT_PRODUCT_CATEGORIES = ["Electronics", "Accessories"] as const;

/** @deprecated Use getCategories() for the live list; defaults only for first-run seeding. */
export const PRODUCT_CATEGORIES = DEFAULT_PRODUCT_CATEGORIES;

export const DEFAULT_PAYMENT_METHODS = ["Cash", "E-Payment", "Credit"] as const;

/** Free trial length shown on the licence gate and enforced in the Rust backend. */
export const LICENSE_TRIAL_DAYS = 60;

export const E_PAYMENT_PLATFORMS = [
  "mBoB",
  "mPay",
  "TPay",
  "Druk Pay",
  "DK Bank",
  "UPI",
] as const;

export type PaymentCategory = (typeof DEFAULT_PAYMENT_METHODS)[number];
export type PartialPaymentCategory = Exclude<PaymentCategory, "Credit">;
export type EPaymentPlatform = (typeof E_PAYMENT_PLATFORMS)[number];

export const CUSTOMER_PAYMENT_MODES = ["Cash", "E-Payment"] as const;
export type CustomerPaymentCategory = (typeof CUSTOMER_PAYMENT_MODES)[number];

export function resolveCustomerPaymentMode(
  category: CustomerPaymentCategory,
  platform: EPaymentPlatform,
): string {
  if (category === "Cash") return "Cash";
  return platform;
}

export function resolveSalePaymentMode(
  category: PaymentCategory,
  platform: EPaymentPlatform,
  credit?: {
    partialCategory?: PartialPaymentCategory;
    amountPaid?: number;
  },
): string {
  if (category === "Cash") return "Cash";
  if (category === "E-Payment") return platform;
  const amountPaid = credit?.amountPaid ?? 0;
  if (amountPaid <= 0) return "Credit";
  const partial =
    credit?.partialCategory === "E-Payment" ? platform : credit?.partialCategory ?? "Cash";
  return `Credit + ${partial}`;
}

export const SUPPLIER_PAYMENT_MODES = ["Cash", "E-Payment", "Bank Transfer", "Cheque"] as const;

export type SupplierPaymentCategory = (typeof SUPPLIER_PAYMENT_MODES)[number];

export function resolveSupplierPaymentMode(
  category: SupplierPaymentCategory,
  platform: EPaymentPlatform,
): string {
  if (category === "Cash") return "Cash";
  if (category === "E-Payment") return platform;
  return category;
}

export type SaleCreditDetails = {
  amountPaid: number;
  amountCredit: number;
  partialPaymentMode?: string;
  paymentReference?: string;
};

export function isCreditSale(sale: { paymentMode: string; amountCredit?: number }): boolean {
  return (
    (sale.amountCredit ?? 0) > 0 ||
    sale.paymentMode === "Credit" ||
    sale.paymentMode.startsWith("Credit +")
  );
}

export function resolveSaleCreditDetails(sale: {
  paymentMode: string;
  total: number;
  amountPaid?: number;
  amountCredit?: number;
  partialPaymentMode?: string;
  paymentReference?: string;
}): SaleCreditDetails | null {
  if (!isCreditSale(sale)) return null;

  const amountPaid = sale.amountPaid ?? 0;
  const amountCredit = sale.amountCredit ?? Math.max(0, sale.total - amountPaid);

  return {
    amountPaid,
    amountCredit,
    partialPaymentMode: sale.partialPaymentMode,
    paymentReference: sale.paymentReference,
  };
}

export function formatSalePaymentSummary(sale: {
  paymentMode: string;
  total?: number;
  paymentReference?: string;
  amountPaid?: number;
  amountCredit?: number;
  partialPaymentMode?: string;
}): string {
  const credit = resolveSaleCreditDetails({
    ...sale,
    total: sale.total ?? (sale.amountPaid ?? 0) + (sale.amountCredit ?? 0),
  });

  if (credit) {
    const parts = [sale.paymentMode];
    if (credit.paymentReference) {
      parts.push(`Ref: ${credit.paymentReference}`);
    }
    parts.push(`Paid now: ${formatCurrency(credit.amountPaid)}`);
    parts.push(`On credit: ${formatCurrency(credit.amountCredit)}`);
    if (credit.partialPaymentMode) {
      parts.push(`Partial via ${credit.partialPaymentMode}`);
    }
    return parts.join(" · ");
  }

  const parts = [sale.paymentMode];
  if (sale.paymentReference) {
    parts.push(`Ref: ${sale.paymentReference}`);
  }
  return parts.join(" · ");
}

/** Bhutanese Ngultrum — default currency for all amounts. */
export const CURRENCY_SYMBOL = "Nu.";

export const currencyInputGroupClass =
  "flex items-center overflow-hidden rounded-xl border border-border bg-bg-main transition-colors focus-within:border-accent-blue";

export const currencyInnerInputClass =
  "min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted";

export const inputClass =
  "w-full rounded-xl border border-border bg-bg-main px-4 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-blue";

export const phoneInputGroupClass =
  "flex items-center overflow-hidden rounded-xl border border-border bg-bg-main transition-colors focus-within:border-accent-blue";

export const phoneInnerInputClass =
  "min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted";

export const labelClass = "mb-1.5 block text-sm font-medium text-text-secondary";

export const cardClass =
  "rounded-2xl border border-border bg-bg-card shadow-lg shadow-black/20";

/** Minimum width for main content; viewports narrower than this scroll horizontally. */
export const APP_CONTENT_MIN_WIDTH_PX = 1120;

export const appContentMinWidthClass = "min-w-[1120px]";

/** Wrap wide tables so they scroll horizontally inside cards. */
export const tableHorizontalScrollClass =
  "w-full max-w-full overflow-x-auto overscroll-x-contain";

/** Tables that must not wrap cells when the layout is narrowed. */
export const tableNoWrapClass =
  "w-max min-w-full [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap";

export function formatDateGB(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateDMY(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}|${month}|${year}`;
}

/** Compact quotation date, e.g. 12|07|'26 */
export function formatDateDMYShort(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}|${month}|'${yy}`;
}

/** Parse audit timestamps stored as UTC ISO or legacy SQLite UTC strings. */
export function parseAuditTimestamp(timestamp: string): Date | null {
  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  if (trimmed.includes("T") || trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const legacyPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!legacyPattern.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const asUtc = new Date(`${trimmed.replace(" ", "T")}Z`);
  const asLocal = new Date(trimmed.replace(" ", "T"));
  if (Number.isNaN(asUtc.getTime()) || Number.isNaN(asLocal.getTime())) return null;

  const now = Date.now();
  const candidates = [asUtc, asLocal];
  const notFuture = candidates.filter((candidate) => candidate.getTime() <= now + 60_000);
  const pool = notFuture.length > 0 ? notFuture : candidates;

  return pool.reduce((best, candidate) =>
    Math.abs(candidate.getTime() - now) < Math.abs(best.getTime() - now) ? candidate : best,
  );
}

/** Show audit log times in the machine's local timezone. */
export function formatAuditTimestamp(timestamp: string): string {
  const parsed = parseAuditTimestamp(timestamp);
  if (!parsed) return timestamp.trim() || "—";

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Round currency values to 2 decimal places for storage and display. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatAmount(value: number): string {
  return roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(value: number): string {
  return `${CURRENCY_SYMBOL} ${formatAmount(value)}`;
}

export function splitCurrency(value: number) {
  const [whole, decimal = "00"] = formatAmount(value).split(".");
  return { symbol: CURRENCY_SYMBOL, whole, decimal };
}

export const LOW_STOCK_THRESHOLD = 20;

export function stockStatus(
  stock: number,
  lowStockThreshold?: number,
): "in-stock" | "low" | "out" {
  if (stock === 0) return "out";
  if (lowStockThreshold !== undefined && stock <= lowStockThreshold) return "low";
  return "in-stock";
}

export function isLowStock(product: { stock: number; lowStockThreshold?: number }): boolean {
  if (product.stock === 0) return true;
  if (product.lowStockThreshold === undefined) return false;
  return product.stock <= product.lowStockThreshold;
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatPhoneLocal(countryCode: string, value: string): string {
  const digits = normalizePhone(value);

  if (countryCode === "+975") {
    const local = digits.slice(0, 8);
    if (local.length <= 3) return local;
    if (local.length <= 5) return `${local.slice(0, 3)} ${local.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5)}`;
  }

  return digits.slice(0, 15);
}

export function phoneMaxLength(countryCode: string): number {
  return countryCode === "+975" ? 10 : 15;
}

export function phonePlaceholder(countryCode: string): string {
  return countryCode === "+975" ? "XXX XX XXX" : "Phone number";
}

export function formatContactPhone(countryCode: string, phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const code = countryCode.trim();
  const local = formatPhoneLocal(code || "+975", trimmed);
  return code ? `${code} ${local}` : local;
}

export function formatContactLabel(contact: {
  name: string;
  countryCode: string;
  phone: string;
}): string {
  const phoneDisplay = formatContactPhone(contact.countryCode, contact.phone);
  if (!phoneDisplay) return contact.name;
  return `${contact.name} | ${phoneDisplay}`;
}

export function isPhoneCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return /^(mobile(s)?(\s+phone(s)?)?|phone(s)?)$/.test(normalized);
}

const PURCHASE_PHONE_NAME_DIVIDER = " · ";

export function splitPurchasePhoneName(name: string): { model: string; ramRom: string } {
  const dividerIndex = name.indexOf(PURCHASE_PHONE_NAME_DIVIDER);
  if (dividerIndex === -1) {
    return { model: name, ramRom: "" };
  }
  return {
    model: name.slice(0, dividerIndex).trim(),
    ramRom: name.slice(dividerIndex + PURCHASE_PHONE_NAME_DIVIDER.length).trim(),
  };
}

export function buildPurchasePhoneName(model: string, ramRom: string): string {
  const trimmedModel = model.trim();
  const trimmedRamRom = ramRom
    .trim()
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmedModel) return "";
  if (!trimmedRamRom) return trimmedModel;
  return `${trimmedModel}${PURCHASE_PHONE_NAME_DIVIDER}${trimmedRamRom}`;
}

export function normalizePurchaseItemName(name: string): string {
  return name
    .trim()
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productMatchKey(name: string, category: string): string {
  return `${normalizePurchaseItemName(name)}::${category.trim().toLowerCase()}`;
}

export function displayPurchasePhoneName(name: string): string {
  return name.includes(PURCHASE_PHONE_NAME_DIVIDER)
    ? name.replace(PURCHASE_PHONE_NAME_DIVIDER, " | ")
    : name;
}

export function normalizeImei(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidImei(value: string): boolean {
  return normalizeImei(value).length === 15;
}

export function dicebearImage(seed: string): string {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`;
}
