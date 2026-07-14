import { describe, expect, it } from "vitest";
import { buildSaleItems } from "../components/sales/newSaleLogic";
import { lineSubtotal, lineUnitPrice, type DraftLine } from "../components/sales/newSaleTypes";
import {
  applyPurchaseCostsToRateMasters,
  findRateMasterForProduct,
  insertRatePeriod,
  listCurrentRateMasters,
  matchRateMasterSaleUnit,
  rateHistoryPriceSummary,
  rateMasterSaleUnits,
  resolveRateMasterSaleUnitForQuantity,
} from "./rateMaster";
import type { Product, RateMaster } from "../types";

const units = [
  { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 0, costPrice: 2800 },
  { level: 2 as const, name: "Tray", qtyPerChild: 30, sellingPrice: 530, costPrice: 0 },
  { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20, costPrice: 0 },
];

function rate(overrides: Partial<RateMaster> & Pick<RateMaster, "id" | "effectiveFrom">): RateMaster {
  return {
    productName: "Egg",
    category: "Poultry",
    brand: "",
    sku: "EGG-01",
    units,
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

function draft(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    key: "line-1",
    productId: "PRD-001",
    newProductName: null,
    newProductPrice: "",
    quantity: 1,
    imei1: "",
    uom: "Piece",
    conversionFactor: 1,
    priceType: "retail",
    ...overrides,
  };
}

describe("Rate Master ↔ Purchase ↔ Sales wiring", () => {
  it("omits blank Unit 1 selling price from sale UOM options", () => {
    const saleUnits = rateMasterSaleUnits(units);
    expect(saleUnits.map((unit) => unit.name)).toEqual([
      "Tray",
      "Half Tray",
      "Piece",
    ]);
    expect(saleUnits.find((unit) => unit.name === "Carton")).toBeUndefined();
  });

  it("history summary marks mid column only for 3+ levels and dashes blank purchase sell", () => {
    const three = rateHistoryPriceSummary(rate({ id: "RM-1", effectiveFrom: "2026-01-01" }));
    expect(three.hasMid).toBe(true);
    expect(three.purchaseCost).toBe(2800);
    expect(three.purchasePrice).toBe(0);
    expect(three.midPrice).toBe(530);
    expect(three.basePrice).toBe(20);

    const twoLevel = rateHistoryPriceSummary(
      rate({
        id: "RM-2",
        effectiveFrom: "2026-01-01",
        units: [
          { level: 1, name: "Box", qtyPerChild: 10, sellingPrice: 350, costPrice: 300 },
          { level: 2, name: "Piece", qtyPerChild: 1, sellingPrice: 35, costPrice: 0 },
        ],
      }),
    );
    expect(twoLevel.hasMid).toBe(false);
    expect(twoLevel.purchaseCost).toBe(300);
    expect(twoLevel.basePrice).toBe(35);
  });

  it("purchase cost updates only the active rate period Unit 1", () => {
    const list = [
      rate({ id: "RM-OLD", effectiveFrom: "2025-01-01", effectiveTo: "2025-11-14" }),
      rate({ id: "RM-NEW", effectiveFrom: "2025-11-15", effectiveTo: null }),
    ];
    const next = applyPurchaseCostsToRateMasters(
      list,
      [{ name: "Egg", sku: "EGG-01", category: "Poultry", costPrice: 3150 }],
      "2025-12-01",
    );
    expect(next.find((entry) => entry.id === "RM-OLD")?.units[0]?.costPrice).toBe(2800);
    expect(next.find((entry) => entry.id === "RM-NEW")?.units[0]?.costPrice).toBe(3150);
  });

  it("listCurrentRateMasters returns one row per product (active period)", () => {
    const list = [
      rate({ id: "RM-OLD", effectiveFrom: "2025-01-01", effectiveTo: "2025-11-14" }),
      rate({ id: "RM-NEW", effectiveFrom: "2025-11-15", effectiveTo: null }),
      rate({
        id: "RM-OTHER",
        productName: "Milk",
        sku: "MLK-01",
        category: "Dairy",
        effectiveFrom: "2025-06-01",
        effectiveTo: null,
        units: [
          { level: 1, name: "Case", qtyPerChild: 12, sellingPrice: 600, costPrice: 500 },
          { level: 2, name: "Bottle", qtyPerChild: 1, sellingPrice: 55, costPrice: 0 },
        ],
      }),
    ];
    const current = listCurrentRateMasters(list, "2025-12-01");
    expect(current.map((entry) => entry.id).sort()).toEqual(["RM-NEW", "RM-OTHER"]);
  });

  it("sales pricing uses Rate Master unit price and conversion for stock", () => {
    const egg = product();
    const masters = [rate({ id: "RM-1", effectiveFrom: "2026-01-01" })];
    const trayLine = draft({ uom: "Tray", conversionFactor: 30, quantity: 2 });

    expect(lineUnitPrice(trayLine, [egg], masters)).toBe(530);
    expect(lineSubtotal(trayLine, [egg], masters)).toBe(1060);

    let error = "";
    const items = buildSaleItems([trayLine], [egg], (message) => {
      error = message;
    }, masters);

    expect(error).toBe("");
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({
      uom: "Tray",
      conversionFactor: 30,
      quantity: 2,
      unitPrice: 530,
      total: 1060,
      baseQtySold: 60,
    });
  });

  it("sales reject qty that exceeds stock in base units via RM conversion", () => {
    const egg = product({ stock: 50 });
    const masters = [rate({ id: "RM-1", effectiveFrom: "2026-01-01" })];
    let error = "";
    const items = buildSaleItems(
      [draft({ uom: "Tray", conversionFactor: 30, quantity: 2 })],
      [egg],
      (message) => {
        error = message;
      },
      masters,
    );
    expect(items).toBeNull();
    expect(error).toMatch(/Insufficient stock/);
  });

  it("qty auto-convert then sale uses the upgraded unit price", () => {
    const masters = [rate({ id: "RM-1", effectiveFrom: "2026-01-01" })];
    const saleUnits = rateMasterSaleUnits(masters[0]!.units);
    const converted = resolveRateMasterSaleUnitForQuantity(saleUnits, "Piece", 30);
    expect(converted?.unit.name).toBe("Tray");
    expect(converted?.quantity).toBe(1);

    const egg = product();
    const line = draft({
      uom: converted!.unit.name,
      conversionFactor: converted!.unit.conversionFactor,
      quantity: converted!.quantity,
    });
    expect(lineUnitPrice(line, [egg], masters)).toBe(530);

    let error = "";
    const items = buildSaleItems([line], [egg], (message) => {
      error = message;
    }, masters);
    expect(error).toBe("");
    expect(items![0]).toMatchObject({
      uom: "Tray",
      quantity: 1,
      unitPrice: 530,
      baseQtySold: 30,
    });
  });

  it("does not expose an unpriced Carton as a Rate Master sale unit", () => {
    const masters = [rate({ id: "RM-1", effectiveFrom: "2026-01-01" })];
    expect(matchRateMasterSaleUnit(masters[0], "Carton")).toBeUndefined();
    expect(rateMasterSaleUnits(masters[0]!.units).some((unit) => unit.name === "Carton")).toBe(
      false,
    );
    // Priced units still resolve to RM selling prices.
    expect(matchRateMasterSaleUnit(masters[0], "Tray")?.sellingPrice).toBe(530);
    expect(matchRateMasterSaleUnit(masters[0], "Piece")?.sellingPrice).toBe(20);
  });

  it("new rate period closes prior open period and sales use the new prices", () => {
    const existing = rate({ id: "RM-001", effectiveFrom: "2025-02-20", effectiveTo: null });
    const next = insertRatePeriod(
      [existing],
      rate({
        id: "RM-002",
        effectiveFrom: "2025-11-15",
        units: units.map((unit) =>
          unit.level === 2 ? { ...unit, sellingPrice: 400 } : unit,
        ),
      }),
    );
    const active = findRateMasterForProduct(
      next,
      { name: "Egg", sku: "EGG-01", category: "Poultry" },
      "2025-12-01",
    );
    expect(active?.id).toBe("RM-002");
    expect(matchRateMasterSaleUnit(active, "Tray")?.sellingPrice).toBe(400);

    const egg = product();
    expect(
      lineUnitPrice(draft({ uom: "Tray", conversionFactor: 30 }), [egg], next),
    ).toBe(400);
  });
});
