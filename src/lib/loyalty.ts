import { roundMoney } from "./constants";
import type { Contact, ProductOffer, Sale } from "../types";

/** Default: 1 loyalty point per 1.00 currency unit of sale total. */
export const DEFAULT_LOYALTY_EARN_PER_HUNDRED = 100;

/** Default: 1 point redeems as 1.00 currency unit. */
export const DEFAULT_LOYALTY_REDEEM_VALUE = 1;

export function activeLoyaltyOffer(offers: ProductOffer[]): ProductOffer | undefined {
  return offers.find((offer) => offer.offerType === "LOYALTY" && offer.status === "active");
}

/** Points earned per 100 currency units (from offer.cashbackPercent, else 100 = 1:1). */
export function loyaltyEarnPerHundred(offer?: ProductOffer | null): number {
  if (!offer) return DEFAULT_LOYALTY_EARN_PER_HUNDRED;
  const rate = Number(offer.cashbackPercent);
  if (!Number.isFinite(rate) || rate <= 0) return DEFAULT_LOYALTY_EARN_PER_HUNDRED;
  return rate;
}

/** Currency value of one redeemed point (from offer.discountValue, else 1). */
export function loyaltyRedeemValue(offer?: ProductOffer | null): number {
  if (!offer) return DEFAULT_LOYALTY_REDEEM_VALUE;
  const value = Number(offer.discountValue);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LOYALTY_REDEEM_VALUE;
  return value;
}

export function computeLoyaltyEarn(saleTotal: number, offer?: ProductOffer | null): number {
  if (saleTotal <= 0) return 0;
  const perHundred = loyaltyEarnPerHundred(offer);
  return Math.max(0, Math.floor((saleTotal * perHundred) / 100));
}

export function clampRedeemPoints(
  requested: number,
  balance: number,
  saleTotal: number,
  offer?: ProductOffer | null,
): { points: number; discount: number } {
  const redeemValue = loyaltyRedeemValue(offer);
  const maxByBalance = Math.max(0, Math.floor(balance));
  const maxBySale = redeemValue > 0 ? Math.floor(saleTotal / redeemValue) : 0;
  const points = Math.max(0, Math.min(Math.floor(requested), maxByBalance, maxBySale));
  const discount = roundMoney(points * redeemValue);
  return { points, discount };
}

export function applyLoyaltyEarn(
  customers: Contact[],
  customerId: string | undefined,
  points: number,
): Contact[] {
  if (!customerId || points <= 0) return customers;
  return customers.map((customer) =>
    customer.id === customerId
      ? { ...customer, loyaltyPoints: (customer.loyaltyPoints ?? 0) + points }
      : customer,
  );
}

export function applyLoyaltyRedeem(
  customers: Contact[],
  customerId: string | undefined,
  points: number,
): Contact[] {
  if (!customerId || points <= 0) return customers;
  return customers.map((customer) => {
    if (customer.id !== customerId) return customer;
    const next = Math.max(0, (customer.loyaltyPoints ?? 0) - points);
    return { ...customer, loyaltyPoints: next > 0 ? next : undefined };
  });
}

/** Reverse points previously earned on a sale, proportional to return total. */
export function reverseLoyaltyForReturn(
  customers: Contact[],
  sale: Sale,
  returnTotal: number,
): Contact[] {
  if (!sale.customerId || returnTotal <= 0) return customers;
  const earned = sale.loyaltyPointsEarned ?? 0;
  if (earned <= 0 || sale.total <= 0) return customers;
  const share = Math.min(1, returnTotal / sale.total);
  const reverse = Math.max(0, Math.floor(earned * share));
  return applyLoyaltyRedeem(customers, sale.customerId, reverse);
}
