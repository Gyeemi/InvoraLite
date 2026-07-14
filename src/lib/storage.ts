import { invoke } from "@tauri-apps/api/core";

const SESSION_PREFIX = "mentx_session:";

export interface StorageContext {
  username?: string;
  role?: string;
}

let activeStorageContext: StorageContext | null = null;

export function setStorageContext(context: StorageContext | null): void {
  activeStorageContext = context;
}

export function getStorageContext(): StorageContext | null {
  return activeStorageContext;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function storageGet(key: string): Promise<string | null> {
  if (isTauri()) {
    return (
      (await invoke<string | null>("storage_get", {
        key,
        context: activeStorageContext ?? undefined,
      })) ?? null
    );
  }
  return localStorage.getItem(key);
}

export interface StorageMutationResult {
  success: boolean;
  error?: string;
}

export async function storageSet(key: string, value: string): Promise<StorageMutationResult> {
  if (isTauri()) {
    const result = await invoke<StorageMutationResult>("storage_set", {
      key,
      value,
      context: activeStorageContext ?? undefined,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Could not save data.");
    }
    return result;
  }
  localStorage.setItem(key, value);
  return { success: true };
}

/** Persist multiple keys in one SQLite transaction (Tauri). Browser fallback writes sequentially. */
export async function storageSetMany(
  entries: Array<{ key: string; value: string }>,
): Promise<StorageMutationResult> {
  if (entries.length === 0) return { success: true };
  if (isTauri()) {
    const result = await invoke<StorageMutationResult>("storage_set_many", {
      entries,
      context: activeStorageContext ?? undefined,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Could not save data.");
    }
    return result;
  }
  for (const entry of entries) {
    localStorage.setItem(entry.key, entry.value);
  }
  return { success: true };
}

export async function storageRemove(key: string): Promise<StorageMutationResult> {
  if (isTauri()) {
    const result = await invoke<StorageMutationResult>("storage_remove", {
      key,
      context: activeStorageContext ?? undefined,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Could not remove data.");
    }
    return result;
  }
  localStorage.removeItem(key);
  return { success: true };
}

export async function sessionGet(key: string): Promise<string | null> {
  if (isTauri()) {
    return (
      (await invoke<string | null>("storage_get", {
        key: `${SESSION_PREFIX}${key}`,
        context: activeStorageContext ?? undefined,
      })) ?? null
    );
  }
  return sessionStorage.getItem(key);
}

export async function sessionSet(key: string, value: string): Promise<void> {
  if (isTauri()) {
    const result = await invoke<StorageMutationResult>("storage_set", {
      key: `${SESSION_PREFIX}${key}`,
      value,
      context: activeStorageContext ?? undefined,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Could not save session.");
    }
    return;
  }
  sessionStorage.setItem(key, value);
}

export async function sessionRemove(key: string): Promise<void> {
  if (isTauri()) {
    const result = await invoke<StorageMutationResult>("storage_remove", {
      key: `${SESSION_PREFIX}${key}`,
      context: activeStorageContext ?? undefined,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Could not clear session.");
    }
    return;
  }
  sessionStorage.removeItem(key);
}

export const STORAGE_KEYS = {
  auth: "mentx_auth",
  business: "mentx_business",
  setupComplete: "mentx_setup_complete",
  products: "mentx_products",
  sales: "mentx_sales",
  purchases: "mentx_purchases",
  customers: "mentx_customers",
  suppliers: "mentx_suppliers",
  offices: "mentx_offices",
  officeExpenses: "mentx_office_expenses",
  officeAssets: "mentx_office_assets",
  staff: "mentx_staff",
  paymentMethods: "mentx_e_payment_methods",
  avatars: "invora_profile_avatars",
  categories: "mentx_product_categories",
  supplierPayments: "mentx_supplier_payments",
  customerPayments: "mentx_customer_payments",
  accountingJournal: "mentx_accounting_journal",
  accountingCloses: "mentx_accounting_closes",
  theme: "invora_theme",
  rateMasters: "mentx_rate_masters",
  productOffers: "mentx_product_offers",
  quotations: "mentx_quotations",
  salesReturns: "mentx_sales_returns",
  purchaseReturns: "mentx_purchase_returns",
} as const;
