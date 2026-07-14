import { AlertTriangle, Download, Package, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategorySelect } from "../components/CategorySelect";
import { CurrencyInput } from "../components/CurrencyInput";
import { PasswordConfirmDialog } from "../components/PasswordConfirmDialog";
import { SaveButton } from "../components/SaveButton";
import { LowStockThresholdModal } from "../components/LowStockThresholdModal";
import { StockAdjustModal } from "../components/StockAdjustModal";
import { useAuth } from "../contexts/AuthContext";
import { useNavigation } from "../contexts/NavigationContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../hooks/usePermissions";
import { recordAudit } from "../lib/audit";
import { exportProductsCsv, importProductsCsv } from "../lib/csv";
import {
  adjustProductStock,
  cancelSale,
  getLowStockProducts,
  getProducts,
  getSales,
  nextId,
  saveProducts,
  updateProductGstPercent,
  updateProductLowStockThreshold,
  type StockAdjustReason,
} from "../lib/data";
import { cardClass, formatCurrency, formatDateGB, inputClass, isPhoneCategory, labelClass, normalizePurchaseItemName, phoneInnerInputClass, phoneInputGroupClass, buildPurchasePhoneName, splitPurchasePhoneName, stockStatus, tableHorizontalScrollClass, tableNoWrapClass, roundMoney } from "../lib/constants";
import { DEFAULT_GST_RATE_PERCENT, productGstPercent, sellingPriceWithGst } from "../lib/gst";
import type { Product, Sale } from "../types";

type ProductsTab = "inventory" | "stock-adjustments" | "sale-returns";

const statusBadge: Record<Product["status"], string> = {
  "in-stock": "bg-accent-green/15 text-accent-green",
  low: "bg-accent-orange/15 text-accent-orange",
  out: "bg-accent-red/15 text-accent-red",
};

