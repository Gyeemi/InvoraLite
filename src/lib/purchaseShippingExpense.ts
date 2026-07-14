import type { OfficeExpense, Purchase } from "../types";
import { nextId } from "./data";

export const SHIPPING_EXPENSE_CATEGORY = "Operating Expenses" as const;
export const SHIPPING_EXPENSE_TYPE = "Freight / Shipping" as const;

export function shippingExpenseNotes(purchase: Purchase): string {
  return `Auto-recorded shipping for invoice ${purchase.invoiceNo} (${purchase.supplierName})`;
}

function shouldRecordShipping(purchase: Purchase): boolean {
  return purchase.status !== "cancelled" && purchase.shippingCharge > 0;
}

export function syncPurchaseShippingExpense(
  expenses: OfficeExpense[],
  purchase: Purchase,
): OfficeExpense[] {
  const without = expenses.filter((expense) => expense.purchaseId !== purchase.id);

  if (!shouldRecordShipping(purchase)) {
    return without;
  }

  const existing = expenses.find((expense) => expense.purchaseId === purchase.id);
  const expense: OfficeExpense = {
    id: existing?.id ?? nextId("EXP", expenses),
    purchaseId: purchase.id,
    category: SHIPPING_EXPENSE_CATEGORY,
    expenseType: SHIPPING_EXPENSE_TYPE,
    amount: purchase.shippingCharge,
    expenseDate: purchase.purchaseDate,
    notes: shippingExpenseNotes(purchase),
  };

  return [expense, ...without];
}

export function reconcilePurchaseShippingExpenses(
  expenses: OfficeExpense[],
  purchases: Purchase[],
): OfficeExpense[] {
  return purchases.reduce(
    (acc, purchase) => syncPurchaseShippingExpense(acc, purchase),
    expenses.filter((expense) => !expense.purchaseId),
  );
}

export function shippingExpensesChanged(before: OfficeExpense[], after: OfficeExpense[]): boolean {
  if (before.length !== after.length) return true;
  const sortKey = (expense: OfficeExpense) =>
    `${expense.id}|${expense.purchaseId ?? ""}|${expense.amount}|${expense.expenseDate}|${expense.notes ?? ""}`;
  const a = [...before].map(sortKey).sort();
  const b = [...after].map(sortKey).sort();
  return a.some((value, index) => value !== b[index]);
}
