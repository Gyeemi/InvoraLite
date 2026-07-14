import { DEFAULT_GST_RATE_PERCENT, productGstPercent } from "../../lib/gst";
import {
  DEFAULT_BASE_UOM,
  getSaleUnitPrice,
  normalizeConversionFactor,
  toBaseQty,
  type CustomerType,
} from "../../lib/inventoryUom";
import {
  bogoPaidQuantity,
  findActiveBogoOffer,
  findActiveOfferForSale,
  resolveOfferSellingPrice,
} from "../../lib/productOffer";
import {
  findRateMasterForProduct,
  matchRateMasterSaleUnit,
} from "../../lib/rateMaster";
import type { Product, ProductOffer, RateMaster } from "../../types";

export type DraftLine = {
  key: string;
  productId: string;
  newProductName: string | null;
  newProductPrice: string;
  quantity: number;
  imei1: string;
  uom: string;
  conversionFactor: number;
  /** Retail (default) or wholesale unit pricing for catalog products. */
  priceType: CustomerType;
};

export type LineOfferContext = {
  customerGroup?: string;
  isFirstPurchase?: boolean;
  paymentMethod?: string;
  couponCode?: string;
  sales?: import("../../types").Sale[];
  customerId?: string;
  manualDiscount?: number;
};

export function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyLine(): DraftLine {
  return {
    key: newLineKey(),
    productId: "",
    newProductName: null,
    newProductPrice: "",
    quantity: 1,
    imei1: "",
    uom: DEFAULT_BASE_UOM,
    conversionFactor: 1,
    priceType: "retail",
  };
}

export function linePriceType(line: DraftLine): CustomerType {
  return line.priceType ?? "retail";
}

function listUnitPriceForLine(
  line: DraftLine,
  product: Product,
  rateMasters: RateMaster[],
): number {
  const rateMaster = findRateMasterForProduct(rateMasters, product);
  const rateUnit = matchRateMasterSaleUnit(rateMaster, line.uom);
  if (rateUnit) return rateUnit.sellingPrice;
  return getSaleUnitPrice(product, {
    conversionFactor: line.conversionFactor,
    customerType: linePriceType(line),
  });
}

export function lineAppliedOffer(
  line: DraftLine,
  products: Product[],
  rateMasters: RateMaster[] = [],
  offers: ProductOffer[] = [],
  ctx: LineOfferContext = {},
): ProductOffer | undefined {
  const product = products.find((entry) => entry.id === line.productId);
  if (!product) return undefined;
  const listPrice = listUnitPriceForLine(line, product, rateMasters);
  return findActiveOfferForSale(offers, product, line.uom, rateMasters, {
    quantity: line.quantity,
    fallbackUnitPrice: listPrice,
    customerGroup: ctx.customerGroup ?? linePriceType(line),
    isFirstPurchase: ctx.isFirstPurchase,
    sales: ctx.sales,
    customerId: ctx.customerId,
  });
}

export function lineUnitPrice(
  line: DraftLine,
  products: Product[],
  rateMasters: RateMaster[] = [],
  offers: ProductOffer[] = [],
  ctx: LineOfferContext = {},
): number {
  const product = products.find((entry) => entry.id === line.productId);
  if (product) {
    const listPrice = listUnitPriceForLine(line, product, rateMasters);
    const offer = lineAppliedOffer(line, products, rateMasters, offers, ctx);
    if (offer) {
      return resolveOfferSellingPrice(offer, listPrice, line.quantity);
    }
    return listPrice;
  }

  const name = line.newProductName?.trim() ?? "";
  const price = Number.parseFloat(line.newProductPrice);
  if (name && !Number.isNaN(price) && price > 0) {
    return price;
  }

  return 0;
}

export function lineSubtotal(
  line: DraftLine,
  products: Product[],
  rateMasters: RateMaster[] = [],
  offers: ProductOffer[] = [],
  ctx: LineOfferContext = {},
): number {
  const product = products.find((entry) => entry.id === line.productId);
  const unitPrice = lineUnitPrice(line, products, rateMasters, offers, ctx);
  if (!product) return unitPrice * line.quantity;

  const bogo = findActiveBogoOffer(offers, product, line.uom, undefined, ctx.sales, ctx.customerId);
  if (bogo) {
    const listPrice = listUnitPriceForLine(line, product, rateMasters);
    const paidQty = bogoPaidQuantity(line.quantity, bogo.buyQty, bogo.freeQty);
    return listPrice * paidQty;
  }

  return unitPrice * line.quantity;
}

export function lineGstPercent(line: DraftLine, products: Product[]): number {
  const product = products.find((entry) => entry.id === line.productId);
  if (product) return productGstPercent(product);
  if (line.newProductName?.trim()) return DEFAULT_GST_RATE_PERCENT;
  return DEFAULT_GST_RATE_PERCENT;
}

export function lineBaseQty(line: DraftLine): number {
  return toBaseQty(line.quantity, line.conversionFactor);
}

export function normalizedDraftLine(line: DraftLine): DraftLine {
  return {
    ...line,
    uom: line.uom.trim() || DEFAULT_BASE_UOM,
    conversionFactor: normalizeConversionFactor(line.conversionFactor),
  };
}
