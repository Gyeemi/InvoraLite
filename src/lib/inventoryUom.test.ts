import { describe, expect, it } from "vitest";
import type { Product, SaleItem } from "../types";
import {
  collectKnownUoms,
  costPerBaseFromPurchaseLine,
  getSaleUnitPrice,
  normalizePurchaseItemPrices,
  retailPricePerBaseFromPurchaseLine,
  saleLineCogs,
  toBaseQty,
  weightedAverageCostPerBase,
  wholesalePricePerPurchaseUomFromPurchaseLine,
} from "./inventoryUom";

describe("collectKnownUoms", () => {
  it("merges presets with custom units", () => {
    const options = collectKnownUoms(["case", "pallet", "CASE"]);
    expect(options).toContain("case");
    expect(options).toContain("pallet");
    expect(options).toContain("unit");
  });
});

describe("toBaseQty", () => {
  it("multiplies quantity by conversion factor", () => {
    expect(toBaseQty(3, 12)).toBe(36);
    expect(toBaseQty(5, 1)).toBe(5);
  });
});

describe("weightedAverageCostPerBase", () => {
  it("updates cost per base unit on purchase receipt", () => {
    const next = weightedAverageCostPerBase(100, 10, 50, 12);
    expect(next).toBeCloseTo((100 * 10 + 50 * 12) / 150);
  });

  it("uses incoming cost when stock was zero", () => {
    expect(weightedAverageCostPerBase(0, undefined, 20, 8)).toBe(8);
  });
});

describe("normalizePurchaseItemPrices", () => {
  it("prefers explicit retail over legacy per-carton selling price", () => {
    const item = normalizePurchaseItemPrices({
      name: "Juice",
      category: "Food & Beverage",
      brand: "Fresh",
      hasSpecification: false,
      specification: "",
      quantity: 1,
      costPrice: 80,
      gstPercent: 0,
      retailSellingPrice: 10,
      wholesaleSellingPrice: 120,
      uom: "carton",
      conversionFactor: 12,
      sellingPrice: 119.88,
    });

    expect(item.retailSellingPrice).toBe(10);
    expect(item.wholesaleSellingPrice).toBe(120);
  });

  it("derives per-unit retail from legacy per-carton selling price", () => {
    const item = normalizePurchaseItemPrices({
      name: "Juice",
      category: "Food & Beverage",
      brand: "Fresh",
      hasSpecification: false,
      specification: "",
      quantity: 1,
      costPrice: 80,
      gstPercent: 0,
      retailSellingPrice: 0,
      wholesaleSellingPrice: 0,
      uom: "carton",
      conversionFactor: 12,
      sellingPrice: 119.88,
    });

    expect(item.retailSellingPrice).toBe(9.99);
  });
});

describe("purchase selling prices", () => {
  it("stores retail per base unit and wholesale per purchase UOM", () => {
    expect(retailPricePerBaseFromPurchaseLine(10)).toBe(10);
    expect(wholesalePricePerPurchaseUomFromPurchaseLine(100)).toBe(100);
  });
});

describe("getSaleUnitPrice", () => {
  const product: Product = {
    id: "P-1",
    name: "Widget",
    category: "General",
    sku: "W-01",
    price: 10,
    wholesalePrice: 100,
    wholesaleConversionFactor: 12,
    stock: 50,
    status: "in-stock",
  };

  it("prices retail per base unit scaled by sale UOM", () => {
    expect(getSaleUnitPrice(product, { conversionFactor: 1 })).toBe(10);
    expect(getSaleUnitPrice(product, { conversionFactor: 12 })).toBe(120);
  });

  it("prices wholesale per case without over-multiplying", () => {
    expect(
      getSaleUnitPrice(product, { conversionFactor: 12, customerType: "wholesale" }),
    ).toBe(100);
    expect(
      getSaleUnitPrice(product, { conversionFactor: 1, customerType: "wholesale" }),
    ).toBeCloseTo(100 / 12);
  });

  it("falls back to retail discount when wholesale price unset", () => {
    const { wholesalePrice: _removed, wholesaleConversionFactor: _cf, ...base } = product;
    expect(
      getSaleUnitPrice(base, { conversionFactor: 1, customerType: "wholesale" }),
    ).toBe(9);
  });
});

describe("saleLineCogs", () => {
  it("uses base quantity and cost per base snapshot", () => {
    const item: SaleItem = {
      productId: "P-1",
      productName: "Widget",
      quantity: 2,
      unitPrice: 240,
      total: 480,
      conversionFactor: 12,
      baseQtySold: 24,
      costPerBaseAtSale: 10,
    };

    expect(saleLineCogs(item)).toBe(240);
  });

  it("derives cost per base from purchase line cost", () => {
    expect(costPerBaseFromPurchaseLine(120, 12)).toBe(10);
  });
});
