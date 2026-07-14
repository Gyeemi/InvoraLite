export const EXPENSE_CATEGORIES = [
  "Utility Bills",
  "Asset Purchases (Fixed Assets)",
  "Staff & Payroll",
  "Operating Expenses",
  "Marketing & Promotion",
  "Software & Subscriptions",
  "Maintenance & Repairs",
  "Travel & Accommodation",
  "Professional Fees",
  "Miscellaneous Expenses",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_TYPES_BY_CATEGORY: Record<ExpenseCategory, string[]> = {
  "Utility Bills": ["Electricity Bill", "Water Bill", "Internet Bill", "Phone Bill", "Other Utility"],
  "Asset Purchases (Fixed Assets)": [
    "Computer / Laptop",
    "Furniture",
    "Vehicle",
    "Equipment",
    "Other Asset",
  ],
  "Staff & Payroll": ["Salary", "Bonus", "Allowance", "Other Payroll"],
  "Operating Expenses": ["Rent", "Supplies", "Stationery", "Freight / Shipping", "Other Operating"],
  "Marketing & Promotion": ["Advertising", "Printing", "Sponsorship", "Other Marketing"],
  "Software & Subscriptions": ["Software License", "SaaS Subscription", "Other Software"],
  "Maintenance & Repairs": ["Building Repair", "Equipment Repair", "Other Maintenance"],
  "Travel & Accommodation": ["Travel", "Hotel", "Meals", "Other Travel"],
  "Professional Fees": ["Legal", "Accounting", "Consulting", "Other Professional"],
  "Miscellaneous Expenses": ["Miscellaneous"],
};

export const ASSET_CATEGORIES = [
  "Computer / Laptop",
  "Furniture",
  "Vehicle",
  "Equipment",
  "Other Asset",
] as const;

export function defaultExpenseType(category: ExpenseCategory): string {
  return EXPENSE_TYPES_BY_CATEGORY[category][0];
}

export function monthRange(year: number, month: number) {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return {
    from: toIsoDate(from),
    to: toIsoDate(to),
  };
}

export function currentMonthRange() {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth());
}

export function lastMonthRange() {
  const now = new Date();
  const month = now.getMonth() - 1;
  const year = month < 0 ? now.getFullYear() - 1 : now.getFullYear();
  return monthRange(year, (month + 12) % 12);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatPeriodLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} — ${end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${start.toLocaleDateString("en-GB")} — ${end.toLocaleDateString("en-GB")}`;
}

export function isDateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}
