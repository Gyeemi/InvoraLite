import type { OfferType } from "../types";

export const OFFER_TYPES: OfferType[] = [
  "DISCOUNT",
  "BOGO",
  "BUY_X_GET_Y",
  "EVENT",
  "SLAB",
  "BUY_X_GET_Y_DISC",
  "FLAT_OFF",
  "BILL_VALUE",
  "FREE_GIFT",
  "COMBO",
  "LOYALTY",
  "COUPON",
  "CASHBACK",
  "PAYMENT",
  "CLEARANCE",
  "TIME_BOUND",
  "MEMBERSHIP",
  "MIX_MATCH",
  "FIRST_PURCHASE",
  "REFERRAL",
];

export const OFFER_TYPE_META: Record<
  OfferType,
  { label: string; short: string; trigger: string; reward: string }
> = {
  DISCOUNT: {
    label: "Discount Offer (Flat / %)",
    short: "Discount",
    trigger: "Buy item",
    reward: "Reduced price",
  },
  BOGO: {
    label: "Buy One Get One Free (BOGO / 1+1)",
    short: "BOGO",
    trigger: "Buy same item",
    reward: "Same item free",
  },
  BUY_X_GET_Y: {
    label: "Buy X Get Y Free (Combo/Cross)",
    short: "Buy X Get Y Free",
    trigger: "Buy item A",
    reward: "Different item B free",
  },
  EVENT: {
    label: "Event / Seasonal Offer",
    short: "Event",
    trigger: "Date range",
    reward: "Any linked offer type",
  },
  SLAB: {
    label: "Quantity / Slab (Bulk) Offer",
    short: "Slab",
    trigger: "Buy in quantity tiers",
    reward: "Tiered discount",
  },
  BUY_X_GET_Y_DISC: {
    label: "Buy X Get Y at Discount",
    short: "Buy X Get Y Disc",
    trigger: "Buy item",
    reward: "Another item at reduced price",
  },
  FLAT_OFF: {
    label: "Flat Amount Off",
    short: "Flat Off",
    trigger: "Buy item / bill",
    reward: "Fixed amount deducted",
  },
  BILL_VALUE: {
    label: "Bill / Cart Value Offer",
    short: "Bill Value",
    trigger: "Total bill ≥ threshold",
    reward: "Discount or gift",
  },
  FREE_GIFT: {
    label: "Free Gift / Freebie on Purchase",
    short: "Free Gift",
    trigger: "Buy item / bill value",
    reward: "Free product",
  },
  COMBO: {
    label: "Combo / Bundle (Package) Offer",
    short: "Combo",
    trigger: "Buy grouped items",
    reward: "Fixed bundle price",
  },
  LOYALTY: {
    label: "Loyalty / Points Redemption",
    short: "Loyalty",
    trigger: "Member points",
    reward: "Discount / free item",
  },
  COUPON: {
    label: "Coupon / Voucher Code",
    short: "Coupon",
    trigger: "Enter code",
    reward: "Discount / gift",
  },
  CASHBACK: {
    label: "Cashback Offer",
    short: "Cashback",
    trigger: "Buy / pay",
    reward: "Amount returned later",
  },
  PAYMENT: {
    label: "Payment / Bank Offer",
    short: "Payment",
    trigger: "Pay via method",
    reward: "Instant discount / cashback",
  },
  CLEARANCE: {
    label: "Clearance / Markdown Offer",
    short: "Clearance",
    trigger: "Buy flagged item",
    reward: "Deep discount",
  },
  TIME_BOUND: {
    label: "Time-Bound (Flash / Happy Hours)",
    short: "Time-Bound",
    trigger: "Buy within time window",
    reward: "Special price",
  },
  MEMBERSHIP: {
    label: "Membership / Tier Price Offer",
    short: "Membership",
    trigger: "Customer group",
    reward: "Special price list",
  },
  MIX_MATCH: {
    label: "Mix & Match Offer",
    short: "Mix & Match",
    trigger: "Buy any N from a group",
    reward: "Discount / free lowest",
  },
  FIRST_PURCHASE: {
    label: "First Purchase / New Customer Offer",
    short: "First Purchase",
    trigger: "First transaction",
    reward: "Discount / gift",
  },
  REFERRAL: {
    label: "Referral Offer",
    short: "Referral",
    trigger: "Refer a customer",
    reward: "Discount / credit",
  },
};

/**
 * Offer types applied automatically at New Sale / till.
 * All Offer Master types are checkout-wired (cart or unit price).
 */
export const CHECKOUT_LIVE_OFFER_TYPES: OfferType[] = [...OFFER_TYPES];

/** Offer types that primarily change a single product unit price. */
export const UNIT_PRICE_OFFER_TYPES: OfferType[] = [
  "DISCOUNT",
  "FLAT_OFF",
  "CLEARANCE",
  "TIME_BOUND",
  "SLAB",
  "MEMBERSHIP",
  "FIRST_PURCHASE",
  "LOYALTY",
];
export function isCheckoutLiveOfferType(type: OfferType): boolean {
  return CHECKOUT_LIVE_OFFER_TYPES.includes(type);
}

export function isSavedOnlyOfferType(type: OfferType): boolean {
  return !isCheckoutLiveOfferType(type);
}

/** Whether a saved offer record is expected to apply at till today. */
export function isOfferCheckoutLive(offer: {
  offerType: OfferType;
  linkedOfferType?: OfferType | "";
}): boolean {
  if (offer.offerType === "EVENT") {
    const linked = offer.linkedOfferType;
    if (!linked || linked === "EVENT") return false;
    return isCheckoutLiveOfferType(linked);
  }
  return isCheckoutLiveOfferType(offer.offerType);
}

export function offerTypeLabel(type: OfferType): string {
  return OFFER_TYPE_META[type]?.label ?? type;
}

export function offerTypeShort(type: OfferType): string {
  return OFFER_TYPE_META[type]?.short ?? type;
}