export function ProductsPage() {
  const { currentPage } = useNavigation();
  const { verifyPassword, user, business } = useAuth();
  const hasGst = business?.hasGst ?? false;
  const { canManageProducts, canManageSales, canDelete } = usePermissions();
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState<ProductsTab>("inventory");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [lowStockProduct, setLowStockProduct] = useState<Product | null>(null);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [gstSavingId, setGstSavingId] = useState<string | null>(null);
  const [editingGstProductId, setEditingGstProductId] = useState<string | null>(null);
  const gstInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "Electronics",
    brand: "",
    sku: "",
    price: "",
    costPrice: "",
    stock: "",
    gstPercent: String(DEFAULT_GST_RATE_PERCENT),
  });

  const isPhone = isPhoneCategory(form.category);
  const formSellingPrice = Number.parseFloat(form.price);
  const formGstPercent = Number.parseFloat(form.gstPercent);
  const formPricePreview =
    hasGst && !Number.isNaN(formSellingPrice) && formSellingPrice > 0
      ? sellingPriceWithGst(
          formSellingPrice,
          Number.isNaN(formGstPercent) ? DEFAULT_GST_RATE_PERCENT : formGstPercent,
        )
      : null;

  const visibleTabs = useMemo(() => {
    const tabs: { id: ProductsTab; label: string }[] = [{ id: "inventory", label: "Inventory" }];
    if (canManageProducts) {
      tabs.push({ id: "stock-adjustments", label: "Stock Adjustments" });
    }
    tabs.push({ id: "sale-returns", label: "Sale Returns" });
    return tabs;
  }, [canManageProducts]);

  useEffect(() => {
    if (!visibleTabs.some((entry) => entry.id === tab)) {
      setTab("inventory");
    }
  }, [visibleTabs, tab]);

  function resetForm() {
    setForm({
      name: "",
      category: "Electronics",
      brand: "",
      sku: "",
      price: "",
      costPrice: "",
      stock: "",
      gstPercent: String(DEFAULT_GST_RATE_PERCENT),
    });
  }

  useEffect(() => {
    if (currentPage !== "products") return;
    void getProducts().then(setProducts);
  }, [currentPage]);

  useEffect(() => {
    if (tab !== "sale-returns") return;
    void getSales().then((entries) => {
      setSales(
        [...entries]
          .filter((entry) => entry.status !== "cancelled")
          .sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
      );
    });
  }, [tab]);

  useEffect(() => {
    if (!editingGstProductId) return;
    const input = gstInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editingGstProductId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }, [products, search]);

  const lowStockProducts = useMemo(() => getLowStockProducts(products), [products]);

  async function handleExportCsv() {
    setCsvBusy(true);
    try {
      const result = await exportProductsCsv(products, hasGst);
      if (result.success) {
        showSuccess("Products exported to CSV.");
      } else if (result.error && result.error !== "Export cancelled.") {
        showError(result.error);
      }
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleImportCsv() {
    setCsvBusy(true);
    try {
      const result = await importProductsCsv();
      if (result.success) {
        const refreshed = await getProducts();
        setProducts(refreshed);
        showSuccess(`Imported ${result.imported} product${result.imported === 1 ? "" : "s"} from CSV.`);
        if (user) {
          await recordAudit(user.username, "inventory_update", "mentx_products", "success", `csv_import:${result.imported}`);
        }
      } else if (result.error && result.error !== "Import cancelled.") {
        showError(result.error);
      }
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleStockAdjust(payload: {
    delta: number;
    reason: StockAdjustReason;
    note: string;
  }) {
    if (!adjustProduct) return;
    try {
      const updated = await adjustProductStock({
        productId: adjustProduct.id,
        delta: payload.delta,
        audit: user
          ? {
              username: user.username,
              reason: payload.reason,
              note: payload.note,
            }
          : undefined,
      });
      if (!updated) {
        throw new Error("Product not found");
      }
      setProducts((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      showSuccess(`Stock updated for ${adjustProduct.name}.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not save stock adjustment.");
      throw error;
    }
  }

  async function handleLowStockThresholdSave(lowStockThreshold: number | null) {
    if (!lowStockProduct) return;
    const updated = await updateProductLowStockThreshold(lowStockProduct.id, lowStockThreshold);
    if (!updated) {
      throw new Error("Product not found");
    }
    setProducts((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    showSuccess(
      lowStockThreshold === null
        ? `Low stock alert disabled for ${lowStockProduct.name}.`
        : `Low stock alert set to ${lowStockThreshold} for ${lowStockProduct.name}.`,
    );
    if (user) {
      await recordAudit(
        user.username,
        "inventory_update",
        lowStockProduct.id,
        "success",
        lowStockThreshold === null ? "low_stock_alert:off" : `low_stock_alert:${lowStockThreshold}`,
      );
    }
  }

  async function handleConfirmVoid(password: string) {
    if (!voidTarget) return false;
    const ok = await verifyPassword(password);
    if (!ok) return false;

    setVoiding(true);
    try {
      const cancelled = await cancelSale(voidTarget.id);
      if (!cancelled) {
        showError("Could not void this sale.");
        return false;
      }
      if (user) {
        await recordAudit(user.username, "stock_change", voidTarget.id, "success", "sale_cancelled");
      }
      setSales((current) => current.filter((entry) => entry.id !== voidTarget.id));
      await getProducts().then(setProducts);
      showSuccess(`Sale ${voidTarget.id} voided. Stock has been restored.`);
      setVoidTarget(null);
      return true;
    } finally {
      setVoiding(false);
    }
  }

  async function handleGstPercentBlur(product: Product, value: string) {
    if (!canManageProducts) {
      setEditingGstProductId(null);
      return;
    }

    const parsed = Number.parseFloat(value);
    const nextRate = Math.min(
      100,
      Math.max(0, Number.isNaN(parsed) ? DEFAULT_GST_RATE_PERCENT : parsed),
    );

    if (nextRate === productGstPercent(product)) {
      setEditingGstProductId(null);
      return;
    }

    setGstSavingId(product.id);
    try {
      const updated = await updateProductGstPercent(product.id, nextRate);
      if (!updated) {
        showError("Could not update GST %.");
        return;
      }
      setProducts((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (user) {
        await recordAudit(
          user.username,
          "inventory_update",
          product.id,
          "success",
          `gst_percent:${nextRate}`,
        );
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not update GST %.");
    } finally {
      setGstSavingId(null);
      setEditingGstProductId(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const price = Number.parseFloat(form.price);
    const stock = Number.parseInt(form.stock, 10);
    const costPrice = form.costPrice ? Number.parseFloat(form.costPrice) : undefined;
    const gstPercentRaw = Number.parseFloat(form.gstPercent);
    const gstPercent =
      hasGst && !Number.isNaN(gstPercentRaw)
        ? Math.min(100, Math.max(0, gstPercentRaw))
        : undefined;
    const name = normalizePurchaseItemName(form.name);
    if (!name.trim() || !price || stock < 0) return;
    if (isPhone && !form.brand.trim()) return;

    setSaving(true);
    try {
      const product: Product = {
      id: nextId("PRD", products),
      name,
      category: form.category,
      brand: form.brand.trim() || undefined,
      sku:
        form.sku.trim() ||
        (form.brand.trim()
          ? `${form.brand.trim().slice(0, 3).toUpperCase()}-01`
          : "SKU-01"),
      price: roundMoney(price),
      costPrice: costPrice != null ? roundMoney(costPrice) : undefined,
      stock,
      status: stockStatus(stock),
      image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}`,
      ...(gstPercent != null ? { gstPercent } : {}),
    };

    const next = [product, ...products];
    await saveProducts(next);
    setProducts(next);
    setShowForm(false);
    resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct(product: Product) {
    const next = products.filter((p) => p.id !== product.id);
    await saveProducts(next);
    setProducts(next);
  }

  async function handleConfirmDelete(password: string) {
    const ok = await verifyPassword(password);
    if (!ok || !productToDelete) return false;
    setDeleting(true);
    try {
      await handleDeleteProduct(productToDelete);
      setProductToDelete(null);
      return true;
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Products</h2>
          <p className="text-sm text-text-secondary">Manage inventory, stock adjustments, and sale returns</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "inventory" && canManageProducts && (
            <>
              <button
                type="button"
                onClick={() => void handleExportCsv()}
                disabled={csvBusy || products.length === 0}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void handleImportCsv()}
                disabled={csvBusy}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                Import CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-accent-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-green/90"
              >
                <Plus className="h-4 w-4" />
                Add Product
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              setShowForm(false);
              setSearch("");
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              tab === entry.id
                ? "bg-accent-purple text-white"
                : "border border-border text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(tab === "inventory" || tab === "stock-adjustments") && lowStockProducts.length > 0 && (
        <div className={`${cardClass} border-accent-orange/30 bg-accent-orange/5 p-4`}>
          <div className="mb-3 flex items-center gap-2 text-accent-orange">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Low stock alert</h3>
            <span className="rounded-full bg-accent-orange/15 px-2 py-0.5 text-xs font-medium">
              {lowStockProducts.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.slice(0, 8).map((product) => (
              <span
                key={product.id}
                className="rounded-lg border border-accent-orange/20 bg-bg-card px-3 py-1.5 text-xs text-text-secondary"
              >
                {product.name} · <span className="font-medium text-accent-orange">{product.stock} left</span>
              </span>
            ))}
            {lowStockProducts.length > 8 && (
              <span className="self-center text-xs text-text-muted">
                +{lowStockProducts.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className={`${inputClass} pl-10`}
        />
      </div>

      {canManageProducts && showForm && (
        <form onSubmit={(e) => void handleAdd(e)} className={`${cardClass} space-y-4 p-6`}>
          <h3 className="font-semibold text-text-primary">Add Product</h3>

          {isPhone ? (
            <div className="rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className={phoneInputGroupClass}>
                    <input
                      placeholder="Mobile model"
                      value={splitPurchasePhoneName(form.name).model}
                      onChange={(e) => {
                        const { ramRom } = splitPurchasePhoneName(form.name);
                        setForm({
                          ...form,
                          name: buildPurchasePhoneName(e.target.value, ramRom),
                        });
                      }}
                      className={`${phoneInnerInputClass} border-r border-border`}
                      required
                    />
                    <input
                      placeholder="RAM | ROM"
                      value={splitPurchasePhoneName(form.name).ramRom}
                      onChange={(e) => {
                        const { model } = splitPurchasePhoneName(form.name);
                        setForm({
                          ...form,
                          name: buildPurchasePhoneName(model, e.target.value),
                        });
                      }}
                      className={phoneInnerInputClass}
                    />
                  </div>
                </div>
                <CategorySelect
                  value={form.category}
                  onChange={(category) => {
                    const wasPhone = isPhoneCategory(form.category);
                    const nextIsPhone = isPhoneCategory(category);
                    let name = form.name;
                    if (!wasPhone && nextIsPhone) {
                      name = buildPurchasePhoneName(form.name, "");
                    } else if (wasPhone && !nextIsPhone) {
                      name = splitPurchasePhoneName(form.name).model || form.name;
                    }
                    setForm({ ...form, category, name });
                  }}
                  placeholder="Category"
                />
                <input
                  placeholder="Brand"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className={inputClass}
                  required
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Stock"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={inputClass}
                  required
                />
                <CurrencyInput
                  value={form.costPrice ? Number.parseFloat(form.costPrice) : 0}
                  onChange={(costPrice) =>
                    setForm({ ...form, costPrice: costPrice > 0 ? String(costPrice) : "" })
                  }
                  placeholder="Cost price"
                />
                <CurrencyInput
                  value={form.price ? Number.parseFloat(form.price) : 0}
                  onChange={(price) =>
                    setForm({ ...form, price: price > 0 ? String(price) : "" })
                  }
                  placeholder={hasGst ? "Selling price (excl. GST)" : "Selling price"}
                />
                {hasGst && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="GST %"
                    value={form.gstPercent}
                    onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
                    className={inputClass}
                    required
                  />
                )}
              </div>
              {formPricePreview && (
                <p className="text-xs text-text-muted">
                  GST ({formPricePreview.gstPercent}%): {formatCurrency(formPricePreview.gst)} · Customer price:{" "}
                  {formatCurrency(formPricePreview.total)}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Product Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <CategorySelect
                  value={form.category}
                  onChange={(category) => {
                    const wasPhone = isPhoneCategory(form.category);
                    const nextIsPhone = isPhoneCategory(category);
                    let name = form.name;
                    if (!wasPhone && nextIsPhone) {
                      name = buildPurchasePhoneName(form.name, "");
                    } else if (wasPhone && !nextIsPhone) {
                      name = splitPurchasePhoneName(form.name).model || form.name;
                    }
                    setForm({ ...form, category, name });
                  }}
                  placeholder="Category"
                />
              </div>
              <div>
                <label className={labelClass}>SKU</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Cost Price</label>
                <CurrencyInput
                  value={form.costPrice ? Number.parseFloat(form.costPrice) : 0}
                  onChange={(costPrice) =>
                    setForm({ ...form, costPrice: costPrice > 0 ? String(costPrice) : "" })
                  }
                  placeholder="Cost price"
                />
              </div>
              <div>
                <label className={labelClass}>
                  {hasGst ? "Selling price (excl. GST)" : "Selling price"}
                </label>
                <CurrencyInput
                  value={form.price ? Number.parseFloat(form.price) : 0}
                  onChange={(price) =>
                    setForm({ ...form, price: price > 0 ? String(price) : "" })
                  }
                  placeholder={hasGst ? "Selling price (excl. GST)" : "Selling price"}
                />
                {formPricePreview && (
                  <p className="mt-1 text-xs text-text-muted">
                    GST ({formPricePreview.gstPercent}%): {formatCurrency(formPricePreview.gst)} · Customer price:{" "}
                    {formatCurrency(formPricePreview.total)}
                  </p>
                )}
              </div>
              {hasGst && (
                <div>
                  <label className={labelClass}>GST %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.gstPercent}
                    onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
              )}
              <div>
                <label className={labelClass}>Stock</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <SaveButton label="Save" saving={saving} variant="blue" />
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={`${cardClass} min-w-0 overflow-hidden`}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Package className="mb-3 h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-muted">No products found</p>
          </div>
        ) : (
          <div className={tableHorizontalScrollClass}>
            <table
              className={`${hasGst ? "min-w-[1120px]" : "min-w-[840px]"} ${tableNoWrapClass}`}
            >
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">
                    {hasGst ? "Selling price (excl.)" : "Price"}
                  </th>
                  {hasGst && (
                    <>
                      <th className="px-5 py-3">GST</th>
                      <th className="px-5 py-3">Price incl. GST</th>
                    </>
                  )}
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3">Status</th>
                  {canManageProducts && <th className="px-5 py-3 text-right">Low stock alert</th>}
                  {canDelete && <th className="px-5 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const gstRate = productGstPercent(p);
                  const priceWithGst = hasGst ? sellingPriceWithGst(p.price, gstRate) : null;
                  return (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-bg-hover/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg bg-bg-main object-cover"
                        />
                        <div>
                          <p className="text-sm font-medium text-text-primary">{p.name}</p>
                          <p className="text-xs text-text-muted">{p.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-text-secondary">{p.category}</td>
                    <td className="px-5 py-4 font-mono text-xs text-text-muted">{p.sku}</td>
                    <td className="px-5 py-4 text-sm font-medium text-text-primary">
                      {formatCurrency(p.price)}
                    </td>
                    {priceWithGst && (
                      <>
                        <td className="px-5 py-4 text-sm text-text-secondary">
                          <div className="flex items-center gap-1">
                            {editingGstProductId === p.id && canManageProducts ? (
                              <div className="inline-flex items-center gap-0.5">
                                <input
                                  ref={gstInputRef}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  key={`${p.id}-${gstRate}`}
                                  defaultValue={gstRate}
                                  disabled={gstSavingId === p.id}
                                  onBlur={(e) => void handleGstPercentBlur(p, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    if (e.key === "Escape") setEditingGstProductId(null);
                                  }}
                                  className="w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem] rounded-md border border-border bg-bg-main px-0.5 py-0.5 text-center text-sm tabular-nums text-text-primary focus:border-accent-blue focus:outline-none disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  aria-label={`GST % for ${p.name}`}
                                />
                                <span className="text-text-muted">%</span>
                              </div>
                            ) : (
                              <span
                                role={canManageProducts ? "button" : undefined}
                                tabIndex={canManageProducts ? 0 : undefined}
                                title={canManageProducts ? "Double-click to edit GST %" : undefined}
                                onDoubleClick={() => {
                                  if (canManageProducts) setEditingGstProductId(p.id);
                                }}
                                onKeyDown={(e) => {
                                  if (!canManageProducts) return;
                                  if (e.key === "Enter") setEditingGstProductId(p.id);
                                }}
                                className={
                                  canManageProducts
                                    ? "cursor-text text-text-muted underline decoration-dotted decoration-text-muted/50 underline-offset-2"
                                    : "text-text-muted"
                                }
                              >
                                {priceWithGst.gstPercent}%
                              </span>
                            )}
                            <span className="text-text-muted"> · </span>
                            <span className="font-medium text-text-primary">
                              {formatCurrency(priceWithGst.gst)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-text-primary">
                          {formatCurrency(priceWithGst.total)}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary">{p.stock}</span>
                        {canManageProducts && (
                          <button
                            type="button"
                            onClick={() => setAdjustProduct(p)}
                            title="Adjust stock"
                            className="inline-flex items-center rounded-md border border-border p-1 text-text-muted transition-colors hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadge[p.status]}`}
                      >
                        {p.status === "in-stock" ? "In Stock" : p.status === "low" ? "Low Stock" : "Out of Stock"}
                      </span>
                    </td>
                    {canManageProducts && (
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setLowStockProduct(p)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-orange/40 hover:bg-accent-orange/10 hover:text-accent-orange"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {p.lowStockThreshold !== undefined ? `≤ ${p.lowStockThreshold}` : "Set"}
                        </button>
                      </td>
                    )}
                    {canDelete && (
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setProductToDelete(p)}
                          disabled={deleting}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-red/40 hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {tab === "stock-adjustments" && (
        <div className="space-y-4">
          <div className={`${cardClass} p-5`}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-blue/10 p-2 text-accent-blue">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Stock adjustments</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Record stocktake corrections, damaged goods, theft, or other inventory changes.
                </p>
              </div>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product to adjust"
              className={`${inputClass} pl-10`}
            />
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">No products found</p>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{product.name}</p>
                      <p className="text-xs text-text-muted">
                        {product.sku} · Current stock: {product.stock}
                      </p>
                    </div>
                    {canManageProducts ? (
                      <button
                        type="button"
                        onClick={() => setAdjustProduct(product)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Adjust Stock
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">Read-only access</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "sale-returns" && (
        <div className="space-y-4">
          <div className={`${cardClass} p-5`}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-red/10 p-2 text-accent-red">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Sale returns & cancellations</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Void a completed sale to restore product stock and reverse any customer credit.
                </p>
              </div>
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            {sales.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">No completed sales available to void</p>
            ) : (
              <div className="divide-y divide-border/50">
                {sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-text-primary">{sale.id}</p>
                      <p className="text-sm text-text-secondary">{sale.customerName}</p>
                      <p className="text-xs text-text-muted">
                        {formatDateGB(sale.saleDate)} · {sale.items.length} item
                        {sale.items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-accent-green">
                        {formatCurrency(sale.total)}
                      </span>
                      {canManageSales ? (
                        <button
                          type="button"
                          onClick={() => setVoidTarget(sale)}
                          disabled={voiding}
                          className="inline-flex items-center gap-2 rounded-xl border border-accent-red/40 px-4 py-2 text-sm font-semibold text-accent-red transition-colors hover:bg-accent-red/10 disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" />
                          Void Sale
                        </button>
                      ) : (
                        <span className="text-xs text-text-muted">Read-only access</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <PasswordConfirmDialog
        open={productToDelete !== null}
        title="Delete product"
        description={
          productToDelete
            ? `Enter your password to delete ${productToDelete.name}.`
            : "Enter your password to continue."
        }
        confirmLabel="Delete"
        onClose={() => setProductToDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <PasswordConfirmDialog
        open={voidTarget !== null}
        title="Void sale"
        description={
          voidTarget
            ? `Enter your password to void ${voidTarget.id}. Stock will be restored and any credit reversed.`
            : "Enter your password to continue."
        }
        confirmLabel={voiding ? "Voiding…" : "Void Sale"}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
      />

      {adjustProduct && (
        <StockAdjustModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSave={handleStockAdjust}
        />
      )}

      {lowStockProduct && (
        <LowStockThresholdModal
          product={lowStockProduct}
          onClose={() => setLowStockProduct(null)}
          onSave={handleLowStockThresholdSave}
        />
      )}
    </div>
  );
}
