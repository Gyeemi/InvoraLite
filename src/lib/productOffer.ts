import { roundMoney } from "./constants";
import { DEFAULT_BASE_UOM } from "./inventoryUom";
import { OFFER_TYPES, UNIT_PRICE_OFFER_TYPES } from "./offerTypes";
import {
  findRateMasterForProduct,
  isValidISODate,
  matchRateMasterSaleUnit,
  rateMasterSaleUnits,
  todayISO,
} from "./rateMaster";
import type {
  OfferDiscountType,
  OfferMasterStatus,
  OfferRewardType,
  OfferSlab,
  OfferType,
  Product,
  ProductOffer,
  RateMaster,
  Sale,
} from "../types";

export { todayISO as todayOfferDate } from "./rateMaster";

export function effectiveOfferType(offer: ProductOffer): OfferType {
  if (offer.offerType === "EVENT" && offer.linkedOfferType) {
    return offer.linkedOfferType;
  }
  return offer.offerType;
}

export function saleUsesOffer(sale: Sale, offerId: string): boolean {
  if (sale.status !== "completed" || !offerId) return false;
  if (sale.appliedOfferIds?.includes(offerId)) return true;
  return sale.items.some((item) => item.offerId === offerId);
}

export function countOfferUsage(
  sales: Sale[],
  offerId: string,
  customerId?: string,
): number {
  return sales.filter(
    (sale) =>
      saleUsesOffer(sale, offerId) &&
      (!customerId || sale.customerId === customerId),
  ).length;
}

/** Enforce usageLimit / perCustomerLimit using completed sales that reference the offer. */
export function isOfferUsageAvailable(
  offer: ProductOffer,
  sales: Sale[] = [],
  customerId?: string,
): boolean {
  if (!offer.id) return true;
  if (offer.usageLimit != null && countOfferUsage(sales, offer.id) >= offer.usageLimit) {
    return false;
  }
  if (
    offer.perCustomerLimit != null &&
    customerId &&
    countOfferUsage(sales, offer.id, customerId) >= offer.perCustomerLimit
  ) {
    return false;
  }
  return true;
}

function uomKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type OfferStatus = "active" | "expired" | "scheduled" | "inactive";

function asOfferType(value: unknown): OfferType {
  if (typeof value === "string" && (OFFER_TYPES as string[]).includes(value)) {
    return value as OfferType;
  }
  return "DISCOUNT";
}

function asDiscountType(
  value: unknown,
  legacyPriceMode?: string,
): OfferDiscountType {
  if (value === "PERCENT" || value === "FLAT" || value === "OFFER_PRICE") return value;
  if (legacyPriceMode === "percent") return "PERCENT";
  if (legacyPriceMode === "fixed") return "OFFER_PRICE";
  return "OFFER_PRICE";
}

function normalizeSlabs(raw: unknown): OfferSlab[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as Partial<OfferSlab>;
      return {
        minQty: Math.max(1, Number(row.minQty) || 1),
        maxQty:
          row.maxQty == null || row.maxQty === ("" as unknown)
            ? null
            : Math.max(0, Number(row.maxQty) || 0),
        discountPercent: Math.min(100, Math.max(0, Number(row.discountPercent) || 0)),
      };
    })
    .filter((row) => row.minQty > 0);
}

