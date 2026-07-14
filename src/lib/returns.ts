import { roundMoney, stockStatus } from "./constants";
import { baseQtyFromSaleItem, toBaseQty } from "./inventoryUom";
import type {
  Contact,
  Product,
  PurchaseReturnItem,
  Sale,
  SalesReturn,
  SalesReturnItem,
  SalesReturnReason,
  SalesReturnSettlement,
  UserRole,
} from "../types";

export function salesReturnsForSale(
  returns: SalesReturn[],
  saleId: string,
): SalesReturn[] {
  return returns.filter(
    (entry) => entry.saleId === saleId && entry.status !== "closed",
  );
}

/** Qty already returned (sale UOM) per product line key. */
export function returnedQtyBySaleLine(
  returns: SalesReturn[],
  saleId: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of returns) {
    if (entry.saleId !== saleId) continue;
    for (const item of entry.items) {
      const key = saleLineKey(item.productId, item.imei1);
      map.set(key, (map.get(key) ?? 0) + item.quantity);
    }
  }
  return map;
}

export function saleLineKey(productId: string, imei1?: string): string {
  const imei = imei1?.trim() ?? "";
  return imei ? `${productId}::${imei}` : productId;
}

export function maxReturnableQty(
  saleItem: Sale["items"][number],
  alreadyReturned: number,
): number {
  return Math.max(0, saleItem.quantity - alreadyReturned);
}

export type SalesReturnDraftLine = {
  productId: string;
  productName: string;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  imei1?: string;
  gstPercent?: number;
  uom?: string;
  conversionFactor?: number;
  selected: boolean;
};

export function buildSalesReturnDraftLines(
  sale: Sale,
  existingReturns: SalesReturn[],
): SalesReturnDraftLine[] {
  const returned = returnedQtyBySaleLine(existingReturns, sale.id);
  return sale.items
    .filter((item) => item.productId !== "MANUAL")
    .map((item) => {
      const key = saleLineKey(item.productId, item.imei1);
      const already = returned.get(key) ?? 0;
      const maxQuantity = maxReturnableQty(item, already);
      return {
        productId: item.productId,
        productName: item.productName,
        quantity: maxQuantity > 0 ? Math.min(1, maxQuantity) : 0,
        maxQuantity,
        unitPrice: item.unitPrice,
        imei1: item.imei1,
        gstPercent: item.gstPercent,
        uom: item.uom,
        conversionFactor: item.conversionFactor,
        selected: maxQuantity > 0,
      };
    })
    .filter((line) => line.maxQuantity > 0);
}

export function salesReturnItemsFromDraft(
  lines: SalesReturnDraftLine[],
): SalesReturnItem[] | null {
  const items: SalesReturnItem[] = [];
  for (const line of lines) {
    if (!line.selected || line.quantity <= 0) continue;
    if (line.quantity > line.maxQuantity) return null;
    const conversionFactor = Math.max(1, line.conversionFactor ?? 1);
    const total = roundMoney(line.unitPrice * line.quantity);
    items.push({
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total,
      imei1: line.imei1,
      gstPercent: line.gstPercent,
      uom: line.uom,
      conversionFactor,
      baseQtyReturned: toBaseQty(line.quantity, conversionFactor),
    });
  }
  return items.length > 0 ? items : null;
}

export function applySalesReturnStock(
  products: Product[],
  items: SalesReturnItem[],
): Product[] {
  const add = new Map<string, number>();
  for (const item of items) {
    if (item.productId === "MANUAL") continue;
    add.set(item.productId, (add.get(item.productId) ?? 0) + item.baseQtyReturned);
  }
  return products.map((product) => {
    const qty = add.get(product.id);
    if (!qty) return product;
    const stock = product.stock + qty;
    return { ...product, stock, status: stockStatus(stock, product.lowStockThreshold) };
  });
}

export function applyPurchaseReturnStock(
  products: Product[],
  items: PurchaseReturnItem[],
): Product[] | null {
  const use = new Map<string, number>();
  for (const item of items) {
    use.set(item.productId, (use.get(item.productId) ?? 0) + item.baseQtyReturned);
  }
  const next: Product[] = [];
  for (const product of products) {
    const qty = use.get(product.id) ?? 0;
    if (qty <= 0) {
      next.push(product);
      continue;
    }
    if (product.stock < qty) return null;
    const stock = product.stock - qty;
    next.push({ ...product, stock, status: stockStatus(stock, product.lowStockThreshold) });
  }
  return next;
}

