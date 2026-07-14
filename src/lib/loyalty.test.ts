import { describe, expect, it } from "vitest";
import {
  applyLoyaltyEarn,
  applyLoyaltyRedeem,
  clampRedeemPoints,
  computeLoyaltyEarn,
  reverseLoyaltyForReturn,
} from "./loyalty";
import type { Contact, ProductOffer, Sale } from "../types";

function customer(points = 0): Contact {
  return {
    id: "CUS-001",
    name: "Pat",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
    loyaltyPoints: points || undefined,
  };
}

function loyaltyOffer(partial: Partial<ProductOffer> = {}): ProductOffer {
  return {
    id: "OFF-L",
    name: "Loyalty",
    offerType: "LOYALTY",
    status: "active",
    priority: 1,
    productName: "",
    category: "",
    brand: "",
    sku: "",
    unitName: "",
    buyQty: 0,
    freeItemName: "",
    freeItemSku: "",
    freeItemCategory: "",
    freeItemUnit: "",
    freeQty: 0,
    discountType: "PERCENT",
    discountValue: 1,
    offerPrice: 0,
    minBillValue: 0,
    slabs: [],
    couponCode: "",
    paymentMethod: "",
    customerGroup: "",
    eventName: "",
    linkedOfferType: "",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    startTime: "",
    endTime: "",
    daysApplicable: [],
    usageLimit: null,
    perCustomerLimit: null,
    deductStock: true,
    rewardType: "PERCENT",
    giftProductName: "",
    giftSku: "",
    giftCategory: "",
    giftUnit: "",
    giftQty: 0,
    bundleComponents: [],
    bundlePrice: 0,
    cashbackPercent: 100,
    maxCashback: 0,
    mixMatchGroupSkus: [],
    mixMatchQty: 0,
    mixMatchReward: "PERCENT",
    mixMatchFixedPrice: 0,
    referrerReward: 0,
    refereeReward: 0,
    markdownReason: "",
    maxQty: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("loyalty earn / redeem", () => {
  it("earns 1:1 by default (100 points per 100 Nu)", () => {
    expect(computeLoyaltyEarn(250.9)).toBe(250);
    expect(computeLoyaltyEarn(100, loyaltyOffer({ cashbackPercent: 50 }))).toBe(50);
  });

  it("clamps redeem by balance and sale total", () => {
    const result = clampRedeemPoints(999, 40, 25, loyaltyOffer({ discountValue: 1 }));
    expect(result.points).toBe(25);
    expect(result.discount).toBe(25);
  });

  it("updates customer balances", () => {
    const earned = applyLoyaltyEarn([customer(10)], "CUS-001", 5);
    expect(earned[0].loyaltyPoints).toBe(15);
    const redeemed = applyLoyaltyRedeem(earned, "CUS-001", 8);
    expect(redeemed[0].loyaltyPoints).toBe(7);
  });

  it("reverses earn proportionally on return", () => {
    const sale: Sale = {
      id: "SAL-001",
      saleDate: "2026-07-13",
      customerName: "Pat",
      customerId: "CUS-001",
      items: [],
      productId: "P1",
      productName: "Item",
      quantity: 1,
      unitPrice: 200,
      total: 200,
      status: "completed",
      paymentMode: "Cash",
      loyaltyPointsEarned: 200,
    };
    const next = reverseLoyaltyForReturn([customer(200)], sale, 50);
    expect(next[0].loyaltyPoints).toBe(150);
  });
});