export function normalizeProductOffer(
  offer: Partial<ProductOffer> & Record<string, unknown> & { id?: string },
): ProductOffer {
  const createdDay = (offer.createdAt ?? todayISO()).slice(0, 10);
  const effectiveFrom =
    offer.effectiveFrom && isValidISODate(offer.effectiveFrom)
      ? offer.effectiveFrom
      : isValidISODate(createdDay)
        ? createdDay
        : todayISO();
  const effectiveTo =
    offer.effectiveTo && isValidISODate(offer.effectiveTo) ? offer.effectiveTo : null;

  const legacyPercent = Number(
    (offer as { discountPercent?: number }).discountPercent ?? offer.discountValue,
  );
  const discountType = asDiscountType(
    offer.discountType,
    (offer as { priceMode?: string }).priceMode,
  );
  const discountValue =
    discountType === "PERCENT"
      ? Math.min(100, Math.max(0, Number(offer.discountValue) || legacyPercent || 0))
      : roundMoney(Math.max(0, Number(offer.discountValue) || 0));

  const status: OfferMasterStatus =
    offer.status === "inactive" ? "inactive" : "active";

  return {
    id: String(offer.id ?? ""),
    name: offer.name?.trim() ?? "",
    offerType: asOfferType(offer.offerType),
    status,
    priority: Math.max(0, Number(offer.priority) || 0),
    productName: offer.productName?.trim() ?? "",
    category: offer.category?.trim() ?? "",
    brand: offer.brand?.trim() ?? "",
    sku: offer.sku?.trim() ?? "",
    unitName: offer.unitName?.trim() ?? "",
    buyQty: Math.max(1, Number(offer.buyQty) || 1),
    freeItemName: offer.freeItemName?.trim() ?? "",
    freeItemSku: offer.freeItemSku?.trim() ?? "",
    freeItemCategory: offer.freeItemCategory?.trim() ?? "",
    freeItemUnit: offer.freeItemUnit?.trim() ?? "",
    freeQty: Math.max(0, Number(offer.freeQty) || 0),
    discountType,
    discountValue,
    offerPrice: roundMoney(Math.max(0, Number(offer.offerPrice) || 0)),
    minBillValue: roundMoney(Math.max(0, Number(offer.minBillValue) || 0)),
    slabs: normalizeSlabs(offer.slabs),
    couponCode: offer.couponCode?.trim() ?? "",
    paymentMethod: offer.paymentMethod?.trim() ?? "",
    customerGroup: offer.customerGroup?.trim() ?? "",
    eventName: offer.eventName?.trim() ?? "",
    linkedOfferType: (OFFER_TYPES as string[]).includes(String(offer.linkedOfferType))
      ? (offer.linkedOfferType as OfferType)
      : "",
    effectiveFrom,
    effectiveTo,
    startTime: offer.startTime?.trim() ?? "",
    endTime: offer.endTime?.trim() ?? "",
    daysApplicable: Array.isArray(offer.daysApplicable)
      ? offer.daysApplicable.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
      : [],
    usageLimit:
      offer.usageLimit == null || offer.usageLimit === ("" as unknown)
        ? null
        : Math.max(0, Number(offer.usageLimit) || 0),
    perCustomerLimit:
      offer.perCustomerLimit == null || offer.perCustomerLimit === ("" as unknown)
        ? null
        : Math.max(0, Number(offer.perCustomerLimit) || 0),
    deductStock: offer.deductStock !== false,
    rewardType: (["PERCENT", "FLAT", "GIFT", "FIXED_BUNDLE"].includes(
      String(offer.rewardType),
    )
      ? offer.rewardType
      : "PERCENT") as OfferRewardType,
    giftProductName: offer.giftProductName?.trim() ?? "",
    giftSku: offer.giftSku?.trim() ?? "",
    giftCategory: offer.giftCategory?.trim() ?? "",
    giftUnit: offer.giftUnit?.trim() ?? "",
    giftQty: Math.max(0, Number(offer.giftQty) || 0),
    bundleComponents: Array.isArray(offer.bundleComponents)
      ? offer.bundleComponents.map((row) => ({
          productName: String(row.productName ?? "").trim(),
          sku: String(row.sku ?? "").trim(),
          category: String(row.category ?? "").trim(),
          unitName: String(row.unitName ?? "").trim(),
          quantity: Math.max(1, Number(row.quantity) || 1),
        }))
      : [],
    bundlePrice: roundMoney(Math.max(0, Number(offer.bundlePrice) || 0)),
    cashbackPercent: Math.min(100, Math.max(0, Number(offer.cashbackPercent) || 0)),
    maxCashback: roundMoney(Math.max(0, Number(offer.maxCashback) || 0)),
    mixMatchGroupSkus: Array.isArray(offer.mixMatchGroupSkus)
      ? offer.mixMatchGroupSkus.map((s) => String(s).trim()).filter(Boolean)
      : [],
    mixMatchQty: Math.max(1, Number(offer.mixMatchQty) || 1),
    mixMatchReward:
      offer.mixMatchReward === "CHEAPEST_FREE" ||
      offer.mixMatchReward === "PERCENT" ||
      offer.mixMatchReward === "FIXED_PRICE"
        ? offer.mixMatchReward
        : "PERCENT",
    mixMatchFixedPrice: roundMoney(Math.max(0, Number(offer.mixMatchFixedPrice) || 0)),
    referrerReward: roundMoney(Math.max(0, Number(offer.referrerReward) || 0)),
    refereeReward: roundMoney(Math.max(0, Number(offer.refereeReward) || 0)),
    markdownReason: offer.markdownReason?.trim() ?? "",
    maxQty:
      offer.maxQty == null || offer.maxQty === ("" as unknown)
        ? null
        : Math.max(0, Number(offer.maxQty) || 0),
    notes: offer.notes?.trim() || undefined,
    createdAt: offer.createdAt ?? new Date().toISOString(),
    updatedAt: offer.updatedAt ?? new Date().toISOString(),
  };
}

