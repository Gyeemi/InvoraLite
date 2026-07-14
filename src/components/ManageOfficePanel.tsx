import { Package, Pencil, Plus, Printer, Receipt, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PasswordConfirmDialog } from "./PasswordConfirmDialog";
import { AccessRestricted } from "./AccessRestricted";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { CurrencyInput } from "./CurrencyInput";
import {
  getOfficeAssets,
  getOfficeExpenses,
  getPurchases,
  nextId,
  saveOfficeAssets,
  saveOfficeExpenses,
} from "../lib/data";
import {
  ASSET_CATEGORIES,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES_BY_CATEGORY,
  currentMonthRange,
  defaultExpenseType,
  formatPeriodLabel,
  isDateInRange,
  lastMonthRange,
  type ExpenseCategory,
} from "../lib/officeExpenses";
import {
  reconcilePurchaseShippingExpenses,
  shippingExpensesChanged,
} from "../lib/purchaseShippingExpense";
import { cardClass, formatCurrency, formatDateGB, inputClass, labelClass } from "../lib/constants";
import type { OfficeAsset, OfficeExpense } from "../types";

type OfficeSection = "expenses" | "assets";

type PendingOfficeAction =
  | { type: "delete-expense"; expense: OfficeExpense }
  | { type: "delete-asset"; asset: OfficeAsset }
  | { type: "edit-asset"; asset: OfficeAsset };

function openAssetEditor(asset: OfficeAsset) {
  return {
    name: asset.name,
    category: asset.category,
    purchaseDate: asset.purchaseDate,
    amount: asset.amount,
    notes: asset.notes ?? "",
  };
}
function PanelModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent-blue/15 text-accent-blue"
          : "text-text-muted hover:bg-bg-hover hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const emptyExpenseForm = (fromDate: string) => ({
  category: "Utility Bills" as ExpenseCategory,
  expenseType: "Electricity Bill",
  amount: 0,
  expenseDate: fromDate,
  notes: "",
});

const emptyAssetForm = (fromDate: string) => ({
  name: "",
  category: ASSET_CATEGORIES[0] as string,
  purchaseDate: fromDate,
  amount: 0,
  notes: "",
});

