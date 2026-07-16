import {
  cardClass,
  formatCurrency,
  formatDateDMY,
  inputClass,
  isPhoneCategory,
  labelClass,
  type EPaymentPlatform,
  type PartialPaymentCategory,
  type PaymentCategory,
} from "../lib/constants";
import { productGstPercent, sellingPriceWithGst } from "../lib/gst";
import { DEFAULT_BASE_UOM, toBaseQty } from "../lib/inventoryUom";
import {
  buildQuotationPrintHtml,
  normalizeQuotationItem,
  quotationDefaultsForProduct,
  quotationItemLineExcl,
  quotationItemLineIncl,
  quotationTotals,
  validateQuotationDraft,
} from "../lib/quotation";
import { offerUnitOptionsForProduct } from "../lib/productOffer";
import { printHtmlDocument } from "../lib/reportPrint";
import { findRateMasterForProduct, matchRateMasterSaleUnit, todayISO } from "../lib/rateMaster";
import { usePermissions } from "../hooks/usePermissions";
import { submitSale, E_PAYMENT_PLATFORMS } from "./sales/newSaleLogic";
import type { Contact, Product, Quotation, QuotationItem, QuotationStatus, RateMaster } from "../types";
import { FileText, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CurrencyInput } from "./CurrencyInput";
import { PasswordConfirmDialog } from "./PasswordConfirmDialog";
import { SaveButton } from "./SaveButton";
import { ProductSearchSelect } from "./sales/ProductSearchSelect";
import { useAuth } from "../contexts/AuthContext";
import {
  getCustomers,
  getProducts,
  getQuotations,
  getRateMasters,
  nextId,
  saveProducts,
  saveQuotations,
} from "../lib/data";

type DraftLine = QuotationItem & { key: string };

type QuotationDraft = {
  quotationTo: string;
  contactPerson: string;
  phone: string;
  address: string;
  quotationDate: string;
  validUntil: string;
  subject: string;
  reference: string;
  notes: string;
  terms: string;
  status: QuotationStatus;
  lines: DraftLine[];
};