export function offerCoversDate(offer: ProductOffer, onDate = todayISO()): boolean {
  if (onDate < offer.effectiveFrom) return false;
  if (offer.effectiveTo && onDate > offer.effectiveTo) return false;
  return true;
}

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function offerCoversTime(
  offer: ProductOffer,
  at: Date = new Date(),
): boolean {
  if (offer.offerType !== "TIME_BOUND" && !(offer.startTime && offer.endTime)) {
    return true;
  }
  if (offer.daysApplicable.length > 0 && !offer.daysApplicable.includes(at.getDay())) {
    return false;
  }
  const start = parseHm(offer.startTime);
  const end = parseHm(offer.endTime);
  if (start == null || end == null) return true;
  const mins = at.getHours() * 60 + at.getMinutes();
  if (start <= end) return mins >= start && mins <= end;
  return mins >= start || mins <= end;
}

export function offerStatus(
  offer: ProductOffer,
  onDate = todayISO(),
  at: Date = new Date(),
): OfferStatus {
  if (offer.status === "inactive") return "inactive";
  if (onDate < offer.effectiveFrom) return "scheduled";
  if (offer.effectiveTo && onDate > offer.effectiveTo) return "expired";
  if (!offerCoversTime(offer, at) && offer.offerType === "TIME_BOUND") {
    return "scheduled";
  }
  return "active";
}

export type OfferDraftInput = Partial<ProductOffer> & {
  name: string;
  offerType: OfferType;
  effectiveFrom: string;
};

