import { describe, expect, it } from "vitest";
import type { Product, Sale } from "../types";
import { countEstimatedCogsSaleLines } from "./accounting";

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "S-1",
    saleDate: "2025-06-15",
    customerName: "Customer",
    items: [
      {
        productId: "P-1",
        productName: "Widget",
        quantity: 1,
        unitPrice: 100,
        total: 100,
      },
    ],
    productId: "P-1",
    productName: "Widget",
    quantity: 1,
    unitPrice: 100,
    total: 100,
    status: "completed",
    paymentMode: "Cash",
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "P-1",
    name: "Widget",
    category: "General",
    sku: "W-1",
    price: 100,
    stock: 10,
    status: "in-stock",
    ...overrides,
  };
}

describe("countEstimatedCogsSaleLines", () => {
  it("counts lines where product cost price is missing", () => {
    const count = countEstimatedCogsSaleLines(
      [sale()],
      [product({ costPrice: undefined })],
      "2025-06-01",
      "2025-06-30",
    );
    expect(count).toBe(1);
  });

  it("ignores lines with explicit cost price", () => {
    const count = countEstimatedCogsSaleLines(
      [sale()],
      [product({ costPrice: 40 })],
      "2025-06-01",
      "2025-06-30",
    );
    expect(count).toBe(0);
  });

  it("counts lines for unknown products", () => {
    const count = countEstimatedCogsSaleLines(
      [sale()],
      [],
      "2025-06-01",
      "2025-06-30",
    );
    expect(count).toBe(1);
  });

  it("excludes cancelled sales and out-of-range dates", () => {
    const count = countEstimatedCogsSaleLines(
      [
        sale({ status: "cancelled" }),
        sale({ saleDate: "2025-05-01", id: "S-2" }),
      ],
      [product()],
      "2025-06-01",
      "2025-06-30",
    );
    expect(count).toBe(0);
  });
});