/** Reduce customer AR and/or track store credit owed to the customer. */
export function applyCustomerSettlement(
  customers: Contact[],
  customerId: string | undefined,
  settlement: SalesReturnSettlement,
  returnTotal: number,
): Contact[] {
  if (!customerId || returnTotal <= 0) return customers;
  if (settlement === "refund" || settlement === "replacement") return customers;

  return customers.map((customer) => {
    if (customer.id !== customerId) return customer;
    const owed = Math.max(0, customer.creditBalance ?? 0);
    const againstAr = Math.min(owed, returnTotal);
    const storeCredit = roundMoney(
      (customer.storeCredit ?? 0) + Math.max(0, returnTotal - againstAr),
    );
    return {
      ...customer,
      creditBalance: roundMoney(owed - againstAr),
      storeCredit: storeCredit > 0 ? storeCredit : undefined,
    };
  });
}

export function applySupplierPurchaseReturn(
  suppliers: Contact[],
  supplierId: string | undefined,
  supplierName: string,
  returnTotal: number,
): Contact[] {
  if (returnTotal <= 0) return suppliers;
  const needle = supplierName.trim().toLowerCase();
  return suppliers.map((supplier) => {
    const match =
      (supplierId && supplier.id === supplierId) ||
      supplier.name.trim().toLowerCase() === needle;
    if (!match) return supplier;
    // Returning goods reduces what we owe the supplier.
    return {
      ...supplier,
      creditBalance: roundMoney(Math.max(0, (supplier.creditBalance ?? 0) - returnTotal)),
    };
  });
}

export function purchaseReturnItemsFromSalesReturn(
  salesReturn: SalesReturn,
  products: Product[],
): PurchaseReturnItem[] {
  return salesReturn.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const costPrice = roundMoney(product?.costPrice ?? item.unitPrice);
    return {
      productId: item.productId,
      productName: item.productName,
      sku: product?.sku,
      quantity: item.quantity,
      costPrice,
      total: roundMoney(costPrice * item.quantity),
      imei1: item.imei1,
      uom: item.uom,
      conversionFactor: item.conversionFactor,
      baseQtyReturned: item.baseQtyReturned,
    };
  });
}

export function openSupplierLiableReturns(returns: SalesReturn[]): SalesReturn[] {
  return returns.filter(
    (entry) =>
      entry.supplierLiable &&
      entry.status === "open" &&
      !entry.purchaseReturnId,
  );
}

export function reasonLabel(reason: SalesReturnReason): string {
  switch (reason) {
    case "warranty":
      return "Warranty";
    case "complaint":
      return "Complaint";
    case "damage":
      return "Damage";
    default:
      return "Other";
  }
}

export function settlementLabel(settlement: SalesReturnSettlement): string {
  switch (settlement) {
    case "refund":
      return "Refund";
    case "credit":
      return "Store credit / AR adjust";
    case "replacement":
      return "Replacement";
    default:
      return settlement;
  }
}

export function createSalesReturnRecord(input: {
  id: string;
  sale: Sale;
  items: SalesReturnItem[];
  reason: SalesReturnReason;
  settlement: SalesReturnSettlement;
  supplierLiable: boolean;
  notes?: string;
  returnDate: string;
  createdBy: UserRole | string;
}): SalesReturn {
  const subtotal = roundMoney(input.items.reduce((sum, item) => sum + item.total, 0));
  return {
    id: input.id,
    saleId: input.sale.id,
    returnDate: input.returnDate,
    customerName: input.sale.customerName,
    customerId: input.sale.customerId,
    reason: input.reason,
    settlement: input.settlement,
    supplierLiable: input.supplierLiable,
    notes: input.notes?.trim() || undefined,
    items: input.items,
    subtotal,
    total: subtotal,
    status: "open",
    createdBy: String(input.createdBy),
    createdAt: new Date().toISOString(),
  };
}

/** Remaining base qty still available on a sales return for supplier return. */
export function salesReturnOpenBaseQty(salesReturn: SalesReturn): number {
  if (salesReturn.purchaseReturnId) return 0;
  return salesReturn.items.reduce((sum, item) => sum + item.baseQtyReturned, 0);
}

export { baseQtyFromSaleItem };