export function ManageOfficePanel() {
  const { verifyPassword } = useAuth();
  const { canManageOffice } = usePermissions();
  const [section, setSection] = useState<OfficeSection>("expenses");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [expenses, setExpenses] = useState<OfficeExpense[]>([]);
  const [assets, setAssets] = useState<OfficeAsset[]>([]);

  const initialRange = currentMonthRange();
  const [periodFrom, setPeriodFrom] = useState(initialRange.from);
  const [periodTo, setPeriodTo] = useState(initialRange.to);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm(initialRange.from));

  const [showAddAsset, setShowAddAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState<OfficeAsset | null>(null);
  const [assetForm, setAssetForm] = useState(emptyAssetForm(initialRange.from));
  const [pendingAction, setPendingAction] = useState<PendingOfficeAction | null>(null);
  useEffect(() => {
    void (async () => {
      const [expenseList, assetList, purchaseList] = await Promise.all([
        getOfficeExpenses(),
        getOfficeAssets(),
        getPurchases(),
      ]);
      const reconciled = reconcilePurchaseShippingExpenses(expenseList, purchaseList);
      if (shippingExpensesChanged(expenseList, reconciled)) {
        await saveOfficeExpenses(reconciled);
        setExpenses(reconciled);
      } else {
        setExpenses(expenseList);
      }
      setAssets(assetList);
    })();
  }, []);

  useEffect(() => {
    if (section !== "expenses") return;
    void (async () => {
      const [expenseList, purchaseList] = await Promise.all([getOfficeExpenses(), getPurchases()]);
      const reconciled = reconcilePurchaseShippingExpenses(expenseList, purchaseList);
      if (shippingExpensesChanged(expenseList, reconciled)) {
        await saveOfficeExpenses(reconciled);
        setExpenses(reconciled);
      } else {
        setExpenses(expenseList);
      }
    })();
  }, [section]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((expense) => isDateInRange(expense.expenseDate, periodFrom, periodTo))
      .filter((expense) => categoryFilter === "all" || expense.category === categoryFilter)
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }, [expenses, periodFrom, periodTo, categoryFilter]);

  const periodTotal = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses],
  );

  const assetsTotal = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.amount, 0),
    [assets],
  );

  async function persistExpenses(next: OfficeExpense[]) {
    await saveOfficeExpenses(next);
    setExpenses(next);
  }

  async function persistAssets(next: OfficeAsset[]) {
    await saveOfficeAssets(next);
    setAssets(next);
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (expenseForm.amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    const expense: OfficeExpense = {
      id: nextId("EXP", expenses),
      category: expenseForm.category,
      expenseType: expenseForm.expenseType,
      amount: expenseForm.amount,
      expenseDate: expenseForm.expenseDate,
      notes: expenseForm.notes.trim() || undefined,
    };

    await persistExpenses([expense, ...expenses]);

    if (expenseForm.category === "Asset Purchases (Fixed Assets)") {
      const asset: OfficeAsset = {
        id: nextId("AST", assets),
        name: expense.expenseType,
        category: expense.expenseType,
        purchaseDate: expense.expenseDate,
        amount: expense.amount,
        notes: expense.notes,
      };
      await persistAssets([asset, ...assets]);
    }

    setShowAddExpense(false);
    setExpenseForm(emptyExpenseForm(periodFrom));
    setMessage("Expense saved successfully.");
  }

  async function handleRemoveExpense(expense: OfficeExpense) {
    if (expense.purchaseId) {
      setError("This shipping expense is linked to a purchase. Edit the purchase shipping charge instead.");
      return;
    }
    await persistExpenses(expenses.filter((item) => item.id !== expense.id));
    setMessage("Expense removed.");
    setError("");
  }

  async function handleSaveAsset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    const name = assetForm.name.trim();
    if (!name) {
      setError("Asset name is required.");
      return;
    }
    if (assetForm.amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    if (editingAsset) {
      await persistAssets(
        assets.map((asset) =>
          asset.id === editingAsset.id
            ? {
                ...asset,
                name,
                category: assetForm.category,
                purchaseDate: assetForm.purchaseDate,
                amount: assetForm.amount,
                notes: assetForm.notes.trim() || undefined,
              }
            : asset,
        ),
      );
      setEditingAsset(null);
      setMessage(`${name} was updated successfully.`);
      return;
    }

    const asset: OfficeAsset = {
      id: nextId("AST", assets),
      name,
      category: assetForm.category,
      purchaseDate: assetForm.purchaseDate,
      amount: assetForm.amount,
      notes: assetForm.notes.trim() || undefined,
    };
    await persistAssets([asset, ...assets]);
    setShowAddAsset(false);
    setAssetForm(emptyAssetForm(periodFrom));
    setMessage(`${name} was added successfully.`);
  }

  async function handleRemoveAsset(asset: OfficeAsset) {
    await persistAssets(assets.filter((item) => item.id !== asset.id));
    setMessage(`${asset.name} was removed.`);
    setError("");
  }

  async function handlePasswordConfirm(password: string) {
    const ok = await verifyPassword(password);
    if (!ok || !pendingAction) return false;

    if (pendingAction.type === "delete-expense") {
      await handleRemoveExpense(pendingAction.expense);
      setPendingAction(null);
      return true;
    }

    if (pendingAction.type === "delete-asset") {
      await handleRemoveAsset(pendingAction.asset);
      setPendingAction(null);
      return true;
    }

    setAssetForm(openAssetEditor(pendingAction.asset));
    setEditingAsset(pendingAction.asset);
    setPendingAction(null);
    return true;
  }

  const passwordDialogTitle =
    pendingAction?.type === "delete-expense"
      ? "Delete expense"
      : pendingAction?.type === "delete-asset"
        ? "Delete asset"
        : "Edit asset";

  const passwordDialogDescription =
    pendingAction?.type === "delete-expense"
      ? `Enter your password to delete ${pendingAction.expense.expenseType}.`
      : pendingAction?.type === "delete-asset"
        ? `Enter your password to delete ${pendingAction.asset.name}.`
        : pendingAction?.type === "edit-asset"
          ? `Enter your password to edit ${pendingAction.asset.name}.`
          : "Enter your password to continue.";

  const passwordDialogConfirmLabel =
    pendingAction?.type === "delete-expense" || pendingAction?.type === "delete-asset"
      ? "Delete"
      : "Continue";
  function printExpenseReport() {
    const rows = filteredExpenses
      .map(
        (expense) => `
        <tr>
          <td>${formatDateGB(expense.expenseDate)}</td>
          <td>${expense.category}</td>
          <td>${expense.expenseType}</td>
          <td style="text-align:right">${formatCurrency(expense.amount)}</td>
          <td>${expense.notes ?? ""}</td>
        </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html><html><head><title>Expense Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p { color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
        th { background: #f5f5f5; text-align: left; }
        .total { margin-top: 16px; font-weight: bold; }
      </style></head><body>
      <h1>Expense Report</h1>
      <p>${formatPeriodLabel(periodFrom, periodTo)}</p>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Type</th><th>Amount</th><th>Notes</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No expenses</td></tr>'}</tbody>
      </table>
      <p class="total">Total: ${formatCurrency(periodTotal)} (${filteredExpenses.length} records)</p>
      </body></html>`;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }

  if (!canManageOffice) {
    return (
      <AccessRestricted description="Only Super Admin and Manager can manage office expenses and fixed assets." />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">
        Track office expenses and fixed assets for your business.
      </p>

      {message && (
        <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">{message}</div>
      )}
      {error && (
        <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <SectionTab
          active={section === "expenses"}
          onClick={() => setSection("expenses")}
          icon={<Receipt className="h-4 w-4" />}
          label="Expenses"
        />
        <SectionTab
          active={section === "assets"}
          onClick={() => setSection("assets")}
          icon={<Package className="h-4 w-4" />}
          label="Assets"
        />
      </div>

      {section === "expenses" && (
        <div className="space-y-4">
          <div className={`${cardClass} p-5`}>
            <p className="text-sm text-text-muted">Total for {formatPeriodLabel(periodFrom, periodTo)}</p>
            <p className="mt-1 text-3xl font-bold text-text-primary">{formatCurrency(periodTotal)}</p>
            <p className="mt-1 text-sm text-text-secondary">{filteredExpenses.length} records</p>
          </div>

          <div className={`${cardClass} space-y-4 p-5`}>
            <p className="text-sm font-semibold text-text-primary">Report period</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>From</label>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>To</label>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const range = currentMonthRange();
                  setPeriodFrom(range.from);
                  setPeriodTo(range.to);
                }}
                className="rounded-xl border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
              >
                This month
              </button>
              <button
                type="button"
                onClick={() => {
                  const range = lastMonthRange();
                  setPeriodFrom(range.from);
                  setPeriodTo(range.to);
                }}
                className="rounded-xl border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
              >
                Last month
              </button>
            </div>
          </div>

          <div className={`${cardClass} flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between`}>
            <div className="min-w-[220px] flex-1">
              <label className={labelClass}>Filter by category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All categories</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={printExpenseReport}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/10"
              >
                <Printer className="h-4 w-4" />
                Print Report
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setExpenseForm(emptyExpenseForm(periodFrom));
                  setShowAddExpense(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Add Expense
              </button>
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-text-primary">Expenses in selected period</h3>
            </div>
            {filteredExpenses.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">
                No expenses found between {formatPeriodLabel(periodFrom, periodTo)}.
              </p>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{expense.expenseType}</p>
                      <p className="text-sm text-text-secondary">{expense.category}</p>
                      <p className="mt-1 text-xs text-text-muted">{formatDateGB(expense.expenseDate)}</p>
                      {expense.notes && (
                        <p className="mt-2 text-sm text-text-muted">{expense.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-text-primary">
                        {formatCurrency(expense.amount)}
                      </span>
                      {!expense.purchaseId && (
                        <button
                          type="button"
                          onClick={() => setPendingAction({ type: "delete-expense", expense })}
                          className="text-accent-red transition-colors hover:text-accent-red/80"
                          aria-label="Remove expense"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {section === "assets" && (
        <div className="space-y-4">
          <div className={`${cardClass} p-5`}>
            <p className="text-sm text-text-muted">Total fixed assets</p>
            <p className="mt-1 text-3xl font-bold text-text-primary">{formatCurrency(assetsTotal)}</p>
            <p className="mt-1 text-sm text-text-secondary">{assets.length} assets</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-text-primary">Fixed assets</h3>
            <button
              type="button"
              onClick={() => {
                setError("");
                setAssetForm(emptyAssetForm(periodFrom));
                setShowAddAsset(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Add Asset
            </button>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            {assets.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">No assets recorded yet.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{asset.name}</p>
                      <p className="text-sm text-text-secondary">{asset.category}</p>
                      <p className="mt-1 text-xs text-text-muted">{formatDateGB(asset.purchaseDate)}</p>
                      {asset.notes && <p className="mt-2 text-sm text-text-muted">{asset.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-text-primary">
                        {formatCurrency(asset.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ type: "edit-asset", asset })}
                        className="text-text-muted transition-colors hover:text-accent-blue"
                        aria-label="Edit asset"
                      >                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingAction({ type: "delete-asset", asset })}
                        className="text-accent-red transition-colors hover:text-accent-red/80"
                        aria-label="Remove asset"
                      >                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddExpense && (
        <PanelModal title="New Expense" onClose={() => setShowAddExpense(false)}>
          <form onSubmit={(e) => void handleSaveExpense(e)} className="space-y-4">
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => {
                  const category = e.target.value as ExpenseCategory;
                  setExpenseForm({
                    ...expenseForm,
                    category,
                    expenseType: defaultExpenseType(category),
                  });
                }}
                className={inputClass}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Expense type</label>
              <select
                value={expenseForm.expenseType}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseType: e.target.value })}
                className={inputClass}
              >
                {EXPENSE_TYPES_BY_CATEGORY[expenseForm.category].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Amount (Nu.)</label>
              <CurrencyInput
                value={expenseForm.amount}
                onChange={(amount) => setExpenseForm({ ...expenseForm, amount })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelClass}>Expense date</label>
              <input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                rows={3}
                placeholder="Invoice no., vendor, remarks..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <button type="submit" className="w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white">
              Save Expense
            </button>
          </form>
        </PanelModal>
      )}

      {(showAddAsset || editingAsset) && (
        <PanelModal
          title={editingAsset ? "Edit Asset" : "Add Asset"}
          onClose={() => {
            setShowAddAsset(false);
            setEditingAsset(null);
            setAssetForm(emptyAssetForm(periodFrom));
          }}
        >
          <form onSubmit={(e) => void handleSaveAsset(e)} className="space-y-4">
            <div>
              <label className={labelClass}>Asset name</label>
              <input
                value={assetForm.name}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={assetForm.category}
                onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                className={inputClass}
              >
                {ASSET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Purchase date</label>
              <input
                type="date"
                value={assetForm.purchaseDate}
                onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Amount (Nu.)</label>
              <CurrencyInput
                value={assetForm.amount}
                onChange={(amount) => setAssetForm({ ...assetForm, amount })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                value={assetForm.notes}
                onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                rows={3}
                placeholder="Serial no., warranty, remarks..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <button type="submit" className="w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white">
              {editingAsset ? "Save Changes" : "Save Asset"}
            </button>
          </form>
        </PanelModal>
      )}

      <PasswordConfirmDialog
        open={pendingAction !== null}
        title={passwordDialogTitle}
        description={passwordDialogDescription}
        confirmLabel={passwordDialogConfirmLabel}
        onClose={() => setPendingAction(null)}
        onConfirm={handlePasswordConfirm}
      />
    </div>
  );
}