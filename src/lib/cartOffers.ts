import { roundMoney } from "./constants";
import { DEFAULT_BASE_UOM, toBaseQty } from "./inventoryUom";
import {
  effectiveOfferType,
  findActiveBogoOffer,
  findBillValueOffers,
  findCouponOffer,
  findPaymentOffer,
  findReferralOffer,
  isOfferUsageAvailable,
  normalizeProductOffer,
  offerMatchesProduct,
  offerStatus,
  resolveBillValueDiscount,
  resolveCouponDiscount,
  resolveOfferSellingPrice,
  resolvePaymentDiscount,
  resolveReferralDiscount,
  todayOfferDate,
} from "./productOffer";
import type { Product, ProductOffer, RateMaster, Sale, SaleItem } from "../types";
import { productGstPercent } from "./gst";
import { findRateMasterForProduct, matchRateMasterSaleUnit } from "./rateMaster";

export type CartLineInput = {
  productId: string;
  quantity: number;
  uom: string;
  conversionFactor: number;
  unitListPrice: number;
  unitPrice: number;
  total: number;
  offerId?: string;
  offerName?: string;
};

export type CartOfferContext = {
  onDate?: string;
  customerId?: string;
  customerGroup?: string;
  isFirstPurchase?: boolean;
  paymentMethod?: string;
  couponCode?: string;
  sales?: Sale[];
  /** Manual discount already chosen — cart offers skip competing bill discounts. */
  manualDiscount?: number;
};

export type CartOfferResult = {
  /** Extra cart-level discount (coupon / bill / payment / referral / mix-match / combo). */
  cartDiscount: number;
  cartDiscountLabel: string;
  /** Estimated cashback to record on the sale (paid later). */
  cashbackAmount: number;
  appliedOfferIds: string[];
  /** Free / discounted gift lines to append (product must exist). */
  giftItems: SaleItem[];
  /** Line index → override total (combo / mix-match). */
  lineTotalOverrides: Map<number, number>;
};

function activeOffers(offers: ProductOffer[], onDate: string, sales: Sale[], customerId?: string) {
  return offers
    .map((entry) => normalizeProductOffer(entry as Partial<ProductOffer> & Record<string, unknown>))
    .filter(
      (offer) =>
        offerStatus(offer, onDate) === "active" &&
        isOfferUsageAvailable(offer, sales, customerId),
    );
}

function findGiftProduct(
  products: Product[],
  sku: string,
  name: string,
  category: string,
): Product | undefined {
  const skuNeedle = sku.trim().toLowerCase();
  if (skuNeedle) {
    const bySku = products.find((p) => (p.sku ?? "").trim().toLowerCase() === skuNeedle);
    if (bySku) return bySku;
  }
  const nameNeedle = name.trim().toLowerCase();
  if (!nameNeedle) return undefined;
  return products.find(
    (p) =>
      p.name.trim().toLowerCase() === nameNeedle &&
      (!category.trim() || p.category.trim().toLowerCase() === category.trim().toLowerCase()),
  );
}

function giftSaleItem(
  product: Product,
  qty: number,
  uom: string,
  offer: ProductOffer,
  deductStock: boolean,
  unitPrice = 0,
): SaleItem {
  const conversionFactor = 1;
  const chargeQty = deductStock ? qty : 0;
  return {
    productId: product.id,
    productName: product.name,
    quantity: qty,
    unitPrice,
    total: roundMoney(unitPrice * qty),
    gstPercent: productGstPercent(product),
    uom: uom.trim() || product.baseUom || DEFAULT_BASE_UOM,
    conversionFactor,
    baseQtySold: toBaseQty(chargeQty, conversionFactor),
    costPerBaseAtSale: product.costPrice,
    offerId: offer.id,
    offerName: offer.name,
  };
}

/**
 * Resolve cart-level offer effects after line prices are known.
 * Does not mutate line unit-price offers (those stay in findActiveOfferForSale).
 */
