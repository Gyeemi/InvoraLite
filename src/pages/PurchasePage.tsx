import { Plus, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccessRestricted } from "../components/AccessRestricted";
import { CategorySelect } from "../components/CategorySelect";
import { CurrencyInput } from "../components/CurrencyInput";
import { PurchaseItemNameSelect } from "../components/PurchaseItemNameSelect";
import {
  PurchaseDetailModal,
  PurchaseHistoryList,
} from "../components/PurchaseHistoryPanel";
import { PurchaseReturnModal } from "../components/PurchaseReturnModal";
import { SaveButton } from "../components/SaveButton";
import { SupplierSearchSelect } from "../components/SupplierSearchSelect";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { recordAudit } from "../lib/audit";
import {
  getOfficeExpenses,
  getProducts,
  getPurchases,
  getRateMasters,
  getSalesReturns,
  getSuppliers,
  mergePurchaseIntoProducts,
  nextId,
  purchaseTotal,
  saveOfficeExpenses,
  saveProducts,
  savePurchases,
  saveRateMasters,
  saveSuppliers,
  ensureSupplierInList,
  resolveSupplierForPurchase,
  syncSupplierCredits,
  submitPurchaseReturnFromSalesReturn,
} from "../lib/data";
import { openSupplierLiableReturns, reasonLabel } from "../lib/returns";
import { syncPurchaseShippingExpense } from "../lib/purchaseShippingExpense";
import { DEFAULT_BASE_UOM, normalizePurchaseItemUom } from "../lib/inventoryUom";
import {
  applyPurchaseCostsToRateMasters,
  baseUnitsPerPurchaseUnit,
  listCurrentRateMasters,
  normalizeRateMasterUnits,
} from "../lib/rateMaster";
import {
  buildPurchasePhoneName,
  cardClass,
  formatCurrency,
  formatDateGB,
  inputClass,
  isPhoneCategory,
  labelClass,
  normalizePurchaseItemName,
  phoneInnerInputClass,
  phoneInputGroupClass,
  roundMoney,
  splitPurchasePhoneName,
} from "../lib/constants";
import type { Contact, Product, Purchase, PurchaseItem, RateMaster, SalesReturn } from "../types";

function newItemKey() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyItem(): PurchaseItem {
  return {
    name: "",
    category: "Electronics",
    brand: "",
    sku: "",
    barcode: "",
    hasSpecification: false,
    specification: "",
    quantity: 1,
    costPrice: 0,
    gstPercent: 0,
    retailSellingPrice: 0,
    wholesaleSellingPrice: 0,
    uom: DEFAULT_BASE_UOM,
    conversionFactor: 1,
  };
}

