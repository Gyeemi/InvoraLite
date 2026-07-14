import { describe, expect, it } from "vitest";
import type { Contact, CustomerPayment, Product, Purchase, PurchaseItem, Sale, SupplierPayment } from "../types";
import {
  customerCreditDue,
  customerPaymentSaleAllocations,
  customerPaymentsWithBalance,
  mergePurchaseIntoProducts,
  reconcileProductPricesFromPurchases,
  saleCreditPaymentContext,
  supplierAdvanceRemaining,
  supplierBalanceDue,
  supplierLedgerWithBalance,
  supplierPaymentsWithBalance,
} from "./data";

function supplier(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "SUP-001",
    name: "Himalayan Supplies Co.",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
    creditBalance: 0,
    ...overrides,
  };
}

function purchase(total: number, date = "2026-06-23", id = "PUR-001"): Purchase {
  return {
    id,
    invoiceNo: id,
    supplierName: "Himalayan Supplies Co.",
    purchaseDate: date,
    shippingCharge: 0,
    items: [],
    total,
    status: "received",
    createdBy: "Admin",
    stockedToInventory: true,
  };
}

function supplierPayment(
  amount: number,
  date = "2026-06-23",
  id = "PAY-001",
): SupplierPayment {
  return {
    id,
    supplierId: "SUP-001",
    supplierName: "Himalayan Supplies Co.",
    paymentDate: date,
    paymentMode: "Cash",
    amount,
    balanceAfter: 0,
  };
}

function customer(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "CUS-002",
    name: "Anisha Gurung",
    countryCode: "975",
    phone: "17367650",
    email: "",
    address: "",
    creditBalance: 0,
    ...overrides,
  };
}

function customerPayment(
  amount: number,
  date = "2026-06-28",
  id = "RCP-001",
): CustomerPayment {
  return {
    id,
    customerId: "CUS-002",
    customerName: "Anisha Gurung",
    paymentDate: date,
    paymentMode: "Cash",
    amount,
    balanceAfter: 0,
  };
}

function creditSale(
  credit: number,
  paid = 0,
  id = "SAL-007",
  date = "2026-06-27",
): Sale {
  return {
    id,
    saleDate: date,
    customerName: "Anisha Gurung",
    customerId: "CUS-002",
    items: [{ productId: "P1", productName: "Phone", quantity: 1, unitPrice: credit + paid, total: credit + paid }],
    productId: "P1",
    productName: "Phone",
    quantity: 1,
    unitPrice: credit + paid,
    total: credit + paid,
    status: "completed",
    paymentMode: paid > 0 ? "Credit + Cash" : "Credit",
    amountPaid: paid,
    amountCredit: credit,
    partialPaymentMode: paid > 0 ? "Cash" : undefined,
  };
}

function purchaseItem(overrides: Partial<PurchaseItem> = {}): PurchaseItem {
  return {
    name: "Juice Box",
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
    ...overrides,
  };
}

describe("mergePurchaseIntoProducts", () => {
  it("stores retail selling price per unit on the product", () => {
    const [product] = mergePurchaseIntoProducts([], {
      ...purchase(80, "2026-06-23", "PUR-100"),
      items: [purchaseItem()],
    });

    expect(product.price).toBe(10);
    expect(product.wholesalePrice).toBe(120);
    expect(product.wholesaleConversionFactor).toBe(12);
  });

  it("keeps explicit retail when legacy per-carton selling price is also present", () => {
    const [product] = mergePurchaseIntoProducts([], {
      ...purchase(80, "2026-06-23", "PUR-101"),
      items: [
        {
          ...purchaseItem(),
          sellingPrice: 119.88,
        } as PurchaseItem & { sellingPrice: number },
      ],
    });

    expect(product.price).toBe(10);
  });

  it("does not apply wholesale discount to product price when UOM is off", () => {
    const [product] = mergePurchaseIntoProducts([], {
      ...purchase(80, "2026-06-23", "PUR-102"),
      items: [
        purchaseItem({
          retailSellingPrice: 10,
          wholesaleSellingPrice: 0,
          uom: "unit",
          conversionFactor: 1,
        }),
      ],
    });

    expect(product.price).toBe(10);
    expect(product.wholesalePrice).toBeUndefined();
  });
});