function newLineKey() {
  return `ql-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyLine(): DraftLine {
  return {
    key: newLineKey(),
    productId: "",
    productName: "",
    category: "",
    sku: "",
    quantity: 1,
    uom: DEFAULT_BASE_UOM,
    conversionFactor: 1,
    unitPrice: 0,
    gstPercent: 5,
  };
}

function emptyDraft(): QuotationDraft {
  return {
    quotationTo: "",
    contactPerson: "",
    phone: "",
    address: "",
    quotationDate: todayISO(),
    validUntil: "",
    subject: "",
    reference: "",
    notes: "",
    terms: "Prices are valid until the date shown above, subject to stock availability.",
    status: "draft",
    lines: [emptyLine()],
  };
}

function draftFromQuotation(q: Quotation): QuotationDraft {
  return {
    quotationTo: q.quotationTo,
    contactPerson: q.contactPerson ?? "",
    phone: q.phone ?? "",
    address: q.address ?? "",
    quotationDate: q.quotationDate,
    validUntil: q.validUntil ?? "",
    subject: q.subject ?? "",
    reference: q.reference ?? "",
    notes: q.notes ?? "",
    terms: q.terms ?? "",
    status: q.status === "converted" ? "converted" : q.status,
    lines:
      q.items.length > 0
        ? q.items.map((item) => ({ ...normalizeQuotationItem(item), key: newLineKey() }))
        : [emptyLine()],
  };
}

function statusClass(status: QuotationStatus): string {
  if (status === "accepted" || status === "converted") return "bg-accent-green/15 text-accent-green";
  if (status === "sent") return "bg-accent-blue/15 text-accent-blue";
  if (status === "cancelled") return "bg-bg-hover text-text-muted";
  return "bg-accent-orange/15 text-accent-orange";
}

export function QuotationsPanel() {
  const { business, verifyPassword, user } = useAuth();
  const { canDelete } = usePermissions();
  const hasGst = business?.hasGst ?? false;
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rateMasters, setRateMasters] = useState<RateMaster[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuotationDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null);
  const [convertPayment, setConvertPayment] = useState<PaymentCategory>("Cash");
  const [convertCustomerId, setConvertCustomerId] = useState("");
  const [convertCreditPartial, setConvertCreditPartial] = useState(false);
  const [convertAmountPaid, setConvertAmountPaid] = useState(0);
  const [convertPartialCategory, setConvertPartialCategory] =
    useState<PartialPaymentCategory>("Cash");
  const [convertEPay, setConvertEPay] = useState<EPaymentPlatform>(E_PAYMENT_PLATFORMS[0]);
  const [convertPayRef, setConvertPayRef] = useState("");

  useEffect(() => {
    void (async () => {
      const [quoteList, productList, rateList, customerList] = await Promise.all([
        getQuotations(),
        getProducts(),
        getRateMasters(),
        getCustomers(),
      ]);
      setQuotations(quoteList);
      setProducts(productList);
      setRateMasters(rateList);
      setCustomers(customerList);
    })();
  }, []);

  // Drop stale banner text left over from earlier print attempts / HMR.
  useEffect(() => {
    setError((current) =>
      current.toLowerCase().includes("pop-up") || current.toLowerCase().includes("pop up")
        ? ""
        : current,
    );
  }, []);

  const draftItems = useMemo(
    () => draft.lines.map(({ key: _k, ...item }) => normalizeQuotationItem(item)),
    [draft.lines],
  );
  const totals = useMemo(() => quotationTotals(draftItems, hasGst), [draftItems, hasGst]);

  const sorted = useMemo(
    () =>
      [...quotations].sort((a, b) =>
        b.quotationDate.localeCompare(a.quotationDate) || b.id.localeCompare(a.id),
      ),
    [quotations],
  );

  function patchDraft(patch: Partial<QuotationDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(q: Quotation) {
    setEditingId(q.id);
    setDraft(draftFromQuotation(q));
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
  }

  function printQuotation(q: Quotation) {
    setError("");
    setMessage("");
    if (!business) {
      setError("Business profile is required to print a quotation.");
      return;
    }
    try {
      const html = buildQuotationPrintHtml(business, q, hasGst);
      printHtmlDocument(html);
    } catch {
      setError("Could not open the print dialog. Try again.");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const items = draft.lines.map(({ key: _k, ...item }) => normalizeQuotationItem(item));
    const validationError = validateQuotationDraft({
      quotationTo: draft.quotationTo,
      quotationDate: draft.quotationDate,
      items,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const existing = quotations.find((entry) => entry.id === editingId);
      const payload: Quotation = {
        id: editingId ?? nextId("QT", quotations),
        quotationTo: draft.quotationTo.trim(),
        contactPerson: draft.contactPerson.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        address: draft.address.trim() || undefined,
        quotationDate: draft.quotationDate,
        validUntil: draft.validUntil.trim() || null,
        subject: draft.subject.trim() || undefined,
        reference: draft.reference.trim() || undefined,
        items,
        notes: draft.notes.trim() || undefined,
        terms: draft.terms.trim() || undefined,
        status: existing?.status === "converted" ? "converted" : draft.status,
        convertedSaleId: existing?.convertedSaleId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      const next = editingId
        ? quotations.map((entry) => (entry.id === editingId ? payload : entry))
        : [payload, ...quotations];
      await saveQuotations(next);
      setQuotations(next);
      setMessage(editingId ? "Quotation updated." : "Quotation created.");
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete(password: string) {
    if (!deleteTarget) return false;
    const ok = await verifyPassword(password);
    if (!ok) return false;
    const next = quotations.filter((entry) => entry.id !== deleteTarget.id);
    await saveQuotations(next);
    setQuotations(next);
    setDeleteTarget(null);
    setMessage("Quotation deleted.");
    return true;
  }

  function openConvert(q: Quotation) {
    if (q.status === "converted") {
      setMessage(`Already converted to ${q.convertedSaleId}.`);
      return;
    }
    setError("");
    setConvertTarget(q);
    setConvertPayment("Cash");
    setConvertCustomerId("");
    setConvertCreditPartial(false);
    setConvertAmountPaid(0);
    setConvertPartialCategory("Cash");
    setConvertEPay(E_PAYMENT_PLATFORMS[0]);
    setConvertPayRef("");
    // Prefer matching customer by quotationTo name
    const match = customers.find(
      (c) => c.name.trim().toLowerCase() === q.quotationTo.trim().toLowerCase(),
    );
    if (match) setConvertCustomerId(match.id);
  }

  async function confirmConvertToSale() {
    const q = convertTarget;
    if (!q) return;
    if (q.status === "converted") {
      setMessage(`Already converted to ${q.convertedSaleId}.`);
      setConvertTarget(null);
      return;
    }

    setConvertingId(q.id);
    setError("");
    try {
      const productList = await getProducts();
      const rateList = await getRateMasters();

      function conversionFor(item: QuotationItem, product: Product): number {
        if (item.conversionFactor && item.conversionFactor > 0) {
          const matched = matchRateMasterSaleUnit(
            findRateMasterForProduct(rateList, product),
            item.uom,
          );
          return matched?.conversionFactor ?? item.conversionFactor;
        }
        const matched = matchRateMasterSaleUnit(
          findRateMasterForProduct(rateList, product),
          item.uom,
        );
        return matched?.conversionFactor ?? 1;
      }

      const saleItems = [];
      let workingProducts = [...productList];
      let productsChanged = false;

      for (const item of q.items) {
        let product = workingProducts.find((entry) => entry.id === item.productId);
        if (!product && item.productId) {
          setError(`Product "${item.productName}" is no longer in inventory.`);
          return;
        }
        if (!product) {
          const nameMatch = workingProducts.find(
            (entry) => entry.name.trim().toLowerCase() === item.productName.trim().toLowerCase(),
          );
          if (nameMatch) {
            product = nameMatch;
          } else {
            const created: Product = {
              id: nextId("PRD", workingProducts),
              name: item.productName.trim(),
              category: item.category.trim() || "General",
              sku: item.sku.trim() || `QT-${Date.now().toString(36).toUpperCase()}`,
              price: item.unitPrice,
              stock: 0,
              status: "out",
              gstPercent: item.gstPercent,
              baseUom: item.uom.trim() || DEFAULT_BASE_UOM,
            };
            workingProducts = [created, ...workingProducts];
            productsChanged = true;
            product = created;
          }
        }
        if (isPhoneCategory(product.category)) {
          setError(
            `Quotation item "${product.name}" is a phone — convert via New Sale so IMEI can be captured.`,
          );
          return;
        }
        const conversionFactor = conversionFor(item, product);
        const lineExcl = quotationItemLineExcl(item);
        saleItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: lineExcl,
          gstPercent: item.gstPercent,
          uom: item.uom,
          conversionFactor,
          baseQtySold: toBaseQty(item.quantity, conversionFactor),
          costPerBaseAtSale: product.costPrice,
        });
      }

      if (productsChanged) {
        await saveProducts(workingProducts);
        setProducts(workingProducts);
      }

      const quoteTotals = quotationTotals(q.items, hasGst);
      const selected = customers.find((c) => c.id === convertCustomerId);
      const customer = {
        name: selected?.name ?? q.quotationTo,
        id: selected?.id,
        customerType: (selected?.customerType ?? "retail") as "retail" | "wholesale",
      };

      if (convertPayment === "E-Payment" && !convertPayRef.trim()) {
        setError("Enter the payment reference / transaction ID.");
        return;
      }

      let creditAmountPaid = quoteTotals.grandTotal;
      let creditAmountDue = 0;
      if (convertPayment === "Credit") {
        if (!customer.id) {
          setError("Select a customer for credit conversion.");
          return;
        }
        creditAmountPaid = convertCreditPartial
          ? Math.min(Math.max(0, convertAmountPaid), quoteTotals.grandTotal)
          : 0;
        creditAmountDue = Math.max(0, quoteTotals.grandTotal - creditAmountPaid);
        if (convertCreditPartial) {
          if (creditAmountPaid <= 0) {
            setError("Enter the partial payment amount received now.");
            return;
          }
          if (creditAmountPaid >= quoteTotals.grandTotal) {
            setError("Partial payment must be less than the invoice total.");
            return;
          }
          if (convertPartialCategory === "E-Payment" && !convertPayRef.trim()) {
            setError("Enter the payment reference for the partial e-payment.");
            return;
          }
        }
      }

      const sale = await submitSale({
        items: saleItems,
        customer,
        paymentCategory: convertPayment,
        creditPartialEnabled: convertCreditPartial,
        creditAmountPaid,
        creditAmountDue,
        partialPaymentCategory: convertPartialCategory,
        ePaymentPlatform: convertEPay,
        paymentReference: convertPayRef,
        discountEnabled: false,
        discountAmount: 0,
        grandTotal: quoteTotals.grandTotal,
        hasGst,
        userRole: user?.role,
        quotationUpdate: { quotations, quotationId: q.id },
      });

      const [nextQuotes, nextProducts, nextCustomers] = await Promise.all([
        getQuotations(),
        getProducts(),
        getCustomers(),
      ]);
      setQuotations(nextQuotes);
      setProducts(nextProducts);
      setCustomers(nextCustomers);
      setConvertTarget(null);
      setMessage(`Converted to sale ${sale.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert quotation.");
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
        >
          <Plus className="h-4 w-4" />
          New Quotation
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">{message}</div>
      )}
      {error && !showForm && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 text-accent-red/80 hover:text-accent-red"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSave(e)} className={`${cardClass} space-y-5 p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-text-primary">
                {editingId ? "Edit Quotation" : "New Quotation"}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Address a company, set the date, and add products from inventory.
              </p>
            </div>
            <button type="button" onClick={closeForm} className="text-text-muted hover:text-text-primary" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Quotation To (Company Name)</label>
              <input
                value={draft.quotationTo}
                onChange={(e) => patchDraft({ quotationTo: e.target.value })}
                className={inputClass}
                placeholder="Company name"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Quotation Date</label>
              <input
                type="date"
                value={draft.quotationDate}
                onChange={(e) => patchDraft({ quotationDate: e.target.value })}
                className={inputClass}
                required
              />
              <p className="mt-1 text-xs text-text-muted">
                Display: {formatDateDMY(draft.quotationDate || todayISO())}
              </p>
            </div>
            <div>
              <label className={labelClass}>Valid until (optional)</label>
              <input
                type="date"
                value={draft.validUntil}
                onChange={(e) => patchDraft({ validUntil: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Contact person</label>
              <input
                value={draft.contactPerson}
                onChange={(e) => patchDraft({ contactPerson: e.target.value })}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                value={draft.phone}
                onChange={(e) => patchDraft({ phone: e.target.value })}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Address</label>
              <input
                value={draft.address}
                onChange={(e) => patchDraft({ address: e.target.value })}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className={labelClass}>Subject</label>
              <input
                value={draft.subject}
                onChange={(e) => patchDraft({ subject: e.target.value })}
                className={inputClass}
                placeholder="e.g. Supply of beverages"
              />
            </div>
            <div>
              <label className={labelClass}>Reference</label>
              <input
                value={draft.reference}
                onChange={(e) => patchDraft({ reference: e.target.value })}
                className={inputClass}
                placeholder="Optional ref / enquiry no."
              />
            </div>
            {draft.status !== "converted" && (
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={draft.status}
                  onChange={(e) => patchDraft({ status: e.target.value as QuotationStatus })}
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Products ({draft.lines.length})
            </p>
            {draft.lines.map((line, index) => {
              const excl = quotationItemLineExcl(line);
              const incl = quotationItemLineIncl(line);
              const selectedProduct = products.find((entry) => entry.id === line.productId);
              const unitOptions = selectedProduct
                ? offerUnitOptionsForProduct(
                    rateMasters,
                    {
                      name: selectedProduct.name,
                      sku: selectedProduct.sku,
                      category: selectedProduct.category,
                    },
                    todayISO(),
                    selectedProduct,
                  )
                : [];
              const rateMaster = selectedProduct
                ? findRateMasterForProduct(rateMasters, selectedProduct)
                : undefined;
              return (
                <div key={line.key} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">Item {index + 1}</p>
                    {draft.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          patchDraft({
                            lines: draft.lines.filter((entry) => entry.key !== line.key),
                          })
                        }
                        className="text-xs text-text-muted hover:text-accent-red"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Product</label>
                    <ProductSearchSelect
                      id={`quote-product-${line.key}`}
                      products={products}
                      productId={line.productId}
                      newProductName={line.productId ? null : line.productName || null}
                      onSelectProduct={(product) => {
                        setError("");
                        const defaults = quotationDefaultsForProduct(product, rateMasters);
                        updateLine(line.key, {
                          productId: product.id,
                          productName: product.name,
                          category: product.category,
                          sku: product.sku,
                          ...defaults,
                        });
                      }}
                      onAddNewProduct={(name) => {
                        setError("");
                        updateLine(line.key, {
                          productId: "",
                          productName: name,
                          category: "",
                          sku: "",
                          unitPrice: line.unitPrice > 0 ? line.unitPrice : 0,
                          uom: DEFAULT_BASE_UOM,
                          conversionFactor: 1,
                          gstPercent: hasGst ? 5 : 0,
                        });
                      }}
                      onClearSelection={() =>
                        updateLine(line.key, {
                          productId: "",
                          productName: "",
                          category: "",
                          sku: "",
                          unitPrice: 0,
                          uom: DEFAULT_BASE_UOM,
                          conversionFactor: 1,
                          gstPercent: hasGst ? 5 : 0,
                        })
                      }
                      placeholder="Search Products by name, SKU, or ID — or type a new product"
                    />
                    {!line.productId && line.productName.trim() && (
                      <p className="mt-1 text-[11px] text-text-muted">
                        Custom product (not in inventory). Enter unit price below.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelClass}>Qty</label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity || ""}
                        onChange={(e) =>
                          updateLine(line.key, {
                            quantity: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>UOM</label>
                      {unitOptions.length > 0 ? (
                        <select
                          value={line.uom}
                          onChange={(e) => {
                            const uom = e.target.value;
                            const unit = unitOptions.find((entry) => entry.name === uom);
                            const matched = matchRateMasterSaleUnit(rateMaster, uom);
                            updateLine(line.key, {
                              uom,
                              unitPrice: unit?.sellingPrice ?? line.unitPrice,
                              conversionFactor: matched?.conversionFactor ?? 1,
                            });
                          }}
                          className={inputClass}
                        >
                          {unitOptions.map((unit) => (
                            <option key={unit.name} value={unit.name}>
                              {unit.name}
                              {unit.source === "rate-master" ? " (RM)" : ""} ·{" "}
                              {formatCurrency(unit.sellingPrice)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={line.uom}
                          onChange={(e) => updateLine(line.key, { uom: e.target.value })}
                          className={inputClass}
                          placeholder={
                            line.productName.trim() ? "e.g. Piece, Box" : "Select or enter a product first"
                          }
                          disabled={!line.productName.trim()}
                        />
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>
                        Unit price{hasGst ? " (excl.)" : ""}
                      </label>
                      <CurrencyInput
                        value={line.unitPrice}
                        onChange={(unitPrice) => updateLine(line.key, { unitPrice })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Line {hasGst ? "incl. GST" : "total"}</label>
                      <div className="flex h-[42px] items-center rounded-xl border border-border bg-bg-main px-3 text-sm font-semibold tabular-nums">
                        {formatCurrency(hasGst ? incl : excl)}
                      </div>
                      {hasGst && line.productName.trim() && (
                        <p className="mt-1 text-[11px] text-text-muted">
                          GST {productGstPercent({ gstPercent: line.gstPercent })}% · excl.{" "}
                          {formatCurrency(excl)}
                          {sellingPriceWithGst(line.unitPrice, line.gstPercent).gst > 0
                            ? ` · unit incl. ${formatCurrency(
                                sellingPriceWithGst(line.unitPrice, line.gstPercent).total,
                              )}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => patchDraft({ lines: [...draft.lines, emptyLine()] })}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-blue/40 bg-accent-blue/10 py-2.5 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/15"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </div>

          <div className="rounded-xl border border-border bg-bg-main/40 p-4 text-right space-y-1">
            {hasGst && (
              <>
                <p className="text-sm text-text-secondary">
                  Subtotal (excl.): {formatCurrency(totals.subtotalExcl)}
                </p>
                <p className="text-sm text-text-secondary">GST: {formatCurrency(totals.gstAmount)}</p>
              </>
            )}
            <p className="text-lg font-semibold text-text-primary">
              Grand Total: {formatCurrency(totals.grandTotal)}
            </p>
          </div>

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Terms</label>
              <textarea
                value={draft.terms}
                onChange={(e) => patchDraft({ terms: e.target.value })}
                className={`${inputClass} min-h-[80px]`}
              />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={draft.notes}
                onChange={(e) => patchDraft({ notes: e.target.value })}
                className={`${inputClass} min-h-[80px]`}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SaveButton label={editingId ? "Save Changes" : "Save Quotation"} saving={saving} />
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={`${cardClass} overflow-hidden`}>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-2xl bg-accent-blue/10 p-4 text-accent-blue">
              <FileText className="h-8 w-8" />
            </div>
            <p className="text-sm text-text-muted">
              No quotations yet. Create one for a company using products from inventory.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sorted.map((q) => {
              const qTotals = quotationTotals(q.items, hasGst);
              return (
                <div
                  key={q.id}
                  className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{q.quotationTo}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(q.status)}`}
                      >
                        {q.status}
                      </span>
                      <span className="text-xs text-text-muted">{q.id}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      Date {formatDateDMY(q.quotationDate)}
                      {q.subject ? ` · ${q.subject}` : ""}
                      {q.convertedSaleId ? ` · Sale ${q.convertedSaleId}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-text-primary">
                      {q.items.length} item{q.items.length === 1 ? "" : "s"} ·{" "}
                      <span className="font-semibold">{formatCurrency(qTotals.grandTotal)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => printQuotation(q)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(q)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    {q.status !== "converted" && q.status !== "cancelled" && (
                      <button
                        type="button"
                        disabled={convertingId === q.id}
                        onClick={() => openConvert(q)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent-green/40 px-3 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/10 disabled:opacity-50"
                      >
                        Convert to Sale
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(q)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-red/40 hover:bg-accent-red/10 hover:text-accent-red"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {convertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${cardClass} w-full max-w-md space-y-4 p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-text-primary">Convert to sale</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {convertTarget.quotationTo} ·{" "}
                  {formatCurrency(quotationTotals(convertTarget.items, hasGst).grandTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConvertTarget(null)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className={labelClass}>Customer (optional)</label>
              <select
                className={inputClass}
                value={convertCustomerId}
                onChange={(e) => setConvertCustomerId(e.target.value)}
              >
                <option value="">Use quotation name ({convertTarget.quotationTo})</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Payment</label>
              <select
                className={inputClass}
                value={convertPayment}
                onChange={(e) => setConvertPayment(e.target.value as PaymentCategory)}
              >
                <option value="Cash">Cash</option>
                <option value="E-Payment">E-Payment</option>
                <option value="Credit">Credit</option>
              </select>
            </div>

            {convertPayment === "E-Payment" && (
              <>
                <div>
                  <label className={labelClass}>Platform</label>
                  <select
                    className={inputClass}
                    value={convertEPay}
                    onChange={(e) => setConvertEPay(e.target.value as EPaymentPlatform)}
                  >
                    {E_PAYMENT_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Payment reference</label>
                  <input
                    className={inputClass}
                    value={convertPayRef}
                    onChange={(e) => setConvertPayRef(e.target.value)}
                  />
                </div>
              </>
            )}

            {convertPayment === "Credit" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={convertCreditPartial}
                    onChange={(e) => setConvertCreditPartial(e.target.checked)}
                  />
                  Partial payment now
                </label>
                {convertCreditPartial && (
                  <>
                    <div>
                      <label className={labelClass}>Amount paid now</label>
                      <CurrencyInput
                        value={convertAmountPaid}
                        onChange={setConvertAmountPaid}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Partial payment mode</label>
                      <select
                        className={inputClass}
                        value={convertPartialCategory}
                        onChange={(e) =>
                          setConvertPartialCategory(e.target.value as PartialPaymentCategory)
                        }
                      >
                        <option value="Cash">Cash</option>
                        <option value="E-Payment">E-Payment</option>
                      </select>
                    </div>
                    {convertPartialCategory === "E-Payment" && (
                      <div>
                        <label className={labelClass}>Payment reference</label>
                        <input
                          className={inputClass}
                          value={convertPayRef}
                          onChange={(e) => setConvertPayRef(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p className="text-sm text-accent-red">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConvertTarget(null)}
                className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
              >
                Cancel
              </button>
              <SaveButton
                type="button"
                saving={convertingId === convertTarget.id}
                label="Convert"
                savingLabel="Converting…"
                variant="green"
                onClick={() => void confirmConvertToSale()}
              />
            </div>
          </div>
        </div>
      )}

      <PasswordConfirmDialog
        open={deleteTarget !== null}
        title="Delete quotation"
        description={
          deleteTarget
            ? `Enter your password to delete ${deleteTarget.id} for ${deleteTarget.quotationTo}.`
            : "Enter your password to continue."
        }
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
