import { describe, expect, it } from "vitest";
import type { Product } from "../types";
import { productsToCsv } from "./csv";

const product: Product = {
  id: "PRD-001",
  name: "Phone",
  category: "Electronics",
  sku: "PHN-01",
  price: 22000,
  stock: 5,
  status: "in-stock",
};

describe("productsToCsv", () => {
  it("includes GST columns when requested", () => {
    const csv = productsToCsv([product], true);
    expect(csv.split("\r\n")[0]).toContain("gstPercent");
    expect(csv.split("\r\n")[0]).toContain("gstAmount");
    expect(csv.split("\r\n")[0]).toContain("priceInclGst");
    expect(csv).toContain("1100");
    expect(csv).toContain("23100");
  });

  it("keeps the default export shape without GST", () => {
    const csv = productsToCsv([product], false);
    expect(csv.split("\r\n")[0]).not.toContain("gstAmount");
  });
});
