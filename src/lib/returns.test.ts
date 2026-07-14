import { describe, expect, it } from "vitest";
import {
  applyCustomerSettlement,
  applyPurchaseReturnStock,
  applySalesReturnStock,
  applySupplierPurchaseReturn,
  buildSalesReturnDraftLines,
  createSalesReturnRecord,
  openSupplierLiableReturns,
  purchaseReturnItemsFromSalesReturn,
  returnedQtyBySaleLine,
  salesReturnItemsFromDraft,
} from "./returns";
import type { Contact, Product, Sale, SalesReturn } from "../types";

function product(partial: Partial<Product> & Pick<Product, "id" | "stock">): Product {
  return {
    name: "Item",
    category: "Electronics",
    brand: "",
    sku: "SKU",
    price: 150,
    costPrice: 100,
    status: "in-stock",
    lowStockThreshold: 2,
    ...partial,
  };
}

function sale(items: Sale["items"]): Sale {
  const first = items[0];
  return {
    id: "SAL-001",
    saleDate: "2026-07-01",
    customerName: "Walk-in",
    customerId: "CUS-001",
    items,
    productId: first?.productId ?? "PRD-1",
    productName: first?.productName ?? "Item",
    quantity: first?.quantity ?? 1,
    unitPrice: first?.unitPrice ?? 0,
    total: items.reduce((sum, item) => sum + item.total, 0),
    paymentMode: "Cash",
    status: "completed",
    createdBy: "Admin",
  };
}

describe("sales return draft / caps", () => {
  it("builds returnable lines and respects prior returns", () => {
    const original = sale([
      {
        productId: "PRD-1",
        productName: "Phone",
        quantity: 2,
        unitPrice: 500,
        total: 1000,
      },
    ]);
    const prior: SalesReturn[] = [
      createSalesReturnRecord({
        id: "SRN-001",
        sale: original,
        items: [
          {
            productId: "PRD-1",
            productName: "Phone",
            quantity: 1,
            unitPrice: 500,
            total: 500,
            baseQtyReturned: 1,
          },
        ],
        reason: "complaint",
        settlement: "refund",
        supplierLiable: false,
        returnDate: "2026-07-02",
        createdBy: "Admin",
      }),
    ];
    const draft = buildSalesReturnDraftLines(original, prior);
    expect(draft).toHaveLength(1);
    expect(draft[0].maxQuantity).toBe(1);
    expect(returnedQtyBySaleLine(prior, original.id).get("PRD-1")).toBe(1);
  });

  it("rejects over-max quantities from draft", () => {
    const items = salesReturnItemsFromDraft([
      {
        productId: "PRD-1",
        productName: "Phone",
        quantity: 3,
        maxQuantity: 2,
        unitPrice: 100,
        selected: true,
      },
    ]);
    expect(items).toBeNull();
  });
});

describe("return stock movements", () => {
  it("increases stock on sales return", () => {
    const products = [product({ id: "PRD-1", stock: 5 })];
    const next = applySalesReturnStock(products, [
      {
        productId: "PRD-1",
        productName: "Phone",
        quantity: 2,
        unitPrice: 100,
        total: 200,
        baseQtyReturned: 2,
      },
    ]);
    expect(next[0].stock).toBe(7);
  });

  it("decreases stock on purchase return and fails when insufficient", () => {
    const products = [product({ id: "PRD-1", stock: 2 })];
    const items = [
      {
        productId: "PRD-1",
        productName: "Phone",
        quantity: 2,
        costPrice: 80,
        total: 160,
        baseQtyReturned: 2,
      },
    ];
    expect(applyPurchaseReturnStock(products, items)?.[0].stock).toBe(0);
    expect(applyPurchaseReturnStock(products, [{ ...items[0], baseQtyReturned: 3 }])).toBeNull();
  });
});

describe("settlements and supplier apply", () => {
  it("applies credit settlement against AR then store credit", () => {
    const customers: Contact[] = [
      {
        id: "CUS-001",
        name: "A",
        countryCode: "",
        phone: "",
        email: "",
        address: "",
        creditBalance: 40,
      },
    ];
    const next = applyCustomerSettlement(customers, "CUS-001", "credit", 100);
    expect(next[0].creditBalance).toBe(0);
    expect(next[0].storeCredit).toBe(60);
  });

  it("does not change customer balances for refund/replacement", () => {
    const customers: Contact[] = [
      {
        id: "CUS-001",
        name: "A",
        countryCode: "",
        phone: "",
        email: "",
        address: "",
        creditBalance: 40,
      },
    ];
    expect(applyCustomerSettlement(customers, "CUS-001", "refund", 100)).toBe(customers);
  });

  it("reduces supplier creditBalance on purchase return", () => {
    const suppliers: Contact[] = [
      {
        id: "SUP-001",
        name: "Vendor",
        countryCode: "",
        phone: "",
        email: "",
        address: "",
        creditBalance: 500,
      },
    ];
    const next = applySupplierPurchaseReturn(suppliers, "SUP-001", "Vendor", 120);
    expect(next[0].creditBalance).toBe(380);
  });
});

describe("purchase return from sales return", () => {
  it("uses product cost for debit lines and queues open supplier-liable returns", () => {
    const products = [product({ id: "PRD-1", stock: 4, costPrice: 80 })];
    const salesReturn = createSalesReturnRecord({
      id: "SRN-010",
      sale: sale([
        {
          productId: "PRD-1",
          productName: "Phone",
          quantity: 1,
          unitPrice: 150,
          total: 150,
        },
      ]),
      items: [
        {
          productId: "PRD-1",
          productName: "Phone",
          quantity: 1,
          unitPrice: 150,
          total: 150,
          baseQtyReturned: 1,
        },
      ],
      reason: "warranty",
      settlement: "refund",
      supplierLiable: true,
      returnDate: "2026-07-10",
      createdBy: "Admin",
    });
    const lines = purchaseReturnItemsFromSalesReturn(salesReturn, products);
    expect(lines[0].costPrice).toBe(80);
    expect(lines[0].total).toBe(80);
    expect(openSupplierLiableReturns([salesReturn])).toHaveLength(1);
    expect(
      openSupplierLiableReturns([{ ...salesReturn, purchaseReturnId: "PRN-001" }]),
    ).toHaveLength(0);
  });
});
