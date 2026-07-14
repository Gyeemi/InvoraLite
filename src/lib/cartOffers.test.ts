import { describe, expect, it } from "vitest";
import { bogoStockQuantity, resolveCartOffers } from "./cartOffers";
import { normalizeProductOffer } from "./productOffer";
import type { Product, ProductOffer } from "../types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "PRD-001",
    name: "Egg",
    category: "Poultry",
    sku: "EGG-01",
    price: 20,
    stock: 1000,
    status: "in-stock",
    brand: "",
    costPrice: 14,
    baseUom: "Piece",
    ...overrides,
  };
}

function offer(overrides: Partial<ProductOffer> = {}): ProductOffer {
  return normalizeProductOffer({
    id: "OFF-001",
    name: "Test",
    offerType: "BUY_X_GET_Y",
    status: "active",
    priority: 0,
    productName: "Egg",
    category: "Poultry",
    brand: "",
    sku: "EGG-01",
    unitName: "",
    buyQty: 2,
    freeItemName: "Tray liner",
    freeItemSku: "LINER-01",
    freeItemCategory: "Poultry",
    freeItemUnit: "Piece",
    freeQty: 1,
    discountType: "PERCENT",
    discountValue: 0,
    offerPrice: 0,
    minBillValue: 0,
    slabs: [],
    couponCode: "",
    paymentMethod: "",
    customerGroup: "",
    eventName: "",
    linkedOfferType: "",
    effectiveFrom: "2025-01-01",
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
    cashbackPercent: 0,
    maxCashback: 0,
    mixMatchGroupSkus: [],
    mixMatchQty: 1,
    mixMatchReward: "PERCENT",
    mixMatchFixedPrice: 0,
    referrerReward: 0,
    refereeReward: 0,
    markdownReason: "",
    maxQty: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("cartOffers", () => {
  it("adds free gift lines for Buy X Get Y", () => {
    const egg = product();
    const liner = product({
      id: "PRD-002",
      name: "Tray liner",
      sku: "LINER-01",
      price: 5,
    });
    const result = resolveCartOffers(
      [
        {
          productId: egg.id,
          quantity: 4,
          uom: "Piece",
          conversionFactor: 1,
          unitListPrice: 20,
          unitPrice: 20,
          total: 80,
        },
      ],
      [egg, liner],
      [offer()],
      [],
    );
    expect(result.giftItems).toHaveLength(1);
    expect(result.giftItems[0].productId).toBe("PRD-002");
    expect(result.giftItems[0].quantity).toBe(2);
    expect(result.giftItems[0].total).toBe(0);
    expect(result.appliedOfferIds).toContain("OFF-001");
  });

  it("respects deductStock=false for BOGO stock qty", () => {
    const bogo = offer({ offerType: "BOGO", buyQty: 1, freeQty: 1, deductStock: false });
    expect(bogoStockQuantity(2, bogo, 1)).toBe(1);
    expect(bogoStockQuantity(2, { ...bogo, deductStock: true }, 1)).toBe(2);
  });

  it("applies payment offer discount", () => {
    const pay = offer({
      id: "OFF-PAY",
      offerType: "PAYMENT",
      paymentMethod: "Cash",
      discountType: "FLAT",
      discountValue: 50,
      productName: "",
      sku: "",
    });
    const result = resolveCartOffers(
      [
        {
          productId: "PRD-001",
          quantity: 1,
          uom: "Piece",
          conversionFactor: 1,
          unitListPrice: 200,
          unitPrice: 200,
          total: 200,
        },
      ],
      [product()],
      [pay],
      [],
      { paymentMethod: "Cash" },
    );
    expect(result.cartDiscount).toBe(50);
    expect(result.cartDiscountLabel).toBe("Payment offer");
  });
});
