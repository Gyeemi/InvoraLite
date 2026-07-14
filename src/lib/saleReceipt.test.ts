import { describe, expect, it } from "vitest";
import type { Business, Sale } from "../types";
import { buildSaleThermalReceiptHtml, formatSaleReceiptQtyLine } from "./saleReceipt";

const business: Business = {
  businessName: "Invora Shop",
  licenseNo: "LIC-1",
  tpnNo: "TPN-123",
  address: "Thimphu",
  phoneCountryCode: "+975",
  phone: "17123456",
  hasGst: true,
  gstRegistrationNo: "GST-98765",
  email: "shop@example.com",
  password: "hash",
  username: "owner",
};

const sale: Sale = {
  id: "SAL-001",
  saleDate: "2026-07-06",
  customerName: "Walk-in",
  items: [
    {
      productId: "P1",
      productName: "Phone",
      quantity: 1,
      unitPrice: 22000,
      total: 22000,
    },
  ],
  productId: "P1",
  productName: "Phone",
  quantity: 1,
  unitPrice: 22000,
  subtotal: 22000,
  gstAmount: 1100,
  total: 23100,
  status: "completed",
  paymentMode: "Cash",
  amountPaid: 23100,
};

describe("formatSaleReceiptQtyLine", () => {
  it("includes the unit name when present", () => {
    expect(
      formatSaleReceiptQtyLine({
        quantity: 1,
        unitPrice: 530,
        uom: "tray",
      }),
    ).toMatch(/^1 Tray x /);
  });

  it("shows ½ for half tray / half carton", () => {
    expect(
      formatSaleReceiptQtyLine({
        quantity: 1,
        unitPrice: 265,
        uom: "Half Tray",
      }),
    ).toBe("½ Tray x Nu. 265.00");
  });

  it("omits unit when missing", () => {
    expect(
      formatSaleReceiptQtyLine({
        quantity: 2,
        unitPrice: 20,
      }),
    ).toMatch(/^2 x /);
  });
});

describe("buildSaleThermalReceiptHtml", () => {
  it("includes GST registration number when business has GST", () => {
    const html = buildSaleThermalReceiptHtml(business, sale);
    expect(html).toContain("GST Registration No: GST-98765");
    expect(html).toContain("GST (5%)");
    expect(html).toContain('class="cut-space"');
    expect(html).toContain("size: 80mm auto");
  });

  it("mentions unit on item lines", () => {
    const html = buildSaleThermalReceiptHtml(business, {
      ...sale,
      items: [
        {
          productId: "P2",
          productName: "Egg",
          quantity: 1,
          unitPrice: 530,
          total: 530,
          uom: "tray",
        },
      ],
    });
    expect(html).toContain("1 Tray x ");
  });

  it("omits GST registration when GST is disabled", () => {
    const html = buildSaleThermalReceiptHtml(
      { ...business, hasGst: false, gstRegistrationNo: "" },
      sale,
    );
    expect(html).not.toContain("GST Registration No:");
  });
});