export function validateProductOfferDraft(input: OfferDraftInput): string | null {
  if (!input.name.trim()) return "Enter an offer name.";
  if (!isValidISODate(input.effectiveFrom)) return "Enter a valid Effective From date.";

  const type = input.offerType;
  const needsMainItem = ![
    "BILL_VALUE",
    "COUPON",
    "LOYALTY",
    "PAYMENT",
    "REFERRAL",
    "EVENT",
    "MIX_MATCH",
  ].includes(type);

  if (needsMainItem) {
    if (!input.productName?.trim()) return "Select a product.";
    if (!input.sku?.trim()) return "Product SKU is required.";
    if (!input.unitName?.trim()) return "Select a unit for this offer.";
  }

  if (type === "DISCOUNT" || type === "CLEARANCE" || type === "TIME_BOUND" || type === "MEMBERSHIP" || type === "FIRST_PURCHASE") {
    const discountType = input.discountType ?? "OFFER_PRICE";
    if (discountType === "OFFER_PRICE" && !(Number(input.offerPrice) > 0)) {
      return "Enter an offer price greater than zero.";
    }
    if (discountType === "PERCENT" && !(Number(input.discountValue) > 0 && Number(input.discountValue) <= 100)) {
      return "Enter a discount between 1% and 100%.";
    }
    if (discountType === "FLAT" && !(Number(input.discountValue) > 0)) {
      return "Enter a flat amount greater than zero.";
    }
  }

  if (type === "FLAT_OFF" && !(Number(input.discountValue) > 0)) {
    return "Enter the flat amount off.";
  }

  if (type === "BOGO") {
    if (!(Number(input.buyQty) > 0)) return "Enter buy quantity.";
    if (!(Number(input.freeQty) > 0)) return "Enter free quantity.";
  }

  if (type === "BUY_X_GET_Y" || type === "BUY_X_GET_Y_DISC") {
    if (!(Number(input.buyQty) > 0)) return "Enter main buy quantity.";
    if (!input.freeItemName?.trim() && !input.freeItemSku?.trim()) {
      return "Select the reward item.";
    }
    if (type === "BUY_X_GET_Y" && !(Number(input.freeQty) > 0)) {
      return "Enter free quantity.";
    }
    if (type === "BUY_X_GET_Y_DISC" && !(Number(input.discountValue) > 0)) {
      return "Enter the discount % for the reward item.";
    }
  }

  if (type === "SLAB") {
    const slabs = normalizeSlabs(input.slabs);
    if (slabs.length === 0) return "Add at least one quantity slab.";
  }

  if (type === "BILL_VALUE") {
    if (!(Number(input.minBillValue) > 0)) return "Enter a minimum bill value.";
  }

  if (type === "COUPON" && !input.couponCode?.trim()) {
    return "Enter a coupon code.";
  }

  if (type === "COMBO") {
    if (!(Number(input.bundlePrice) > 0)) return "Enter a bundle price.";
    if (!input.bundleComponents || input.bundleComponents.length < 2) {
      return "Add at least two bundle components.";
    }
  }

  if (type === "EVENT" && !input.eventName?.trim()) {
    return "Enter an event name.";
  }

  if (type === "TIME_BOUND") {
    if (!input.startTime?.trim() || !input.endTime?.trim()) {
      return "Enter start and end time for the time window.";
    }
  }

  if (type === "FREE_GIFT") {
    if (!input.giftProductName?.trim() && !input.giftSku?.trim()) {
      return "Select a gift item.";
    }
    if (!(Number(input.giftQty) > 0)) return "Enter gift quantity.";
  }

  return null;
}

/** Paid quantity under BOGO / buy-X-get-Y-same-item rules. */
export function bogoPaidQuantity(qty: number, buyQty: number, freeQty: number): number {
  const q = Math.max(0, qty);
  const buy = Math.max(1, buyQty);
  const free = Math.max(0, freeQty);
  if (free <= 0) return q;
  const cycle = buy + free;
  const fullCycles = Math.floor(q / cycle);
  const remainder = q % cycle;
  const freeInRemainder = Math.max(0, remainder - buy);
  const freeTotal = fullCycles * free + freeInRemainder;
  return q - freeTotal;
}

function slabDiscountPercent(offer: ProductOffer, qty: number): number {
  const slabs = [...offer.slabs].sort((a, b) => a.minQty - b.minQty);
  const match = slabs.find((slab) => {
    if (qty < slab.minQty) return false;
    if (slab.maxQty == null) return true;
    return qty <= slab.maxQty;
  });
  return match?.discountPercent ?? 0;
}

/** Resolve unit selling price for price-changing offer types. */
export function resolveOfferSellingPrice(
  offer: ProductOffer,
  listPrice: number,
  qty = 1,
): number {
  const base = Math.max(0, listPrice);
  const type =
    offer.offerType === "EVENT" && offer.linkedOfferType
      ? offer.linkedOfferType
      : offer.offerType;

  if (type === "SLAB") {
    return roundMoney(base * (1 - slabDiscountPercent(offer, qty) / 100));
  }
  if (type === "FLAT_OFF") {
    return roundMoney(Math.max(0, base - offer.discountValue));
  }

  if (offer.discountType === "PERCENT") {
    return roundMoney(base * (1 - offer.discountValue / 100));
  }
  if (offer.discountType === "FLAT") {
    return roundMoney(Math.max(0, base - offer.discountValue));
  }
  return roundMoney(Math.max(0, offer.offerPrice));
}