describe("reconcileProductPricesFromPurchases", () => {
  function product(overrides: Partial<Product> = {}): Product {
    return {
      id: "PRD-001",
      name: "Juice Box",
      category: "Food & Beverage",
      sku: "JUI-01",
      price: 9.99,
      stock: 12,
      status: "in-stock",
      ...overrides,
    };
  }

  it("updates product price from the latest received purchase retail price", () => {
    const result = reconcileProductPricesFromPurchases([product()], [
      {
        ...purchase(80, "2026-06-20", "PUR-OLD"),
        status: "received",
        items: [
          {
            ...purchaseItem({ retailSellingPrice: 9.99 }),
            sellingPrice: 119.88,
          } as PurchaseItem & { sellingPrice: number },
        ],
      },
      {
        ...purchase(80, "2026-06-23", "PUR-NEW"),
        status: "received",
        items: [purchaseItem({ retailSellingPrice: 10 })],
      },
    ]);

    expect(result.changed).toBe(true);
    expect(result.products[0].price).toBe(10);
  });

  it("ignores older purchases when a newer purchase has retail price 10", () => {
    const result = reconcileProductPricesFromPurchases([product()], [
      {
        ...purchase(80, "2026-06-23", "PUR-NEW"),
        status: "received",
        items: [purchaseItem({ retailSellingPrice: 10 })],
      },
      {
        ...purchase(80, "2026-06-20", "PUR-OLD"),
        status: "received",
        items: [purchaseItem({ retailSellingPrice: 9.99 })],
      },
    ]);

    expect(result.products[0].price).toBe(10);
  });
});