function updateItem(
  items: PurchaseItem[],
  idx: number,
  patch: Partial<PurchaseItem>,
): PurchaseItem[] {
  const next = [...items];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function isValidPurchaseItem(item: PurchaseItem): boolean {
  return (
    Boolean(item.name.trim()) &&
    Boolean(item.category) &&
    Boolean(item.sku?.trim()) &&
    item.quantity > 0 &&
    item.costPrice > 0 &&
    // Rate Master items carry retail from RM; manual items enter it on the form.
    item.retailSellingPrice > 0
  );
}

function usesRateMasterPurchaseUom(item: PurchaseItem): boolean {
  return Math.max(1, Number(item.conversionFactor) || 1) > 1;
}

function preparePurchaseItemForSave(item: PurchaseItem): PurchaseItem {
  const { sellingPrice: _legacy, ...withoutLegacy } = item as PurchaseItem & {
    sellingPrice?: number;
  };
  const conversionFactor = Math.max(1, Number(item.conversionFactor) || 1);
  const uom = item.uom?.trim() || DEFAULT_BASE_UOM;
  return normalizePurchaseItemUom({
    ...withoutLegacy,
    name: normalizePurchaseItemName(item.name),
    brand: item.brand.trim(),
    sku: item.sku?.trim() ?? "",
    barcode: item.barcode?.trim() ?? "",
    retailSellingPrice: roundMoney(item.retailSellingPrice),
    wholesaleSellingPrice: roundMoney(item.wholesaleSellingPrice),
    uom,
    conversionFactor,
    baseUom: item.baseUom?.trim() || undefined,
  });
}

export function PurchasePage() {
  const { business, user } = useAuth();
  const { canManagePurchases } = usePermissions();
  const { showSuccess, showError } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [rateMasters, setRateMasters] = useState<RateMaster[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [openReturns, setOpenReturns] = useState<SalesReturn[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyPurchase, setHistoryPurchase] = useState<Purchase | null>(null);
  const [purchaseReturnTarget, setPurchaseReturnTarget] = useState<SalesReturn | null>(null);
  const [returning, setReturning] = useState(false);
  const [itemKeys, setItemKeys] = useState<string[]>([newItemKey()]);
  const [form, setForm] = useState({
    invoiceNo: "",
    supplierName: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    shippingCharge: 0,
    items: [emptyItem()],
  });

  async function reloadPurchaseData() {
    const [purchaseList, supplierList, rateList, productList, salesReturnList] =
      await Promise.all([
        getPurchases(),
        getSuppliers(),
        getRateMasters(),
        getProducts(),
        getSalesReturns(),
      ]);
    setPurchases(purchaseList);
    setSuppliers(supplierList);
    setRateMasters(rateList);
    setProducts(productList);
    setOpenReturns(openSupplierLiableReturns(salesReturnList));
  }

  useEffect(() => {
    if (!canManagePurchases) return;
    void reloadPurchaseData();
  }, [canManagePurchases]);

  const currentRateMasters = useMemo(() => listCurrentRateMasters(rateMasters), [rateMasters]);

  function applyRateMasterToItem(idx: number, entry: RateMaster) {
    const units = normalizeRateMasterUnits(entry.units);
    const unit1 = units[0];
    const smallest = units[units.length - 1];
    const retailUnit =
      [...units].reverse().find((unit) => (unit.sellingPrice ?? 0) > 0) ?? smallest;
    const conversionFactor = baseUnitsPerPurchaseUnit(units);
    const rmCost = roundMoney(unit1?.costPrice ?? 0);
    setForm((prev) => ({
      ...prev,
      items: updateItem(prev.items, idx, {
        name: entry.productName,
        category: entry.category || prev.items[idx]?.category || "Electronics",
        brand: entry.brand,
        sku: entry.sku,
        wholesaleSellingPrice: roundMoney(unit1?.sellingPrice ?? 0),
        retailSellingPrice: roundMoney(retailUnit?.sellingPrice ?? 0),
        // Prefer Rate Master Unit 1 cost; keep typed cost only when RM has none yet.
        costPrice: rmCost > 0 ? rmCost : roundMoney(prev.items[idx]?.costPrice ?? 0),
        uom: unit1?.name || DEFAULT_BASE_UOM,
        conversionFactor,
        baseUom: smallest?.name || DEFAULT_BASE_UOM,
      }),
    }));
  }

  // Keep purchase cost locked to Rate Master Unit 1 cost when set.
  useEffect(() => {
    setForm((prev) => {
      let changed = false;
      const items = prev.items.map((item) => {
        if (!usesRateMasterPurchaseUom(item)) return item;
        const entry = currentRateMasters.find(
          (rate) =>
            rate.productName.toLowerCase() === item.name.trim().toLowerCase() ||
            (item.sku?.trim() && rate.sku.toLowerCase() === item.sku.trim().toLowerCase()),
        );
        if (!entry) return item;
        const rmCost = roundMoney(normalizeRateMasterUnits(entry.units)[0]?.costPrice ?? 0);
        if (rmCost <= 0 || item.costPrice === rmCost) return item;
        changed = true;
        return { ...item, costPrice: rmCost };
      });
      return changed ? { ...prev, items } : prev;
    });
  }, [currentRateMasters]);
  function clearSupplierSelection() {
    setSupplierId("");
    setNewSupplierName(null);
    setForm((prev) => ({ ...prev, supplierName: "" }));
  }

  function resetPurchaseForm() {
    setSupplierId("");
    setNewSupplierName(null);
    setItemKeys([newItemKey()]);
    setForm({
      invoiceNo: "",
      supplierName: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      shippingCharge: 0,
      items: [emptyItem()],
    });
  }

  const validPreviewItems = useMemo(
    () => form.items.filter((item) => isValidPurchaseItem(item)),
    [form.items],
  );

  const previewTotal = useMemo(
    () =>
      purchaseTotal(validPreviewItems, business?.hasGst ?? false, form.shippingCharge),
    [validPreviewItems, business?.hasGst, form.shippingCharge],
  );

  function addItemRow() {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
    setItemKeys((prev) => [...prev, newItemKey()]);
  }

  function removeItemRow(idx: number) {
    if (form.items.length <= 1) return;
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    setItemKeys((prev) => prev.filter((_, i) => i !== idx));
  }

  const stats = useMemo(
    () => ({
      total: purchases.length,
      pending: purchases.filter((p) => p.status === "pending").length,
      received: purchases.filter((p) => p.status === "received").length,
      value: purchases
        .filter((p) => p.status !== "cancelled")
        .reduce((s, p) => s + p.total, 0),
    }),
    [purchases],
  );

  if (!canManagePurchases) {
    return (
      <AccessRestricted description={
        <>
          Only <strong>Admin</strong>, <strong>Manager</strong>, and <strong>Store Keeper</strong> roles can manage purchases.
        </>
      }
      />
    );
  }

  async function syncSuppliersAfterPurchaseChange(
    nextPurchases: Purchase[],
    supplierName: string,
  ) {
    let supplierList = await getSuppliers();
    supplierList = ensureSupplierInList(supplierList, supplierName);
    supplierList = syncSupplierCredits(supplierList, nextPurchases);
    await saveSuppliers(supplierList);
    setSuppliers(supplierList);
  }

  async function syncShippingExpense(purchase: Purchase) {
    const expenses = await getOfficeExpenses();
    const next = syncPurchaseShippingExpense(expenses, purchase);
    await saveOfficeExpenses(next);
  }

  async function handleSave() {
    const validEntries = form.items.filter((item) => isValidPurchaseItem(item));
    if (!form.invoiceNo.trim() || !form.supplierName.trim() || validEntries.length === 0) return;

    setSaving(true);
    try {
    const shippingCharge = form.shippingCharge || 0;
    const normalizedItems = validEntries.map((item) => preparePurchaseItemForSave(item));
    const total = purchaseTotal(normalizedItems, business?.hasGst ?? false, shippingCharge);

    const { suppliers: resolvedSuppliers, supplierId: resolvedSupplierId } = resolveSupplierForPurchase(
      suppliers,
      form.supplierName.trim(),
      supplierId || undefined,
    );
    if (resolvedSuppliers.length !== suppliers.length) {
      await saveSuppliers(resolvedSuppliers);
      setSuppliers(resolvedSuppliers);
    }

    const purchase: Purchase = {
      id: nextId("PUR", purchases),
      invoiceNo: form.invoiceNo.trim(),
      supplierName: form.supplierName.trim(),
      supplierId: resolvedSupplierId || undefined,
      purchaseDate: form.purchaseDate,
      shippingCharge,
      items: normalizedItems,
      total,
      status: "received",
      createdBy: user?.role ?? "Admin",
      stockedToInventory: true,
    };

    const products = await getProducts();
    const updatedProducts = mergePurchaseIntoProducts(products, purchase);
    await saveProducts(updatedProducts);

    const latestRates = await getRateMasters();
    const ratesWithPurchaseCost = applyPurchaseCostsToRateMasters(
      latestRates,
      normalizedItems,
      purchase.purchaseDate,
    );
    await saveRateMasters(ratesWithPurchaseCost);
    setRateMasters(ratesWithPurchaseCost);

    const next = [purchase, ...purchases];
    await savePurchases(next);
    setPurchases(next);
    await syncSuppliersAfterPurchaseChange(next, purchase.supplierName);
    await syncShippingExpense(purchase);
    setShowForm(false);
    resetPurchaseForm();
    showSuccess(`Purchase ${purchase.invoiceNo} saved and stock updated.`);
    } finally {
      setSaving(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleSave();
  }

  async function handlePurchaseReturn(payload: {
    supplierId?: string;
    supplierName: string;
    debitNoteNo: string;
    returnDate: string;
    notes: string;
  }) {
    if (!purchaseReturnTarget) return;
    setReturning(true);
    try {
      let nextSuppliers = suppliers;
      if (payload.supplierName && !payload.supplierId) {
        nextSuppliers = ensureSupplierInList(suppliers, payload.supplierName);
        if (nextSuppliers !== suppliers) {
          await saveSuppliers(nextSuppliers);
          setSuppliers(nextSuppliers);
        }
      }
      const matched = nextSuppliers.find(
        (s) =>
          (payload.supplierId && s.id === payload.supplierId) ||
          s.name.trim().toLowerCase() === payload.supplierName.trim().toLowerCase(),
      );
      const result = await submitPurchaseReturnFromSalesReturn({
        salesReturn: purchaseReturnTarget,
        supplierId: matched?.id ?? payload.supplierId,
        supplierName: payload.supplierName,
        debitNoteNo: payload.debitNoteNo,
        returnDate: payload.returnDate,
        notes: payload.notes,
        createdBy: user?.role ?? user?.username ?? "Admin",
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      if (user) {
        await recordAudit(
          user.username,
          "stock_change",
          result.purchaseReturn.id,
          "success",
          `purchase_return:${purchaseReturnTarget.id}`,
        );
      }
      setPurchaseReturnTarget(null);
      await reloadPurchaseData();
      showSuccess(
        `Purchase return ${result.purchaseReturn.id} saved. Stock and supplier balance updated.`,
      );
    } finally {
      setReturning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Purchase</h2>
          <p className="text-sm text-text-secondary">Manage stock purchases</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetPurchaseForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-accent-orange px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New Purchase
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total Purchases", stats.total, "text-accent-blue"],
          ["Pending", stats.pending, "text-accent-orange"],
          ["Received", stats.received, "text-accent-green"],
          ["Total Value", formatCurrency(stats.value), "text-text-primary"],
        ].map(([label, value, color]) => (
          <div key={label as string} className={`${cardClass} p-5`}>
            <p className="text-xs uppercase tracking-wider text-text-muted">{label as string}</p>
            <p className={`mt-2 text-2xl font-bold ${color as string}`}>{value as string}</p>
          </div>
        ))}
      </div>

      {openReturns.length > 0 && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-accent-orange" />
                <h3 className="font-semibold text-text-primary">Supplier returns queue</h3>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Stage 2 — send supplier-liable sales returns out of stock with a debit note.
              </p>
            </div>
            <span className="rounded-md bg-accent-orange/15 px-2 py-0.5 text-xs font-medium text-accent-orange">
              {openReturns.length} open
            </span>
          </div>
          <ul className="divide-y divide-border/50">
            {openReturns.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {entry.id} · sale {entry.saleId}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatDateGB(entry.returnDate)} · {entry.customerName} ·{" "}
                    {reasonLabel(entry.reason)} · {formatCurrency(entry.total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPurchaseReturnTarget(entry)}
                  className="rounded-xl bg-accent-orange px-3 py-2 text-sm font-semibold text-black"
                >
                  Create purchase return
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleFormSubmit} className={`${cardClass} space-y-5 p-6`}>
          <div>
            <h3 className="font-semibold text-text-primary">New Purchase</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Record stock received. Cost updates Rate Master Unit 1 when the item is linked.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg-main/40 p-4 sm:p-5">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-text-primary">Consignment</h4>
              <p className="mt-0.5 text-xs text-text-muted">Invoice, supplier, and delivery details</p>
            </div>
            <div className="grid items-start gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Invoice / Bill No.</label>
                <input
                  value={form.invoiceNo}
                  onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
                  className={inputClass}
                  placeholder="Invoice number"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Supplier</label>
                <SupplierSearchSelect
                  id="supplierName"
                  suppliers={suppliers}
                  supplierId={supplierId}
                  newSupplierName={newSupplierName}
                  onSelectSupplier={(supplier) => {
                    setSupplierId(supplier.id);
                    setNewSupplierName(null);
                    setForm((prev) => ({ ...prev, supplierName: supplier.name }));
                  }}
                  onAddNewSupplier={(name) => {
                    setSupplierId("");
                    setNewSupplierName(name);
                    setForm((prev) => ({ ...prev, supplierName: name }));
                  }}
                  onClearSelection={clearSupplierSelection}
                />
              </div>
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-3 max-w-sm">
              <label className={labelClass}>Shipping charge</label>
              <CurrencyInput
                value={form.shippingCharge}
                onChange={(shippingCharge) => setForm({ ...form, shippingCharge })}
                placeholder="One charge for entire consignment"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg-main/40 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">
                  Products ({form.items.length})
                </h4>
                <p className="mt-0.5 text-xs text-text-muted">
                  Link Rate Master items for UOM and selling rates
                </p>
              </div>
              {validPreviewItems.length > 0 && (
                <div className="rounded-xl border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary">
                  Invoice total:{" "}
                  <span className="font-semibold text-text-primary">{formatCurrency(previewTotal)}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
            {form.items.map((item, idx) => {
              const itemKey = itemKeys[idx] ?? String(idx);
              const fromRateMaster = usesRateMasterPurchaseUom(item);
              const rateEntry = currentRateMasters.find(
                (entry) =>
                  entry.productName.toLowerCase() === item.name.trim().toLowerCase() ||
                  (item.sku?.trim() && entry.sku.toLowerCase() === item.sku.trim().toLowerCase()),
              );
              const rateUnits = rateEntry ? normalizeRateMasterUnits(rateEntry.units) : [];
              const rateCost = roundMoney(rateUnits[0]?.costPrice ?? 0);
              const costLocked = fromRateMaster && rateCost > 0;
              const ratePriceHint = rateUnits
                .filter((unit) => (unit.sellingPrice ?? 0) > 0)
                .map((unit) => `${unit.name} ${formatCurrency(unit.sellingPrice)}`)
                .join(" · ");
              const purchaseUom = item.uom?.trim() || DEFAULT_BASE_UOM;
              const sellingLabel = item.baseUom?.trim() || purchaseUom;
              const metricsGridClass = fromRateMaster
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
                : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]";

              return (
              <div
                key={itemKey}
                className="rounded-xl border border-border/70 bg-bg-card p-4"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Item {idx + 1}
                      {fromRateMaster && (
                        <span className="ml-1.5 text-xs font-normal text-accent-purple">
                          · Rate Master
                        </span>
                      )}
                    </p>
                    {(item.conversionFactor ?? 1) > 1 && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        1 {item.uom} = {item.conversionFactor} {item.baseUom || "base units"}
                      </p>
                    )}
                  </div>
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-accent-red/10 hover:text-accent-red"
                      aria-label={`Remove item ${idx + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid items-start gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className={labelClass}>Name</label>
                    {isPhoneCategory(item.category) ? (
                      <div className={phoneInputGroupClass}>
                        <input
                          placeholder="Mobile model"
                          value={splitPurchasePhoneName(item.name).model}
                          onChange={(e) => {
                            const { ramRom } = splitPurchasePhoneName(item.name);
                            setForm({
                              ...form,
                              items: updateItem(form.items, idx, {
                                name: buildPurchasePhoneName(e.target.value, ramRom),
                              }),
                            });
                          }}
                          className={`${phoneInnerInputClass} border-r border-border`}
                          required
                        />
                        <input
                          placeholder="RAM | ROM"
                          value={splitPurchasePhoneName(item.name).ramRom}
                          onChange={(e) => {
                            const { model } = splitPurchasePhoneName(item.name);
                            setForm({
                              ...form,
                              items: updateItem(form.items, idx, {
                                name: buildPurchasePhoneName(model, e.target.value),
                              }),
                            });
                          }}
                          className={phoneInnerInputClass}
                        />
                      </div>
                    ) : (
                      <PurchaseItemNameSelect
                        id={`purchase-item-name-${itemKey}`}
                        value={item.name}
                        rateMasters={currentRateMasters}
                        onSelectRateMaster={(entry) => applyRateMasterToItem(idx, entry)}
                        onChangeName={(name) => {
                          const matched = currentRateMasters.find(
                            (entry) => entry.productName.toLowerCase() === name.trim().toLowerCase(),
                          );
                          if (matched) {
                            applyRateMasterToItem(idx, matched);
                            return;
                          }
                          setForm({
                            ...form,
                            items: updateItem(form.items, idx, {
                              name,
                              uom: DEFAULT_BASE_UOM,
                              conversionFactor: 1,
                              baseUom: undefined,
                              wholesaleSellingPrice: 0,
                            }),
                          });
                        }}
                        placeholder="Search Rate Master or enter new item"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass}>Category</label>
                    <CategorySelect
                      value={item.category}
                      onChange={(category) => {
                        const wasPhone = isPhoneCategory(item.category);
                        const nextIsPhone = isPhoneCategory(category);
                        let name = item.name;
                        if (!wasPhone && nextIsPhone) {
                          name = buildPurchasePhoneName(item.name, "");
                        } else if (wasPhone && !nextIsPhone) {
                          name = splitPurchasePhoneName(item.name).model || item.name;
                        }
                        setForm({
                          ...form,
                          items: updateItem(form.items, idx, { category, name }),
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid items-start gap-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label className={labelClass}>SKU</label>
                    <input
                      placeholder="SKU"
                      value={item.sku ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: updateItem(form.items, idx, { sku: e.target.value }),
                        })
                      }
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass}>Barcode</label>
                    <input
                      placeholder="Barcode (optional)"
                      value={item.barcode ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: updateItem(form.items, idx, { barcode: e.target.value }),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass}>Brand</label>
                    <input
                      placeholder="Brand (optional)"
                      value={item.brand}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          items: updateItem(form.items, idx, { brand: e.target.value }),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-border/60 bg-bg-main/50 p-3">
                  <div
                    className={`mb-2 hidden items-center gap-3 px-1 text-[11px] font-medium uppercase tracking-wider text-text-muted lg:grid ${metricsGridClass}`}
                  >
                    <span>Qty purchased</span>
                    <span className="text-right">Cost (per {purchaseUom})</span>
                    {!fromRateMaster && (
                      <span className="text-right">Selling (per {sellingLabel})</span>
                    )}
                  </div>
                  <div
                    className={`grid grid-cols-1 items-start gap-3 ${metricsGridClass}`}
                  >
                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>
                        Qty purchased{item.uom && item.uom !== DEFAULT_BASE_UOM ? ` (${item.uom})` : ""}
                      </label>
                      <div className={phoneInputGroupClass}>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="1"
                          value={item.quantity > 0 ? item.quantity : ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setForm({
                              ...form,
                              items: updateItem(form.items, idx, {
                                quantity: raw === "" ? 0 : Math.max(0, Number.parseInt(raw, 10) || 0),
                              }),
                            });
                          }}
                          onBlur={() => {
                            if (item.quantity < 1) {
                              setForm({
                                ...form,
                                items: updateItem(form.items, idx, { quantity: 1 }),
                              });
                            }
                          }}
                          className={`${phoneInnerInputClass} text-center tabular-nums`}
                          required
                        />
                        <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
                        <div className="flex w-[7.5rem] shrink-0 items-center justify-center px-2 text-sm font-medium text-text-secondary">
                          {purchaseUom}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>
                        Cost price (per {purchaseUom})
                        {costLocked ? " — locked from Rate Master" : ""}
                      </label>
                      <CurrencyInput
                        value={costLocked ? rateCost : item.costPrice}
                        onChange={(costPrice) => {
                          if (costLocked) return;
                          setForm({
                            ...form,
                            items: updateItem(form.items, idx, { costPrice }),
                          });
                        }}
                        placeholder="0.00"
                        disabled={costLocked}
                      />
                      {costLocked && (
                        <p className="mt-1 text-xs text-text-muted">
                          Locked from Rate Master — edit cost there to change it.
                        </p>
                      )}
                    </div>
                    {!fromRateMaster && (
                      <div className="min-w-0">
                        <label className={`${labelClass} lg:sr-only`}>
                          Selling Price (per {sellingLabel})
                        </label>
                        <CurrencyInput
                          value={item.retailSellingPrice}
                          onChange={(price) =>
                            setForm({
                              ...form,
                              items: updateItem(form.items, idx, { retailSellingPrice: price }),
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                  {fromRateMaster && (
                    <div className="mt-3 rounded-lg border border-accent-purple/15 bg-accent-purple/5 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-purple">
                        Rates from Rate Master
                      </p>
                      {rateCost > 0 && (
                        <p className="mt-1 text-sm text-text-primary">
                          Cost · {rateUnits[0]?.name || purchaseUom} {formatCurrency(rateCost)}
                          <span className="ml-1 text-xs font-normal text-text-muted">
                            (locked)
                          </span>
                        </p>
                      )}
                      {ratePriceHint ? (
                        <p className={`text-sm text-text-primary ${rateCost > 0 ? "mt-0.5" : "mt-1"}`}>
                          Selling · {ratePriceHint}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-accent-orange">
                          No selling prices set on Rate Master — add at least one there.
                        </p>
                      )}
                      {item.baseUom && item.retailSellingPrice > 0 && (
                        <p className="mt-1 text-xs text-text-muted">
                          Inventory uses {formatCurrency(item.retailSellingPrice)} per {item.baseUom}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}

            <button
              type="button"
              onClick={addItemRow}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent-blue/40 bg-accent-blue/10 py-2.5 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/15"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SaveButton label="Save Purchase" saving={saving} variant="blue" />
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetPurchaseForm();
              }}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <PurchaseHistoryList
        purchases={purchases}
        suppliers={suppliers}
        onOpen={setHistoryPurchase}
      />

      <PurchaseDetailModal
        open={historyPurchase !== null}
        purchase={historyPurchase}
        suppliers={suppliers}
        hasGst={business?.hasGst ?? false}
        onClose={() => setHistoryPurchase(null)}
      />

      <PurchaseReturnModal
        open={purchaseReturnTarget !== null}
        salesReturn={purchaseReturnTarget}
        products={products}
        suppliers={suppliers}
        saving={returning}
        onClose={() => setPurchaseReturnTarget(null)}
        onSubmit={handlePurchaseReturn}
      />
    </div>
  );
}