export function offerMatchesProduct(
  offer: ProductOffer,
  product: Pick<Product, "name" | "sku" | "category">,
): boolean {
  const sku = product.sku?.trim().toLowerCase();
  if (sku && offer.sku.trim().toLowerCase() === sku) return true;
  if (!offer.productName.trim()) return false;
  return (
    offer.productName.trim().toLowerCase() === product.name.trim().toLowerCase() &&
    (!offer.category.trim() ||
      offer.category.trim().toLowerCase() === product.category.trim().toLowerCase())
  );
}

export type OfferSaleContext = {
  quantity?: number;
  onDate?: string;
  at?: Date;
  customerGroup?: string;
  isFirstPurchase?: boolean;
  paymentMethod?: string;
  couponCode?: string;
  fallbackUnitPrice?: number;
  sales?: Sale[];
  customerId?: string;
};

function offerEligibleForUnitPrice(
  offer: ProductOffer,
  ctx: OfferSaleContext,
): boolean {
  const onDate = ctx.onDate ?? todayISO();
  const at = ctx.at ?? new Date();
  if (offerStatus(offer, onDate, at) !== "active") return false;
  if (!isOfferUsageAvailable(offer, ctx.sales ?? [], ctx.customerId)) return false;

  let type = offer.offerType;
  if (type === "EVENT") {
    if (!offer.linkedOfferType) return false;
    type = offer.linkedOfferType;
  }

  if (!UNIT_PRICE_OFFER_TYPES.includes(type) && type !== "DISCOUNT") return false;

  if (type === "MEMBERSHIP" || type === "LOYALTY") {
    const group = (ctx.customerGroup ?? "").trim().toLowerCase();
    const required = offer.customerGroup.trim().toLowerCase();
    if (required && (!group || group !== required)) return false;
  }

  if (type === "FIRST_PURCHASE" && !ctx.isFirstPurchase) return false;

  if (type === "TIME_BOUND" && !offerCoversTime(offer, at)) return false;

  return true;
}

/**
 * Active unit-price offer for a product + UOM.
 * Prefer highest priority, then lowest resolved price.
 */
export function findActiveOfferForSale(
  offers: ProductOffer[],
  product: Pick<Product, "name" | "sku" | "category">,
  uom: string,
  rateMasters: RateMaster[] = [],
  onDateOrCtx: string | OfferSaleContext = todayISO(),
  fallbackUnitPrice = 0,
): ProductOffer | undefined {
  const ctx: OfferSaleContext =
    typeof onDateOrCtx === "string"
      ? { onDate: onDateOrCtx, fallbackUnitPrice }
      : { fallbackUnitPrice, ...onDateOrCtx };

  const onDate = ctx.onDate ?? todayISO();
  const needle = uomKey(uom);
  const rateMaster = findRateMasterForProduct(rateMasters, product, onDate);
  const rateUnit = matchRateMasterSaleUnit(rateMaster, uom);
  const ratePrice = rateUnit?.sellingPrice ?? ctx.fallbackUnitPrice ?? fallbackUnitPrice;
  const qty = Math.max(1, ctx.quantity ?? 1);

  const candidates = offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter(
      (offer) =>
        offerEligibleForUnitPrice(offer, ctx) &&
        offerMatchesProduct(offer, product) &&
        (!offer.unitName.trim() || uomKey(offer.unitName) === needle),
    );

  if (candidates.length === 0) return undefined;

  return candidates.reduce((best, offer) => {
    if (offer.priority !== best.priority) {
      return offer.priority > best.priority ? offer : best;
    }
    const bestPrice = resolveOfferSellingPrice(best, ratePrice, qty);
    const nextPrice = resolveOfferSellingPrice(offer, ratePrice, qty);
    return nextPrice < bestPrice ? offer : best;
  });
}