describe("supplierPaymentsWithBalance", () => {
  it("applies payment to balance due without advance when amount matches", () => {
    const s = supplier({ creditBalance: 120.38 });
    const rows = supplierPaymentsWithBalance(s, [purchase(120.38)], [
      supplierPayment(120.38, "2026-06-27", "PAY-001"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].balanceAfter).toBe(0);
    expect(rows[0].advancePaid).toBe(0);
    expect(rows[0].advanceAfter).toBe(0);
  });

  it("credits overpayment to advance paid", () => {
    const s = supplier({ creditBalance: 100 });
    const rows = supplierPaymentsWithBalance(s, [purchase(100)], [
      supplierPayment(5000, "2026-06-27", "PAY-001"),
    ]);
    expect(rows[0].balanceAfter).toBe(0);
    expect(rows[0].advancePaid).toBe(4900);
    expect(rows[0].advanceAfter).toBe(4900);
    expect(supplierAdvanceRemaining(s, [supplierPayment(5000)])).toBe(4900);
  });

  it("applies same-day purchases before payments", () => {
    const s = supplier({ creditBalance: 120 });
    const rows = supplierPaymentsWithBalance(
      s,
      [purchase(120, "2026-06-27", "PUR-002")],
      [supplierPayment(120, "2026-06-27", "PAY-002")],
    );
    expect(rows[0].advancePaid).toBe(0);
    expect(rows[0].balanceAfter).toBe(0);
    expect(rows[0].advanceAfter).toBe(0);
  });

  it("matches current advance available with last row when no later purchases", () => {
    const s = supplier({ creditBalance: 100 });
    const payments = [supplierPayment(150, "2026-06-27", "PAY-003")];
    const rows = supplierPaymentsWithBalance(s, [purchase(100)], payments);
    expect(rows[rows.length - 1]?.advanceAfter).toBe(supplierAdvanceRemaining(s, payments));
  });

  it("shows purchase rows with advance adjusted against the bill", () => {
    const s = supplier({
      openingBalance: 5000,
      openingBalanceType: "credit",
      creditBalance: 5000,
    });
    const payments = [supplierPayment(6000, "2026-07-13", "PAY-ADV")];
    const purchases = [purchase(800, "2026-07-14", "PUR-ADV")];
    const ledger = supplierLedgerWithBalance(s, purchases, payments);

    expect(ledger).toHaveLength(2);
    expect(ledger[0].kind).toBe("payment");
    expect(ledger[0].advancePaid).toBe(1000);
    expect(ledger[0].advanceAfter).toBe(1000);

    expect(ledger[1].kind).toBe("purchase");
    expect(ledger[1].amount).toBe(800);
    expect(ledger[1].advanceApplied).toBe(800);
    expect(ledger[1].balanceAfter).toBe(0);
    expect(ledger[1].advanceAfter).toBe(200);
    expect(ledger[1].notes).toMatch(/Advance adjusted/);
    expect(ledger[1].paymentReference).toBe("PUR-ADV");
  });

  it("applies partial advance then leaves payable balance", () => {
    const s = supplier({
      openingBalance: 0,
      creditBalance: 0,
    });
    const payments = [supplierPayment(1000, "2026-07-10", "PAY-1")];
    const purchases = [purchase(1500, "2026-07-11", "PUR-1")];
    const ledger = supplierLedgerWithBalance(s, purchases, payments);
    const purchaseRow = ledger.find((row) => row.kind === "purchase");
    expect(purchaseRow?.advanceApplied).toBe(1000);
    expect(purchaseRow?.balanceAfter).toBe(500);
    expect(purchaseRow?.advanceAfter).toBe(0);
  });

  it("includes purchase returns as debit notes reducing payable", () => {
    const s = supplier({ creditBalance: 1000 });
    const purchases = [purchase(1000, "2026-07-01", "PUR-R")];
    const returns = [
      {
        id: "PRN-001",
        supplierId: s.id,
        supplierName: s.name,
        returnDate: "2026-07-05",
        debitNoteNo: "DN-1",
        items: [],
        total: 250,
        status: "completed" as const,
        createdBy: "Admin",
        createdAt: "2026-07-05T00:00:00.000Z",
      },
    ];
    const ledger = supplierLedgerWithBalance(s, purchases, [], returns);
    expect(ledger.map((row) => row.kind)).toEqual(["purchase", "purchase_return"]);
    expect(ledger[1].amount).toBe(250);
    expect(ledger[1].balanceAfter).toBe(750);
    expect(ledger[1].paymentReference).toBe("DN-1");
  });
});

describe("supplierBalanceDue", () => {
  it("returns payable minus payments", () => {
    const s = supplier({ creditBalance: 500 });
    expect(supplierBalanceDue(s, [supplierPayment(200)])).toBe(300);
  });
});

describe("customerPaymentsWithBalance", () => {
  it("tracks running credit balance after each payment", () => {
    const payments = [customerPayment(400, "2026-06-28", "RCP-001")];
    const c = customer({ creditBalance: 600 });
    const rows = customerPaymentsWithBalance(c, payments);
    expect(rows[0].balanceAfter).toBe(600);
    expect(customerCreditDue(c)).toBe(600);
  });
});

describe("saleCreditPaymentContext", () => {
  it("allocates customer payments to credit sales FIFO", () => {
    const sale = creditSale(8999.98, 20000);
    const payments = [customerPayment(3999.99, "2026-06-28", "RCP-010")];
    const context = saleCreditPaymentContext(sale, [sale], payments);
    expect(context?.amountCreditAtSale).toBe(8999.98);
    expect(context?.settlements).toHaveLength(1);
    expect(context?.settlements[0].amountApplied).toBe(3999.99);
    expect(context?.outstanding).toBeCloseTo(4999.99, 2);
  });

  it("returns null for non-credit sales", () => {
    const sale: Sale = {
      ...creditSale(0, 5000),
      paymentMode: "Cash",
      amountCredit: undefined,
      amountPaid: 5000,
    };
    expect(saleCreditPaymentContext(sale, [sale], [])).toBeNull();
  });
});

describe("customerPaymentSaleAllocations", () => {
  it("allocates payment to credit sale invoice FIFO", () => {
    const sale = creditSale(5000, 0, "SAL-010");
    const payment = customerPayment(2000, "2026-06-28", "RCP-010");
    const allocations = customerPaymentSaleAllocations(payment, [sale], [payment]);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].saleId).toBe("SAL-010");
    expect(allocations[0].amountApplied).toBe(2000);
    expect(allocations[0].outstandingAfter).toBe(3000);
  });
});
