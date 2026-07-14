import { describe, expect, it } from "vitest";
import { buildSaleItems } from "../components/sales/newSaleLogic";
import { lineSubtotal, lineUnitPrice, type DraftLine } from "../components/sales/newSaleTypes";
import {
  bogoPaidQuantity,
  findActiveOfferForSale,
  findCouponOffer,
  normalizeProductOffer,
  offerStatus,
  offerUnitOptionsForProduct,
  resolveBillValueDiscount,
  resolveCouponDiscount,
  resolveOfferSellingPrice,
  validateProductOfferDraft,
} from "./productOffer";
import type { Product, ProductOffer, RateMaster } from "../types";

const units = [
  { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 0, costPrice: 2800 },
  { level: 2 as const, name: "Tray", qtyPerChild: 30, sellingPrice: 530, costPrice: 0 },
  { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20, costPrice: 0 },
];

function rate(overrides: Partial<RateMaster> = {}): RateMaster {
  return {
    id: "RM-001",
    productName: "Egg",
    category: "Poultry",
    brand: "",
    sku: "EGG-01",
    units,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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
    name: "Tray Special",
    offerType: "DISCOUNT",
    status: "active",
    priority: 0,
    productName: "Egg",
    category: "Poultry",
    brand: "",
    sku: "EGG-01",
    unitName: "Tray",
    buyQty: 1,
    freeItemName: "",
    freeItemSku: "",
    freeItemCategory: "",
    freeItemUnit: "",
    freeQty: 0,
    discountType: "OFFER_PRICE",
    discountValue: 0,
    offerPrice: 480,
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

function draft(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    key: "line-1",
    productId: "PRD-001",
    newProductName: null,
    newProductPrice: "",
    quantity: 1,
    imei1: "",
    uom: "Tray",
    conversionFactor: 30,
    priceType: "retail",
    ...overrides,
  };
}

describe("productOffer Offer Master", () => {
  it("migrates legacy fixed/percent offers", () => {
    const legacy = normalizeProductOffer({
      id: "OFF-LEG",
      name: "Old",
      productName: "Egg",
      category: "Poultry",
      brand: "",
      sku: "EGG-01",
      unitName: "Tray",
      priceMode: "percent",
      offerPrice: 0,
      discountPercent: 10,
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
      createdAt: "",
      updatedAt: "",
    } as unknown as Partial<ProductOffer> & Record<string, unknown>);
    expect(legacy.offerType).toBe("DISCOUNT");
    expect(legacy.discountType).toBe("PERCENT");
    expect(legacy.discountValue).toBe(10);
  });

  it("resolves fixed, percent, flat, and slab prices", () => {
    expect(resolveOfferSellingPrice(offer({ discountType: "OFFER_PRICE", offerPrice: 450 }), 530)).toBe(
      450,
    );
    expect(
      resolveOfferSellingPrice(
        offer({ discountType: "PERCENT", discountValue: 10, offerPrice: 0 }),
        530,
      ),
    ).toBe(477);
    expect(
      resolveOfferSellingPrice(
        offer({ offerType: "FLAT_OFF", discountType: "FLAT", discountValue: 30 }),
        530,
      ),
    ).toBe(500);
    expect(
      resolveOfferSellingPrice(
        offer({
          offerType: "SLAB",
          slabs: [
            { minQty: 1, maxQty: 5, discountPercent: 0 },
            { minQty: 6, maxQty: null, discountPercent: 10 },
          ],
        }),
        530,
        6,
      ),
    ).toBe(477);
  });

  it("computes BOGO paid quantity", () => {
    expect(bogoPaidQuantity(1, 1, 1)).toBe(1);
    expect(bogoPaidQuantity(2, 1, 1)).toBe(1);
    expect(bogoPaidQuantity(3, 1, 1)).toBe(2);
    expect(bogoPaidQuantity(6, 2, 1)).toBe(4);
  });

  it("classifies offer status by date", () => {
    expect(offerStatus(offer({ effectiveFrom: "2026-08-01" }), "2026-07-10")).toBe("scheduled");
    expect(
      offerStatus(offer({ effectiveFrom: "2026-01-01", effectiveTo: "2026-06-01" }), "2026-07-10"),
    ).toBe("expired");
    expect(offerStatus(offer({ status: "inactive" }), "2026-07-10")).toBe("inactive");
  });

  it("validates discount and BOGO drafts", () => {
    expect(
      validateProductOfferDraft({
        name: "",
        offerType: "DISCOUNT",
        productName: "Egg",
        sku: "EGG-01",
        unitName: "Tray",
        discountType: "OFFER_PRICE",
        offerPrice: 480,
        effectiveFrom: "2026-07-10",
      }),
    ).toMatch(/offer name/i);

    expect(
      validateProductOfferDraft({
        name: "1+1",
        offerType: "BOGO",
        productName: "Egg",
        sku: "EGG-01",
        unitName: "Tray",
        buyQty: 1,
        freeQty: 0,
        effectiveFrom: "2026-07-10",
      }),
    ).toMatch(/free quantity/i);
  });

  it("applies discount offers to sale lines", () => {
    const egg = product();
    const masters = [rate()];
    const offers = [offer({ offerPrice: 480 })];

    expect(lineUnitPrice(draft(), [egg], masters)).toBe(530);
    expect(lineUnitPrice(draft(), [egg], masters, offers)).toBe(480);

    const items = buildSaleItems([draft({ quantity: 2 })], [egg], () => {}, masters, offers);
    expect(items?.[0].unitPrice).toBe(480);
    expect(items?.[0].total).toBe(960);
    expect(items?.[0].offerId).toBe("OFF-001");
  });

  it("applies BOGO to line subtotal", () => {
    const egg = product();
    const masters = [rate()];
    const offers = [offer({ offerType: "BOGO", buyQty: 1, freeQty: 1, offerPrice: 0 })];
    expect(lineSubtotal(draft({ quantity: 2 }), [egg], masters, offers)).toBe(530);
  });

  it("resolves bill value discount", () => {
    const bill = offer({
      offerType: "BILL_VALUE",
      minBillValue: 2000,
      rewardType: "PERCENT",
      discountValue: 10,
      productName: "",
      sku: "",
      unitName: "",
    });
    expect(resolveBillValueDiscount(bill, 2500)).toBe(250);
  });

  it("resolves coupon discounts by code", () => {
    const coupons = [
      offer({
        id: "OFF-C1",
        offerType: "COUPON",
        couponCode: "SAVE20",
        discountType: "PERCENT",
        discountValue: 20,
        offerPrice: 0,
        productName: "",
        sku: "",
        unitName: "",
        minBillValue: 1000,
      }),
    ];
    expect(findCouponOffer(coupons, "save20", 1500)?.id).toBe("OFF-C1");
    expect(findCouponOffer(coupons, "SAVE20", 500)).toBeUndefined();
    expect(resolveCouponDiscount(coupons[0], 2000)).toBe(400);
  });

  it("enforces usageLimit from prior sales", () => {
    const limited = offer({
      id: "OFF-LIM",
      usageLimit: 1,
      offerPrice: 400,
    });
    const sales = [
      {
        id: "SAL-1",
        saleDate: "2026-07-01",
        customerName: "A",
        customerId: "CUS-1",
        items: [{ productId: "PRD-001", productName: "Egg", quantity: 1, unitPrice: 400, total: 400, offerId: "OFF-LIM" }],
        productId: "PRD-001",
        productName: "Egg",
        quantity: 1,
        unitPrice: 400,
        total: 400,
        status: "completed" as const,
        paymentMode: "Cash",
      },
    ];
    expect(
      findActiveOfferForSale([limited], product(), "Tray", [rate()], {
        onDate: "2026-07-10",
        sales,
      }),
    ).toBeUndefined();
    expect(
      findActiveOfferForSale([limited], product(), "Tray", [rate()], {
        onDate: "2026-07-10",
        sales: [],
      })?.id,
    ).toBe("OFF-LIM");
  });

  it("applies first-purchase only when flagged", () => {
    const first = offer({
      id: "OFF-FP",
      offerType: "FIRST_PURCHASE",
      discountType: "PERCENT",
      discountValue: 10,
      offerPrice: 0,
    });
    expect(
      findActiveOfferForSale([first], product(), "Tray", [rate()], {
        onDate: "2026-07-10",
        isFirstPurchase: false,
        fallbackUnitPrice: 530,
      }),
    ).toBeUndefined();
    expect(
      findActiveOfferForSale([first], product(), "Tray", [rate()], {
        onDate: "2026-07-10",
        isFirstPurchase: true,
        fallbackUnitPrice: 530,
      })?.id,
    ).toBe("OFF-FP");
  });

  it("applies offers to catalog products without Rate Master", () => {
    const soda = product({
      id: "PRD-010",
      name: "Soda",
      sku: "SODA-01",
      category: "Drinks",
      price: 25,
      baseUom: "Bottle",
      stock: 50,
    });
    const offers = [
      offer({
        id: "OFF-010",
        name: "Soda deal",
        productName: "Soda",
        sku: "SODA-01",
        category: "Drinks",
        unitName: "Bottle",
        offerPrice: 20,
      }),
    ];

    expect(
      offerUnitOptionsForProduct([], soda, "2026-07-10", soda).map((unit) => unit.name),
    ).toEqual(["Bottle"]);
    expect(
      lineUnitPrice(
        draft({ productId: soda.id, uom: "Bottle", conversionFactor: 1 }),
        [soda],
        [],
        offers,
      ),
    ).toBe(20);
  });

  it("picks highest priority then lowest price", () => {
    const selected = findActiveOfferForSale(
      [
        offer({ id: "OFF-A", offerPrice: 500, priority: 1 }),
        offer({ id: "OFF-B", offerPrice: 400, priority: 0 }),
      ],
      product(),
      "Tray",
      [rate()],
      "2026-07-10",
    );
    expect(selected?.id).toBe("OFF-A");
  });
});