export function findActiveBogoOffer(
  offers: ProductOffer[],
  product: Pick<Product, "name" | "sku" | "category">,
  uom: string,
  onDate = todayISO(),
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer | undefined {
  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter(
      (offer) =>
        offerStatus(offer, onDate) === "active" &&
        isOfferUsageAvailable(offer, sales, customerId) &&
        (offer.offerType === "BOGO" ||
          (offer.offerType === "EVENT" && offer.linkedOfferType === "BOGO")) &&
        offerMatchesProduct(offer, product) &&
        (!offer.unitName.trim() || uomKey(offer.unitName) === uomKey(uom)),
    )
    .sort((a, b) => b.priority - a.priority)[0];
}

export function findBillValueOffers(
  offers: ProductOffer[],
  subtotal: number,
  onDate = todayISO(),
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer[] {
  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter(
      (offer) =>
        offerStatus(offer, onDate) === "active" &&
        isOfferUsageAvailable(offer, sales, customerId) &&
        (offer.offerType === "BILL_VALUE" ||
          (offer.offerType === "EVENT" && offer.linkedOfferType === "BILL_VALUE")) &&
        subtotal >= offer.minBillValue,
    )
    .sort((a, b) => b.priority - a.priority || b.minBillValue - a.minBillValue);
}

export function resolveBillValueDiscount(offer: ProductOffer, subtotal: number): number {
  if (offer.rewardType === "FLAT") {
    return roundMoney(Math.min(subtotal, offer.discountValue));
  }
  if (offer.rewardType === "PERCENT") {
    return roundMoney(subtotal * (offer.discountValue / 100));
  }
  return 0;
}

/**
 * Find an active coupon by code. Optional min bill value must be met.
 * Cart-wide coupons (no product) always match; product-linked coupons need that SKU/name in the cart later.
 */
export function findCouponOffer(
  offers: ProductOffer[],
  code: string,
  subtotal: number,
  onDate = todayISO(),
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer | undefined {
  const needle = code.trim().toUpperCase();
  if (!needle) return undefined;

  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter((offer) => {
      const type = effectiveOfferType(offer);
      if (type !== "COUPON") return false;
      if (offerStatus(offer, onDate) !== "active") return false;
      if (!isOfferUsageAvailable(offer, sales, customerId)) return false;
      if (offer.couponCode.trim().toUpperCase() !== needle) return false;
      if (offer.minBillValue > 0 && subtotal < offer.minBillValue) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

/** Cart discount from a coupon offer (percent / flat / offerPrice as flat amount). */
export function resolveCouponDiscount(offer: ProductOffer, subtotal: number): number {
  const base = Math.max(0, subtotal);
  if (offer.discountType === "PERCENT") {
    return roundMoney(base * (offer.discountValue / 100));
  }
  if (offer.discountType === "FLAT") {
    return roundMoney(Math.min(base, offer.discountValue));
  }
  // OFFER_PRICE on coupons = fixed amount off the bill
  return roundMoney(Math.min(base, Math.max(0, offer.offerPrice || offer.discountValue)));
}

/** Referral codes reuse couponCode; reward is refereeReward (flat) or discount fields. */
export function findReferralOffer(
  offers: ProductOffer[],
  code: string,
  subtotal: number,
  onDate = todayISO(),
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer | undefined {
  const needle = code.trim().toUpperCase();
  if (!needle) return undefined;

  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter((offer) => {
      if (effectiveOfferType(offer) !== "REFERRAL") return false;
      if (offerStatus(offer, onDate) !== "active") return false;
      if (!isOfferUsageAvailable(offer, sales, customerId)) return false;
      if (offer.couponCode.trim().toUpperCase() !== needle) return false;
      if (offer.minBillValue > 0 && subtotal < offer.minBillValue) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

export function resolveReferralDiscount(offer: ProductOffer, subtotal: number): number {
  if (offer.refereeReward > 0) {
    return roundMoney(Math.min(subtotal, offer.refereeReward));
  }
  return resolveCouponDiscount(offer, subtotal);
}

function paymentMethodMatches(offerMethod: string, saleMethod: string): boolean {
  const a = offerMethod.trim().toLowerCase();
  const b = saleMethod.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}

/** Payment / bank offer when till payment method matches. */
export function findPaymentOffer(
  offers: ProductOffer[],
  paymentMethod: string,
  subtotal: number,
  onDate = todayISO(),
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer | undefined {
  if (!paymentMethod.trim()) return undefined;

  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter((offer) => {
      if (effectiveOfferType(offer) !== "PAYMENT") return false;
      if (offerStatus(offer, onDate) !== "active") return false;
      if (!isOfferUsageAvailable(offer, sales, customerId)) return false;
      if (!paymentMethodMatches(offer.paymentMethod, paymentMethod)) return false;
      if (offer.minBillValue > 0 && subtotal < offer.minBillValue) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

export function resolvePaymentDiscount(offer: ProductOffer, subtotal: number): number {
  return resolveCouponDiscount(offer, subtotal);
}

export function offerUnitOptionsForProduct(
  rateMasters: RateMaster[],
  product: Pick<Product, "name" | "sku" | "category">,
  onDate = todayISO(),
  catalogProduct?: Pick<Product, "price" | "baseUom"> | null,
): Array<{ name: string; sellingPrice: number; source: "rate-master" | "product" }> {
  const entry = findRateMasterForProduct(rateMasters, product, onDate);
  if (entry) {
    return rateMasterSaleUnits(entry.units).map((unit) => ({
      name: unit.name,
      sellingPrice: unit.sellingPrice,
      source: "rate-master" as const,
    }));
  }
  if (!catalogProduct) return [];
  const unitName = catalogProduct.baseUom?.trim() || DEFAULT_BASE_UOM;
  return [
    {
      name: unitName,
      sellingPrice: roundMoney(Math.max(0, Number(catalogProduct.price) || 0)),
      source: "product",
    },
  ];
}

export function listActiveOffers(
  offers: ProductOffer[],
  onDate = todayISO(),
): ProductOffer[] {
  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter((offer) => offerStatus(offer, onDate) === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function emptyOfferDefaults(): Omit<
  ProductOffer,
  "id" | "createdAt" | "updatedAt"
> {
  return {
    name: "",
    offerType: "DISCOUNT",
    status: "active",
    priority: 0,
    productName: "",
    category: "",
    brand: "",
    sku: "",
    unitName: "",
    buyQty: 1,
    freeItemName: "",
    freeItemSku: "",
    freeItemCategory: "",
    freeItemUnit: "",
    freeQty: 1,
    discountType: "OFFER_PRICE",
    discountValue: 10,
    offerPrice: 0,
    minBillValue: 0,
    slabs: [
      { minQty: 1, maxQty: 5, discountPercent: 0 },
      { minQty: 6, maxQty: 10, discountPercent: 5 },
      { minQty: 11, maxQty: null, discountPercent: 10 },
    ],
    couponCode: "",
    paymentMethod: "",
    customerGroup: "",
    eventName: "",
    linkedOfferType: "",
    effectiveFrom: todayISO(),
    effectiveTo: null,
    startTime: "15:00",
    endTime: "17:00",
    daysApplicable: [],
    usageLimit: null,
    perCustomerLimit: null,
    deductStock: true,
    rewardType: "PERCENT",
    giftProductName: "",
    giftSku: "",
    giftCategory: "",
    giftUnit: "",
    giftQty: 1,
    bundleComponents: [],
    bundlePrice: 0,
    cashbackPercent: 5,
    maxCashback: 100,
    mixMatchGroupSkus: [],
    mixMatchQty: 3,
    mixMatchReward: "PERCENT",
    mixMatchFixedPrice: 0,
    referrerReward: 0,
    refereeReward: 0,
    markdownReason: "",
    maxQty: null,
  };
}
