import { describe, expect, it } from "vitest";
import {
  normalizeQuotation,
  quotationTotals,
  validateQuotationDraft,
} from "./quotation";

describe("quotation", () => {
  it("validates company name and items", () => {
    expect(
      validateQuotationDraft({
        quotationTo: "",
        quotationDate: "2026-07-12",
        items: [],
      }),
    ).toMatch(/company name/i);

    expect(
      validateQuotationDraft({
        quotationTo: "Tashi Beverage",
        quotationDate: "2026-07-12",
        items: [
          {
            productId: "PRD-001",
            productName: "Egg",
            category: "Poultry",
            sku: "EGG-01",
            quantity: 2,
            uom: "Tray",
            conversionFactor: 30,
            unitPrice: 530,
            gstPercent: 5,
          },
        ],
      }),
    ).toBeNull();
  });

  it("totals excl and incl GST", () => {
    const items = [
      {
        productId: "PRD-003",
        productName: "Samsung A55",
        category: "Phone",
        sku: "SAM A55",
        quantity: 1,
        uom: "unit",
        conversionFactor: 1,
        unitPrice: 21500,
        gstPercent: 5,
      },
    ];
    const withGst = quotationTotals(items, true);
    expect(withGst.subtotalExcl).toBe(21500);
    expect(withGst.gstAmount).toBe(1075);
    expect(withGst.grandTotal).toBe(22575);

    const noGst = quotationTotals(items, false);
    expect(noGst.grandTotal).toBe(21500);
  });

  it("normalizes draft quotations", () => {
    const q = normalizeQuotation({
      id: "QT-001",
      quotationTo: "  Acme Co  ",
      quotationDate: "2026-07-12",
      items: [],
    });
    expect(q.quotationTo).toBe("Acme Co");
    expect(q.status).toBe("draft");
    expect(q.validUntil).toBeNull();
  });
});