export function resolveCartOffers(
  lines: CartLineInput[],
  products: Product[],
  offers: ProductOffer[],
  _rateMasters: RateMaster[],
  ctx: CartOfferContext = {},
): CartOfferResult {
  const onDate = ctx.onDate ?? todayOfferDate();
  const sales = ctx.sales ?? [];
  const list = activeOffers(offers, onDate, sales, ctx.customerId);
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const appliedOfferIds: string[] = [];
  const giftItems: SaleItem[] = [];
  const lineTotalOverrides = new Map<number, number>();

  // Track line-level offers already applied
  for (const line of lines) {
    if (line.offerId) appliedOfferIds.push(line.offerId);
  }

  // BUY_X_GET_Y / BUY_X_GET_Y_DISC / FREE_GIFT (product-triggered)
  for (const offer of list) {
    const type = effectiveOfferType(offer);
    if (type !== "BUY_X_GET_Y" && type !== "BUY_X_GET_Y_DISC" && type !== "FREE_GIFT") continue;

    const triggerLines = lines.filter((line) => {
      const product = products.find((p) => p.id === line.productId);
      return product && offerMatchesProduct(offer, product);
    });
    const triggerQty = triggerLines.reduce((sum, line) => sum + line.quantity, 0);
    const billOk = offer.minBillValue <= 0 || subtotal >= offer.minBillValue;

    if (type === "FREE_GIFT") {
      if (!billOk && triggerQty === 0) continue;
      if (offer.productName.trim() || offer.sku.trim()) {
        if (triggerQty < Math.max(1, offer.buyQty)) continue;
      } else if (!billOk) {
        continue;
      }
      const gift = findGiftProduct(
        products,
        offer.giftSku || offer.freeItemSku,
        offer.giftProductName || offer.freeItemName,
        offer.giftCategory || offer.freeItemCategory,
      );
      if (!gift || offer.giftQty <= 0) continue;
      giftItems.push(
        giftSaleItem(
          gift,
          offer.giftQty,
          offer.giftUnit || offer.freeItemUnit || gift.baseUom || DEFAULT_BASE_UOM,
          offer,
          offer.deductStock,
          0,
        ),
      );
      appliedOfferIds.push(offer.id);
      continue;
    }

    if (triggerQty < offer.buyQty) continue;
    const sets = Math.floor(triggerQty / offer.buyQty);
    const freeQty = Math.max(0, offer.freeQty) * sets;
    if (freeQty <= 0) continue;
    const gift = findGiftProduct(
      products,
      offer.freeItemSku,
      offer.freeItemName,
      offer.freeItemCategory,
    );
    if (!gift) continue;

    if (type === "BUY_X_GET_Y") {
      giftItems.push(
        giftSaleItem(
          gift,
          freeQty,
          offer.freeItemUnit || gift.baseUom || DEFAULT_BASE_UOM,
          offer,
          offer.deductStock,
          0,
        ),
      );
      appliedOfferIds.push(offer.id);
    } else {
      // BUY_X_GET_Y_DISC — Y at discounted price
      const listPrice = gift.price;
      const discUnit = resolveOfferSellingPrice(offer, listPrice, freeQty);
      giftItems.push(
        giftSaleItem(
          gift,
          freeQty,
          offer.freeItemUnit || gift.baseUom || DEFAULT_BASE_UOM,
          offer,
          offer.deductStock,
          discUnit,
        ),
      );
      appliedOfferIds.push(offer.id);
    }
  }

  // COMBO — if all components present, override matching line totals to share bundlePrice
  const comboOffers = list
    .filter((o) => effectiveOfferType(o) === "COMBO" && o.bundleComponents.length > 0)
    .sort((a, b) => b.priority - a.priority);
  for (const offer of comboOffers) {
    const componentIndexes: number[] = [];
    let ok = true;
    for (const component of offer.bundleComponents) {
      const idx = lines.findIndex((line, i) => {
        if (componentIndexes.includes(i)) return false;
        const product = products.find((p) => p.id === line.productId);
        if (!product) return false;
        const skuOk =
          !component.sku.trim() ||
          (product.sku ?? "").trim().toLowerCase() === component.sku.trim().toLowerCase();
        const nameOk =
          !component.productName.trim() ||
          product.name.trim().toLowerCase() === component.productName.trim().toLowerCase();
        const qtyOk = line.quantity >= Math.max(1, component.quantity);
        const uomOk =
          !component.unitName.trim() ||
          line.uom.trim().toLowerCase() === component.unitName.trim().toLowerCase();
        return skuOk && nameOk && qtyOk && uomOk;
      });
      if (idx < 0) {
        ok = false;
        break;
      }
      componentIndexes.push(idx);
    }
    if (!ok || componentIndexes.length === 0) continue;
    const currentSum = componentIndexes.reduce((sum, i) => sum + lines[i].total, 0);
    const target = roundMoney(Math.max(0, offer.bundlePrice));
    if (currentSum <= 0) continue;
    for (const i of componentIndexes) {
      const share = lines[i].total / currentSum;
      lineTotalOverrides.set(i, roundMoney(target * share));
    }
    appliedOfferIds.push(offer.id);
    break;
  }

  // MIX_MATCH — any N from group SKUs
  const mixOffers = list
    .filter((o) => effectiveOfferType(o) === "MIX_MATCH" && o.mixMatchGroupSkus.length > 0)
    .sort((a, b) => b.priority - a.priority);
  for (const offer of mixOffers) {
    const group = new Set(offer.mixMatchGroupSkus.map((s) => s.trim().toLowerCase()).filter(Boolean));
    const idxs = lines
      .map((line, i) => {
        const product = products.find((p) => p.id === line.productId);
        const sku = (product?.sku ?? "").trim().toLowerCase();
        return product && group.has(sku) ? i : -1;
      })
      .filter((i) => i >= 0);
    const totalQty = idxs.reduce((sum, i) => sum + lines[i].quantity, 0);
    if (totalQty < offer.mixMatchQty) continue;

    if (offer.mixMatchReward === "CHEAPEST_FREE") {
      let lowestIdx = idxs[0];
      let lowestUnit = lines[lowestIdx].unitPrice;
      for (const i of idxs) {
        if (lines[i].unitPrice < lowestUnit) {
          lowestUnit = lines[i].unitPrice;
          lowestIdx = i;
        }
      }
      const line = lines[lowestIdx];
      const freeUnits = 1;
      const newTotal = roundMoney(line.unitPrice * Math.max(0, line.quantity - freeUnits));
      lineTotalOverrides.set(lowestIdx, newTotal);
    } else if (offer.mixMatchReward === "FIXED_PRICE") {
      const currentSum = idxs.reduce((sum, i) => sum + lines[i].total, 0);
      const target = roundMoney(Math.max(0, offer.mixMatchFixedPrice));
      if (currentSum > 0) {
        for (const i of idxs) {
          lineTotalOverrides.set(i, roundMoney(target * (lines[i].total / currentSum)));
        }
      }
    } else {
      // PERCENT off the mix group
      const pct = Math.min(100, Math.max(0, offer.discountValue));
      for (const i of idxs) {
        lineTotalOverrides.set(i, roundMoney(lines[i].total * (1 - pct / 100)));
      }
    }
    appliedOfferIds.push(offer.id);
    break;
  }

  // Cart discounts: coupon / referral / payment / bill-value (best one unless manual)
  let cartDiscount = 0;
  let cartDiscountLabel = "";
  const manual = Math.max(0, ctx.manualDiscount ?? 0);

  if (manual <= 0) {
    const candidates: Array<{ amount: number; label: string; id: string }> = [];

    const coupon = findCouponOffer(list, ctx.couponCode ?? "", subtotal, onDate, sales, ctx.customerId);
    if (coupon) {
      candidates.push({
        amount: resolveCouponDiscount(coupon, subtotal),
        label: "Coupon discount",
        id: coupon.id,
      });
    }

    const referral = findReferralOffer(list, ctx.couponCode ?? "", subtotal, onDate, sales, ctx.customerId);
    if (referral) {
      candidates.push({
        amount: resolveReferralDiscount(referral, subtotal),
        label: "Referral discount",
        id: referral.id,
      });
    }

    const payment = findPaymentOffer(
      list,
      ctx.paymentMethod ?? "",
      subtotal,
      onDate,
      sales,
      ctx.customerId,
    );
    if (payment) {
      candidates.push({
        amount: resolvePaymentDiscount(payment, subtotal),
        label: "Payment offer",
        id: payment.id,
      });
    }

    const bill = findBillValueOffers(list, subtotal, onDate, sales, ctx.customerId)[0];
    if (bill) {
      candidates.push({
        amount: resolveBillValueDiscount(bill, subtotal),
        label: "Bill offer discount",
        id: bill.id,
      });
    }

    candidates.sort((a, b) => b.amount - a.amount);
    const best = candidates[0];
    if (best && best.amount > 0) {
      cartDiscount = Math.min(best.amount, subtotal);
      cartDiscountLabel = best.label;
      appliedOfferIds.push(best.id);
    }
  }

  // CASHBACK — estimate from matching product or whole bill
  let cashbackAmount = 0;
  const cashbackOffers = list
    .filter((o) => effectiveOfferType(o) === "CASHBACK")
    .sort((a, b) => b.priority - a.priority);
  for (const offer of cashbackOffers) {
    let base = 0;
    if (offer.productName.trim() || offer.sku.trim()) {
      for (const line of lines) {
        const product = products.find((p) => p.id === line.productId);
        if (product && offerMatchesProduct(offer, product)) base += line.total;
      }
    } else {
      base = subtotal;
    }
    if (base <= 0) continue;
    if (offer.minBillValue > 0 && subtotal < offer.minBillValue) continue;
    const raw = roundMoney(base * (offer.cashbackPercent / 100));
    cashbackAmount = roundMoney(
      Math.min(raw, offer.maxCashback > 0 ? offer.maxCashback : raw),
    );
    if (cashbackAmount > 0) {
      appliedOfferIds.push(offer.id);
      break;
    }
  }

  return {
    cartDiscount,
    cartDiscountLabel,
    cashbackAmount,
    appliedOfferIds: [...new Set(appliedOfferIds)],
    giftItems,
    lineTotalOverrides,
  };
}

/** BOGO stock qty: full line when deductStock, else paid qty only. */
export function bogoStockQuantity(
  quantity: number,
  bogo: ProductOffer | undefined,
  paidQty: number,
): number {
  if (!bogo) return quantity;
  return bogo.deductStock === false ? paidQty : quantity;
}

export function findLineBogo(
  offers: ProductOffer[],
  product: Product,
  uom: string,
  onDate?: string,
  sales: Sale[] = [],
  customerId?: string,
): ProductOffer | undefined {
  const offer = findActiveBogoOffer(offers, product, uom, onDate);
  if (!offer) return undefined;
  if (!isOfferUsageAvailable(offer, sales, customerId)) return undefined;
  return offer;
}

export function rateUnitForLine(
  rateMasters: RateMaster[],
  product: Product,
  uom: string,
) {
  return matchRateMasterSaleUnit(findRateMasterForProduct(rateMasters, product), uom);
}
