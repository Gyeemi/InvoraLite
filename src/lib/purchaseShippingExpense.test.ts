import { describe, expect, it } from "vitest";
import type { OfficeExpense, Purchase } from "../types";
import {
  reconcilePurchaseShippingExpenses,
  shippingExpenseNotes,
  syncPurchaseShippingExpense,
} from "./purchaseShippingExpense";

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: "PUR-001",
    invoiceNo: "TPN875068",
    supplierName: "Chencho Dorji",
    purchaseDate: "2026-07-02",
    shippingCharge: 150,
    items: [],
    total: 1000,
    status: "pending",
    createdBy: "Admin",
    stockedToInventory: false,
    ...overrides,
  };
}

describe("syncPurchaseShippingExpense", () => {
  it("creates a freight expense when shipping charge is set", () => {
    const next = syncPurchaseShippingExpense([], purchase());
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      purchaseId: "PUR-001",
      category: "Operating Expenses",
      expenseType: "Freight / Shipping",
      amount: 150,
      expenseDate: "2026-07-02",
      notes: shippingExpenseNotes(purchase()),
    });
  });

  it("updates an existing linked expense when shipping changes", () => {
    const existing: OfficeExpense = {
      id: "EXP-001",
      purchaseId: "PUR-001",
      category: "Operating Expenses",
      expenseType: "Freight / Shipping",
      amount: 100,
      expenseDate: "2026-07-01",
      notes: "old",
    };
    const next = syncPurchaseShippingExpense([existing], purchase({ shippingCharge: 200 }));
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("EXP-001");
    expect(next[0].amount).toBe(200);
    expect(next[0].expenseDate).toBe("2026-07-02");
    expect(next[0].notes).toBe(shippingExpenseNotes(purchase({ shippingCharge: 200 })));
  });

  it("removes linked expense when shipping is zero", () => {
    const existing: OfficeExpense = {
      id: "EXP-001",
      purchaseId: "PUR-001",
      category: "Operating Expenses",
      expenseType: "Freight / Shipping",
      amount: 150,
      expenseDate: "2026-07-02",
    };
    const next = syncPurchaseShippingExpense([existing], purchase({ shippingCharge: 0 }));
    expect(next).toHaveLength(0);
  });

  it("removes linked expense when purchase is cancelled", () => {
    const existing: OfficeExpense = {
      id: "EXP-001",
      purchaseId: "PUR-001",
      category: "Operating Expenses",
      expenseType: "Freight / Shipping",
      amount: 150,
      expenseDate: "2026-07-02",
    };
    const next = syncPurchaseShippingExpense(
      [existing],
      purchase({ status: "cancelled" }),
    );
    expect(next).toHaveLength(0);
  });
});

describe("reconcilePurchaseShippingExpenses", () => {
  it("keeps manual expenses and backfills missing shipping rows", () => {
    const manual: OfficeExpense = {
      id: "EXP-010",
      category: "Utility Bills",
      expenseType: "Electricity Bill",
      amount: 500,
      expenseDate: "2026-07-01",
    };
    const next = reconcilePurchaseShippingExpenses([manual], [purchase()]);
    expect(next).toHaveLength(2);
    expect(next.find((expense) => expense.id === "EXP-010")).toEqual(manual);
    expect(next.find((expense) => expense.purchaseId === "PUR-001")?.amount).toBe(150);
  });
});
