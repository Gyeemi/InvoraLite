import type { Product, PurchaseItem, SaleItem } from "../types";
import { roundMoney } from "./constants";

export type CustomerType = "retail" | "wholesale";

export const DEFAULT_BASE_UOM = "unit";
export const WHOLESALE_PRICE_MULTIPLIER = 0.9;

/** Common units for purchase/sale lines. */
export const COMMON_UOM_OPTIONS = [
  "unit",
  "piece",
  "case",
  "carton",
  "box",
  "pack",
  "dozen",
  "pair",
  "set",
  "kg",
  "g",
  "liter",
  "ml",
] as const;

export function normalizeUomLabel(value: string): string {
  return value.trim().toLowerCase();
}

/** Display UOM with the first letter capitalized (e.g. box → Box). */
export function formatUomDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function collectKnownUoms(
  sources: Array<string | undefined | null>,
): string[] {
  const set = new Set<string>(COMMON_UOM_OPTIONS);
  for (const value of sources) {
    const normalized = value?.trim();
    if (normalized) set.add(normalizeUomLabel(normalized));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function normalizeConversionFactor(value?: number | null): number {
  if (value == null || Number.isNaN(value) || value <= 0) return 1;
  return value;
}

/** Convert transaction quantity to base inventory units. */
export function toBaseQty(qty: number, conversionFactor?: number | null): number {
  const quantity = qty > 0 ? qty : 1;
  return quantity * normalizeConversionFactor(conversionFactor);
}

/** Purchase line cost is per purchase UOM; inventory stores cost per base unit. */
export function costPerBaseFromPurchaseLine(
  costPrice: number,
  conversionFactor?: number | null,
): number {
  return costPrice / normalizeConversionFactor(conversionFactor);
}

/** Selling price on purchase line is per purchase UOM; product price is per base unit. */
export function sellingPricePerBaseFromPurchaseLine(
  sellingPrice: number,
  conversionFactor?: number | null,
): number {
  return sellingPrice / normalizeConversionFactor(conversionFactor);
}

/** Retail on purchase form is already per base unit — store as product.price. */
export function retailPricePerBaseFromPurchaseLine(retailSellingPrice: number): number {
  return roundMoney(retailSellingPrice);
}

/** Wholesale on purchase form is per purchase UOM — store as product.wholesalePrice. */
export function wholesalePricePerPurchaseUomFromPurchaseLine(wholesaleSellingPrice: number): number {
  return roundMoney(wholesaleSellingPrice);
}

export function usesAlternatePurchaseUom(item: PurchaseItem): boolean {
  const conversionFactor = normalizeConversionFactor(item.conversionFactor);
  const uom = item.uom?.trim();
  return conversionFactor > 1 || Boolean(uom && normalizeUomLabel(uom) !== DEFAULT_BASE_UOM);
}

export function weightedAverageCostPerBase(
  currentBaseStock: number,
  currentCostPerBase: number | undefined,
  incomingBaseQty: number,
  incomingCostPerBase: number,
): number {
  const newTotalBase = currentBaseStock + incomingBaseQty;
  if (newTotalBase <= 0) return incomingCostPerBase;
  if (currentBaseStock <= 0 || currentCostPerBase == null) return incomingCostPerBase;
  return (currentBaseStock * currentCostPerBase + incomingBaseQty * incomingCostPerBase) / newTotalBase;
}

export function getSaleUnitPrice(
  product: Product,
  options?: {
    conversionFactor?: number | null;
    customerType?: CustomerType | null;
  },
): number {
  const conversionFactor = normalizeConversionFactor(options?.conversionFactor);

  if (options?.customerType === "wholesale") {
    const wholesaleFactor = normalizeConversionFactor(product.wholesaleConversionFactor ?? 1);
    if (product.wholesalePrice != null && product.wholesalePrice > 0) {
      return product.wholesalePrice * (conversionFactor / wholesaleFactor);
    }
    return product.price * conversionFactor * WHOLESALE_PRICE_MULTIPLIER;
  }

  return product.price * conversionFactor;
}

type LegacyPurchaseItem = PurchaseItem & { sellingPrice?: number };

/** Map legacy single selling price to retail + wholesale fields. */
export function normalizePurchaseItemPrices(item: LegacyPurchaseItem): PurchaseItem {
  const conversionFactor = normalizeConversionFactor(item.conversionFactor);
  const legacySelling = item.sellingPrice;
  const hasExplicitRetail = item.retailSellingPrice != null && item.retailSellingPrice > 0;
  const retail = hasExplicitRetail
    ? roundMoney(item.retailSellingPrice)
    : legacySelling != null && legacySelling > 0
      ? roundMoney(legacySelling / conversionFactor)
      : 0;
  const hasExplicitWholesale = item.wholesaleSellingPrice != null && item.wholesaleSellingPrice > 0;
  const wholesale = hasExplicitWholesale
    ? roundMoney(item.wholesaleSellingPrice)
    : legacySelling != null && legacySelling > 0
      ? roundMoney(legacySelling * WHOLESALE_PRICE_MULTIPLIER)
      : retail > 0
        ? roundMoney(retail * conversionFactor * WHOLESALE_PRICE_MULTIPLIER)
        : 0;
  const { sellingPrice: _removed, ...rest } = item;
  return {
    ...rest,
    retailSellingPrice: retail,
    wholesaleSellingPrice: wholesale,
  };
}

export function baseQtyFromSaleItem(item: SaleItem): number {
  if (item.baseQtySold != null) return item.baseQtySold;
  return toBaseQty(item.quantity, item.conversionFactor);
}

export function saleLineCogs(item: SaleItem, product?: Product): number {
  if (item.productId === "MANUAL") return 0;

  const baseQty = baseQtyFromSaleItem(item);
  const conversionFactor = normalizeConversionFactor(item.conversionFactor);

  if (item.costPerBaseAtSale != null) {
    return baseQty * item.costPerBaseAtSale;
  }

  if (product?.costPrice != null) {
    return baseQty * product.costPrice;
  }

  return baseQty * ((item.unitPrice * 0.65) / conversionFactor);
}

export function purchaseItemBaseQty(item: PurchaseItem, qty?: number): number {
  const quantity = qty ?? (item.quantity > 0 ? item.quantity : 1);
  return toBaseQty(quantity, item.conversionFactor);
}

export function normalizePurchaseItemUom(item: LegacyPurchaseItem): PurchaseItem {
  const withPrices = normalizePurchaseItemPrices(item);
  return {
    ...withPrices,
    conversionFactor: normalizeConversionFactor(withPrices.conversionFactor),
    uom: withPrices.uom?.trim() || DEFAULT_BASE_UOM,
  };
}
