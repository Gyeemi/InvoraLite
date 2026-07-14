import { describe, expect, it } from "vitest";
import {
  applyPurchaseCostsToRateMasters,
  baseUnitsPerPurchaseUnit,
  defaultRateMasterSaleUnit,
  emptyRateMasterUnits,
  findRateMasterForProduct,
  formatRateMasterHierarchy,
  insertRatePeriod,
  isRateLocked,
  matchRateMasterSaleUnit,
  needsBackdateWarning,
  rateMasterLevelRole,
  rateMasterSaleUnits,
  rateStatus,
  resolveRateMasterSaleUnitForQuantity,
  RATE_MASTER_LEVEL_ROLES,
  RATE_MASTER_MAX_LEVELS,
  RATE_MASTER_MIN_LEVELS,
  validateRateMasterDraft,
  validateRateMasterUnits,
} from "./rateMaster";
import type { RateMaster } from "../types";

function withPrices(
  units: ReturnType<typeof emptyRateMasterUnits>,
  prices: number[] = [100, 10, 1, 0.5],
) {
  return units.map((unit, index) => ({
    ...unit,
    sellingPrice: prices[index] ?? 1,
  }));
}

describe("rateMaster hierarchy", () => {
  it("requires 2–4 levels", () => {
    const two = withPrices(
      emptyRateMasterUnits(2).map((unit, index) => ({
        ...unit,
        name: ["Carton", "Piece"][index],
        qtyPerChild: index < 1 ? 30 : 1,
      })),
    );
    expect(validateRateMasterUnits(two)).toBeNull();

    const three = withPrices(
      emptyRateMasterUnits(3).map((unit, index) => ({
        ...unit,
        name: ["Carton", "Tray", "Piece"][index],
        qtyPerChild: index < 2 ? 12 : 1,
      })),
    );
    expect(validateRateMasterUnits(three)).toBeNull();

    expect(
      validateRateMasterUnits([
        { level: 1, name: "Carton", qtyPerChild: 10, sellingPrice: 100 },
      ]),
    ).toMatch(/2–4 levels/);
  });

  it("computes base units in one purchase unit", () => {
    const units = [
      { level: 1 as const, name: "Carton", qtyPerChild: 10, sellingPrice: 120 },
      { level: 2 as const, name: "Tray", qtyPerChild: 12, sellingPrice: 12 },
      { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 1 },
    ];
    expect(baseUnitsPerPurchaseUnit(units)).toBe(120);
    expect(formatRateMasterHierarchy(units)).toBe("1 Carton = 10 Tray = 120 Piece");
  });

  it("exposes sale units with conversion and price", () => {
    const units = [
      { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 3500 },
      { level: 2 as const, name: "Tray", qtyPerChild: 30, sellingPrice: 530 },
      { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
    ];
    expect(rateMasterSaleUnits(units)).toEqual([
      { name: "Carton", level: 1, conversionFactor: 210, sellingPrice: 3500 },
      { name: "Half Carton", level: 1, conversionFactor: 105, sellingPrice: 1750 },
      { name: "Tray", level: 2, conversionFactor: 30, sellingPrice: 530 },
      { name: "Half Tray", level: 2, conversionFactor: 15, sellingPrice: 265 },
      { name: "Piece", level: 3, conversionFactor: 1, sellingPrice: 20 },
    ]);
  });

  it("auto-converts quantity to the largest matching sale unit", () => {
    const units = rateMasterSaleUnits([
      { level: 1, name: "Carton", qtyPerChild: 7, sellingPrice: 3500 },
      { level: 2, name: "Tray", qtyPerChild: 30, sellingPrice: 530 },
      { level: 3, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
    ]);
    expect(resolveRateMasterSaleUnitForQuantity(units, "Piece", 30)).toEqual({
      unit: expect.objectContaining({ name: "Tray", conversionFactor: 30 }),
      quantity: 1,
    });
    expect(resolveRateMasterSaleUnitForQuantity(units, "Piece", 210)?.unit.name).toBe("Carton");
    expect(resolveRateMasterSaleUnitForQuantity(units, "Tray", 7)?.unit.name).toBe("Carton");
    expect(resolveRateMasterSaleUnitForQuantity(units, "Piece", 15)?.unit.name).toBe("Half Tray");
    expect(resolveRateMasterSaleUnitForQuantity(units, "Piece", 29)).toBeNull();
    expect(resolveRateMasterSaleUnitForQuantity(units, "Tray", 2)).toBeNull();
  });

  it("does not duplicate an explicit Half Tray level", () => {
    const units = [
      { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 3500 },
      { level: 2 as const, name: "Tray", qtyPerChild: 2, sellingPrice: 530 },
      { level: 3 as const, name: "Half Tray", qtyPerChild: 15, sellingPrice: 280 },
      { level: 4 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
    ];
    const names = rateMasterSaleUnits(units).map((unit) => unit.name);
    expect(names.filter((name) => /half tray/i.test(name))).toHaveLength(1);
    expect(
      rateMasterSaleUnits(units).find((unit) => /half tray/i.test(unit.name))?.sellingPrice,
    ).toBe(280);
  });

  it("matches products to rate masters for sales", () => {
    const entry: RateMaster = {
      id: "RM-1",
      productName: "Egg",
      category: "Poultry",
      brand: "",
      sku: "EGG-01",
      units: [
        { level: 1, name: "Carton", qtyPerChild: 7, sellingPrice: 3500 },
        { level: 2, name: "Tray", qtyPerChild: 30, sellingPrice: 530 },
        { level: 3, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
      ],
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      findRateMasterForProduct([entry], {
        name: "Egg",
        category: "Poultry",
        sku: "EGG-01",
      })?.id,
    ).toBe("RM-1");
    expect(matchRateMasterSaleUnit(entry, "tray")?.sellingPrice).toBe(530);
    expect(defaultRateMasterSaleUnit(entry).name).toBe("Piece");
  });

  it("supports optional fourth level", () => {
    const units = withPrices(
      emptyRateMasterUnits(4).map((unit, index) => ({
        ...unit,
        name: ["Carton", "Tray", "Piece", "Half"][index],
        qtyPerChild: index === 0 ? 10 : index === 1 ? 12 : index === 2 ? 2 : 1,
      })),
    );
    expect(units).toHaveLength(RATE_MASTER_MAX_LEVELS);
    expect(baseUnitsPerPurchaseUnit(units)).toBe(240);
    expect(
      validateRateMasterDraft({
        productName: "Juice",
        category: "Food & Beverage",
        brand: "Fresh",
        sku: "JUI-01",
        units,
      }),
    ).toBeNull();
  });

  it("allows blank selling prices when at least one unit is priced", () => {
    expect(
      validateRateMasterUnits(
        emptyRateMasterUnits(3).map((unit, index) => ({
          ...unit,
          name: ["Carton", "Tray", "Piece"][index],
          qtyPerChild: index < 2 ? 12 : 1,
          sellingPrice: index === 1 ? 12 : 0,
        })),
      ),
    ).toBeNull();
  });

  it("rejects when no unit has a selling price", () => {
    expect(
      validateRateMasterUnits(
        emptyRateMasterUnits(3).map((unit, index) => ({
          ...unit,
          name: ["Carton", "Tray", "Piece"][index],
          qtyPerChild: index < 2 ? 12 : 1,
          sellingPrice: 0,
        })),
      ),
    ).toMatch(/at least one unit/);
  });

  it("omits unpriced units from sale UOM options", () => {
    const units = [
      { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 0 },
      { level: 2 as const, name: "Tray", qtyPerChild: 30, sellingPrice: 530 },
      { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
    ];
    expect(rateMasterSaleUnits(units).map((unit) => unit.name)).toEqual([
      "Tray",
      "Half Tray",
      "Piece",
    ]);
  });

  it("rejects duplicate unit names", () => {
    expect(
      validateRateMasterUnits([
        { level: 1, name: "Box", qtyPerChild: 6, sellingPrice: 60 },
        { level: 2, name: "Pack", qtyPerChild: 2, sellingPrice: 10 },
        { level: 3, name: "Box", qtyPerChild: 1, sellingPrice: 5 },
      ]),
    ).toMatch(/different unit name/);
  });

  it("exposes level role copy", () => {
    expect(RATE_MASTER_LEVEL_ROLES[1].example).toBe("Carton");
    expect(RATE_MASTER_MIN_LEVELS).toBe(2);
    expect(rateMasterLevelRole(2, 2).title).toMatch(/Smallest/);
    expect(rateMasterLevelRole(2, 3).title).toMatch(/Intermediate/);
  });
});

describe("rateMaster effective dates", () => {
  const units = [
    { level: 1 as const, name: "Carton", qtyPerChild: 7, sellingPrice: 3500 },
    { level: 2 as const, name: "Tray", qtyPerChild: 30, sellingPrice: 530 },
    { level: 3 as const, name: "Piece", qtyPerChild: 1, sellingPrice: 20 },
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

  it("classifies active, expired, and scheduled statuses", () => {
    expect(rateStatus(rate({ id: "A", effectiveFrom: "2025-01-01", effectiveTo: "2025-06-01" }), "2025-03-01")).toBe(
      "active",
    );
    expect(rateStatus(rate({ id: "B", effectiveFrom: "2025-01-01", effectiveTo: "2025-06-01" }), "2025-07-01")).toBe(
      "expired",
    );
    expect(rateStatus(rate({ id: "C", effectiveFrom: "2025-12-01", effectiveTo: null }), "2025-07-01")).toBe(
      "scheduled",
    );
  });

  it("locks only past periods", () => {
    expect(isRateLocked(rate({ id: "A", effectiveFrom: "2025-01-01", effectiveTo: "2025-06-01" }), "2025-07-01")).toBe(
      true,
    );
    expect(isRateLocked(rate({ id: "B", effectiveFrom: "2025-01-01", effectiveTo: null }), "2025-07-01")).toBe(false);
  });

  it("auto-closes previous open rate when inserting a new period", () => {
    const existing = rate({ id: "RM-001", effectiveFrom: "2025-02-20", effectiveTo: null });
    const next = insertRatePeriod(
      [existing],
      rate({
        id: "RM-002",
        effectiveFrom: "2025-11-15",
        units: units.map((unit) =>
          unit.level === 2 ? { ...unit, sellingPrice: 400 } : unit.level === 3 ? { ...unit, sellingPrice: 16 } : unit,
        ),
      }),
    );
    const first = next.find((entry) => entry.id === "RM-001");
    const second = next.find((entry) => entry.id === "RM-002");
    expect(first?.effectiveTo).toBe("2025-11-14");
    expect(second?.effectiveTo).toBeNull();
    expect(rateStatus(second!, "2025-11-15")).toBe("active");
    expect(rateStatus(first!, "2025-11-15")).toBe("expired");
  });

  it("resolves the active rate for a product on a date", () => {
    const list = [
      rate({ id: "RM-001", effectiveFrom: "2025-02-20", effectiveTo: "2025-11-14" }),
      rate({
        id: "RM-002",
        effectiveFrom: "2025-11-15",
        effectiveTo: null,
        units: units.map((unit) => (unit.level === 2 ? { ...unit, sellingPrice: 400 } : unit)),
      }),
    ];
    expect(findRateMasterForProduct(list, { name: "Egg", sku: "EGG-01", category: "Poultry" }, "2025-10-01")?.id).toBe(
      "RM-001",
    );
    expect(findRateMasterForProduct(list, { name: "Egg", sku: "EGG-01", category: "Poultry" }, "2025-12-01")?.id).toBe(
      "RM-002",
    );
  });

  it("writes purchase cost onto active rate Unit 1", () => {
    const list = [
      rate({ id: "RM-001", effectiveFrom: "2025-02-20", effectiveTo: null }),
    ];
    const next = applyPurchaseCostsToRateMasters(
      list,
      [{ name: "Egg", sku: "EGG-01", category: "Poultry", costPrice: 3100 }],
      "2025-11-15",
    );
    expect(next[0]?.units[0]?.costPrice).toBe(3100);
  });

  it("warns on backdated effective from", () => {
    expect(needsBackdateWarning("2025-01-01", "2025-07-10")).toBe(true);
    expect(needsBackdateWarning("2025-07-10", "2025-07-10")).toBe(false);
  });
});
