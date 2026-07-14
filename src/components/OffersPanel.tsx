import { Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CurrencyInput } from "./CurrencyInput";
import { OfferProductSelect } from "./OfferProductSelect";
import { PasswordConfirmDialog } from "./PasswordConfirmDialog";
import { SaveButton } from "./SaveButton";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { getProductOffers, getProducts, getRateMasters, nextId, saveProductOffers } from "../lib/data";
import { OFFER_TYPES, isOfferCheckoutLive, offerTypeLabel, offerTypeShort } from "../lib/offerTypes";
import {
  emptyOfferDefaults,
  offerStatus,
  offerUnitOptionsForProduct,
  resolveOfferSellingPrice,
  validateProductOfferDraft,
  type OfferStatus,
} from "../lib/productOffer";
import { listCurrentRateMasters, matchRateMasterSaleUnit, todayISO } from "../lib/rateMaster";
import {
  cardClass,
  formatCurrency,
  formatDateGB,
  inputClass,
  labelClass,
  roundMoney,
} from "../lib/constants";
import { DEFAULT_BASE_UOM } from "../lib/inventoryUom";
import type {
  OfferDiscountType,
  OfferType,
  Product,
  ProductOffer,
  RateMaster,
} from "../types";

type OfferDraft = Omit<ProductOffer, "id" | "createdAt" | "updatedAt">;

function emptyDraft(): OfferDraft {
  return emptyOfferDefaults();
}

function draftFromOffer(offer: ProductOffer): OfferDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = offer;
  return { ...rest, effectiveTo: offer.effectiveTo };
}

function statusBadgeClass(status: OfferStatus): string {
  if (status === "active") return "bg-accent-green/15 text-accent-green";
  if (status === "scheduled") return "bg-accent-blue/15 text-accent-blue";
  if (status === "inactive") return "bg-accent-orange/15 text-accent-orange";
  return "bg-bg-hover text-text-muted";
}

function statusLabel(status: OfferStatus): string {
  if (status === "active") return "Active";
  if (status === "scheduled") return "Scheduled";
  if (status === "inactive") return "Inactive";
  return "Expired";
}

function needsMainProduct(type: OfferType): boolean {
  return ![
    "BILL_VALUE",
    "COUPON",
    "LOYALTY",
    "PAYMENT",
    "REFERRAL",
    "EVENT",
    "MIX_MATCH",
  ].includes(type);
}

function summaryForOffer(offer: ProductOffer): string {
  switch (offer.offerType) {
    case "DISCOUNT":
    case "CLEARANCE":
    case "TIME_BOUND":
    case "MEMBERSHIP":
    case "FIRST_PURCHASE":
      if (offer.discountType === "PERCENT") return `${offer.discountValue}% off`;
      if (offer.discountType === "FLAT") return `${formatCurrency(offer.discountValue)} off`;
      return `Offer ${formatCurrency(offer.offerPrice)}`;
    case "FLAT_OFF":
      return `${formatCurrency(offer.discountValue)} off`;
    case "BOGO":
      return `Buy ${offer.buyQty} get ${offer.freeQty} free`;
    case "BUY_X_GET_Y":
      return `Buy ${offer.buyQty} → free ${offer.freeItemName || offer.freeItemSku}`;
    case "BUY_X_GET_Y_DISC":
      return `Buy ${offer.buyQty} → ${offer.discountValue}% off ${offer.freeItemName || "item"}`;
    case "SLAB":
      return `${offer.slabs.length} slab${offer.slabs.length === 1 ? "" : "s"}`;
    case "BILL_VALUE":
      return `Bill ≥ ${formatCurrency(offer.minBillValue)}`;
    case "COUPON":
      return `Code ${offer.couponCode}`;
    case "COMBO":
      return `Bundle ${formatCurrency(offer.bundlePrice)}`;
    case "FREE_GIFT":
      return `Gift ${offer.giftProductName || offer.giftSku}`;
    case "EVENT":
      return offer.eventName || "Event";
    case "CASHBACK":
      return `${offer.cashbackPercent}% cashback`;
    case "PAYMENT":
      return offer.paymentMethod || "Payment offer";
    case "LOYALTY":
      return "Points redemption";
    case "MIX_MATCH":
      return `Any ${offer.mixMatchQty} from group`;
    case "REFERRAL":
      return `Referrer ${formatCurrency(offer.referrerReward)}`;
    default:
      return offerTypeShort(offer.offerType);
  }
}

export function OffersPanel() {
  const { verifyPassword } = useAuth();
  const { canDelete } = usePermissions();
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [rateMasters, setRateMasters] = useState<RateMaster[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfferDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductOffer | null>(null);

  const today = todayISO();
  const currentRates = useMemo(() => listCurrentRateMasters(rateMasters, today), [rateMasters, today]);

  useEffect(() => {
    void (async () => {
      const [offerList, rateList, productList] = await Promise.all([
        getProductOffers(),
        getRateMasters(),
        getProducts(),
      ]);
      setOffers(offerList);
      setRateMasters(rateList);
      setProducts(productList);
    })();
  }, []);

  const selectedCatalogProduct = useMemo(() => {
    const sku = draft.sku.trim().toLowerCase();
    if (sku) {
      const bySku = products.find((entry) => entry.sku.trim().toLowerCase() === sku);
      if (bySku) return bySku;
    }
    return products.find(
      (entry) =>
        entry.name.trim().toLowerCase() === draft.productName.trim().toLowerCase() &&
        entry.category.trim().toLowerCase() === draft.category.trim().toLowerCase(),
    );
  }, [products, draft.sku, draft.productName, draft.category]);

  const unitOptions = useMemo(
    () =>
      offerUnitOptionsForProduct(
        rateMasters,
        { name: draft.productName, sku: draft.sku, category: draft.category },
        today,
        selectedCatalogProduct,
      ),
    [rateMasters, draft.productName, draft.sku, draft.category, today, selectedCatalogProduct],
  );

  const listPrice = useMemo(() => {
    const unit = unitOptions.find(
      (entry) => entry.name.trim().toLowerCase() === draft.unitName.trim().toLowerCase(),
    );
    return unit?.sellingPrice ?? 0;
  }, [unitOptions, draft.unitName]);

  const previewPrice = useMemo(() => {
    if (!draft.unitName || listPrice <= 0) return 0;
    return resolveOfferSellingPrice({ ...draft, id: "preview", createdAt: "", updatedAt: "" }, listPrice, draft.buyQty);
  }, [draft, listPrice]);

  function patchDraft(patch: Partial<OfferDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function applyRateMaster(entry: RateMaster) {
    const units = offerUnitOptionsForProduct([entry], {
      name: entry.productName,
      sku: entry.sku,
      category: entry.category,
    });
    const preferred = units.find((unit) => unit.sellingPrice > 0) ?? units[units.length - 1];
    patchDraft({
      productName: entry.productName,
      category: entry.category,
      brand: entry.brand,
      sku: entry.sku,
      unitName: preferred?.name ?? "",
      offerPrice:
        draft.discountType === "OFFER_PRICE" && preferred?.sellingPrice
          ? roundMoney(preferred.sellingPrice * 0.9)
          : draft.offerPrice,
    });
  }

  function applyCatalogProduct(product: Product) {
    const units = offerUnitOptionsForProduct(
      rateMasters,
      { name: product.name, sku: product.sku, category: product.category },
      today,
      product,
    );
    const preferred = units[0];
    patchDraft({
      productName: product.name,
      category: product.category,
      brand: product.brand ?? "",
      sku: product.sku,
      unitName: preferred?.name ?? product.baseUom?.trim() ?? DEFAULT_BASE_UOM,
      offerPrice:
        draft.discountType === "OFFER_PRICE" && preferred?.sellingPrice
          ? roundMoney(preferred.sellingPrice * 0.9)
          : draft.offerPrice,
    });
  }

  function applyRewardProduct(product: Product, asGift: boolean) {
    const units = offerUnitOptionsForProduct(
      rateMasters,
      { name: product.name, sku: product.sku, category: product.category },
      today,
      product,
    );
    const unit = units[0]?.name ?? product.baseUom?.trim() ?? DEFAULT_BASE_UOM;
    if (asGift) {
      patchDraft({
        giftProductName: product.name,
        giftSku: product.sku,
        giftCategory: product.category,
        giftUnit: unit,
      });
      return;
    }
    patchDraft({
      freeItemName: product.name,
      freeItemSku: product.sku,
      freeItemCategory: product.category,
      freeItemUnit: unit,
    });
  }

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(offer: ProductOffer) {
    setEditingId(offer.id);
    setDraft(draftFromOffer(offer));
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateProductOfferDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (
      needsMainProduct(draft.offerType) &&
      unitOptions.length > 0 &&
      !unitOptions.some((unit) => unit.name === draft.unitName)
    ) {
      setError("Select a unit from the product sale units.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const payload: ProductOffer = {
        ...draft,
        id: editingId ?? nextId("OFF", offers),
        effectiveTo: typeof draft.effectiveTo === "string" && draft.effectiveTo.trim()
          ? draft.effectiveTo.trim()
          : null,
        createdAt: offers.find((entry) => entry.id === editingId)?.createdAt ?? now,
        updatedAt: now,
      };

      const next = editingId
        ? offers.map((entry) => (entry.id === editingId ? payload : entry))
        : [payload, ...offers];
      await saveProductOffers(next);
      setOffers(next);
      setMessage(editingId ? "Offer updated." : "Offer created.");
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete(password: string) {
    if (!deleteTarget) return false;
    const ok = await verifyPassword(password);
    if (!ok) return false;
    const next = offers.filter((entry) => entry.id !== deleteTarget.id);
    await saveProductOffers(next);
    setOffers(next);
    setDeleteTarget(null);
    setMessage("Offer deleted.");
    return true;
  }

  const sortedOffers = useMemo(
    () =>
      [...offers].sort((a, b) => {
        const statusOrder = { active: 0, scheduled: 1, inactive: 2, expired: 3 } as const;
        const byStatus = statusOrder[offerStatus(a, today)] - statusOrder[offerStatus(b, today)];
        if (byStatus !== 0) return byStatus;
        return b.priority - a.priority || b.effectiveFrom.localeCompare(a.effectiveFrom);
      }),
    [offers, today],
  );

  function renderDiscountFields() {
    return (
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Discount mode</label>
          <select
            value={draft.discountType}
            onChange={(e) => patchDraft({ discountType: e.target.value as OfferDiscountType })}
            className={inputClass}
          >
            <option value="OFFER_PRICE">Fixed offer price</option>
            <option value="PERCENT">Percentage off</option>
            <option value="FLAT">Flat amount off</option>
          </select>
        </div>
        {draft.discountType === "OFFER_PRICE" ? (
          <div>
            <label className={labelClass}>Offer price</label>
            <CurrencyInput
              value={draft.offerPrice}
              onChange={(offerPrice) => patchDraft({ offerPrice })}
              placeholder="0.00"
            />
          </div>
        ) : (
          <div>
            <label className={labelClass}>
              {draft.discountType === "PERCENT" ? "Discount %" : "Amount off"}
            </label>
            {draft.discountType === "PERCENT" ? (
              <input
                type="number"
                min={1}
                max={100}
                value={draft.discountValue || ""}
                onChange={(e) =>
                  patchDraft({
                    discountValue: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className={inputClass}
              />
            ) : (
              <CurrencyInput
                value={draft.discountValue}
                onChange={(discountValue) => patchDraft({ discountValue })}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-purple px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-purple/90"
        >
          <Plus className="h-4 w-4" />
          Add Offer
        </button>
      </div>

      {message && (
        <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">{message}</div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSave(e)} className={`${cardClass} space-y-5 p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-text-primary">
                {editingId ? "Edit Offer" : "New Offer"}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Choose an offer type, then fill the fields for that mechanic.
              </p>
            </div>
            <button type="button" onClick={closeForm} className="text-text-muted hover:text-text-primary" aria-label="Close form">
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Offer name</label>
              <input
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                className={inputClass}
                placeholder="e.g. Weekend Tray Special"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Offer type</label>
              <select
                value={draft.offerType}
                onChange={(e) => patchDraft({ offerType: e.target.value as OfferType })}
                className={inputClass}
              >
                {OFFER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {offerTypeLabel(type)}
                  </option>
                ))}
              </select>
              {draft.offerType === "EVENT" && !draft.linkedOfferType ? (
                <p className="mt-1.5 rounded-lg bg-accent-orange/10 px-3 py-2 text-xs text-accent-orange">
                  Event offers need a linked offer type to apply at the till.
                </p>
              ) : null}
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <input
                type="number"
                min={0}
                value={draft.priority}
                onChange={(e) => patchDraft({ priority: Math.max(0, Number(e.target.value) || 0) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={draft.status}
                onChange={(e) =>
                  patchDraft({ status: e.target.value === "inactive" ? "inactive" : "active" })
                }
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Effective from</label>
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={(e) => patchDraft({ effectiveFrom: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Effective to (optional)</label>
              <input
                type="date"
                value={draft.effectiveTo ?? ""}
                onChange={(e) => patchDraft({ effectiveTo: e.target.value || null })}
                className={inputClass}
              />
            </div>
          </div>

          {needsMainProduct(draft.offerType) && (
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Product</label>
                <OfferProductSelect
                  id="offer-product-name"
                  value={draft.productName}
                  rateMasters={currentRates}
                  products={products}
                  onSelect={(pick) => {
                    if (pick.source === "rate-master") applyRateMaster(pick.rateMaster);
                    else applyCatalogProduct(pick.product);
                  }}
                  onChangeName={(name) => {
                    const matchedRate = currentRates.find(
                      (entry) => entry.productName.toLowerCase() === name.trim().toLowerCase(),
                    );
                    if (matchedRate) {
                      applyRateMaster(matchedRate);
                      return;
                    }
                    const matchedProduct = products.find(
                      (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
                    );
                    if (matchedProduct) {
                      applyCatalogProduct(matchedProduct);
                      return;
                    }
                    patchDraft({
                      productName: name,
                      sku: "",
                      category: "",
                      brand: "",
                      unitName: "",
                    });
                  }}
                  placeholder="Search Rate Master or Products"
                />
              </div>
              <div>
                <label className={labelClass}>SKU</label>
                <input value={draft.sku} className={inputClass} readOnly placeholder="From product" />
              </div>
              <div>
                <label className={labelClass}>Unit</label>
                <select
                  value={draft.unitName}
                  onChange={(e) => {
                    const unitName = e.target.value;
                    const unit = unitOptions.find((entry) => entry.name === unitName);
                    patchDraft({
                      unitName,
                      offerPrice:
                        draft.discountType === "OFFER_PRICE" && unit
                          ? roundMoney(unit.sellingPrice * 0.9)
                          : draft.offerPrice,
                    });
                  }}
                  className={inputClass}
                  required
                  disabled={unitOptions.length === 0}
                >
                  <option value="">
                    {unitOptions.length === 0 ? "Select a product first" : "Select unit"}
                  </option>
                  {unitOptions.map((unit) => (
                    <option key={unit.name} value={unit.name}>
                      {unit.name} · {formatCurrency(unit.sellingPrice)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-bg-main/40 p-4 space-y-4">
            {(draft.offerType === "DISCOUNT" ||
              draft.offerType === "CLEARANCE" ||
              draft.offerType === "TIME_BOUND" ||
              draft.offerType === "MEMBERSHIP" ||
              draft.offerType === "FIRST_PURCHASE") &&
              renderDiscountFields()}

            {draft.offerType === "FLAT_OFF" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Flat amount off</label>
                  <CurrencyInput
                    value={draft.discountValue}
                    onChange={(discountValue) => patchDraft({ discountValue, discountType: "FLAT" })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max qty (optional)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.maxQty ?? ""}
                    onChange={(e) =>
                      patchDraft({
                        maxQty: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {draft.offerType === "BOGO" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Buy qty</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.buyQty}
                    onChange={(e) => patchDraft({ buyQty: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Free qty</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.freeQty}
                    onChange={(e) => patchDraft({ freeQty: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {(draft.offerType === "BUY_X_GET_Y" || draft.offerType === "BUY_X_GET_Y_DISC") && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Main buy qty</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.buyQty}
                    onChange={(e) => patchDraft({ buyQty: Math.max(1, Number(e.target.value) || 1) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reward item</label>
                  <OfferProductSelect
                    id="offer-free-item"
                    value={draft.freeItemName}
                    rateMasters={currentRates}
                    products={products}
                    onSelect={(pick) => {
                      if (pick.source === "rate-master") {
                        const entry = pick.rateMaster;
                        const units = offerUnitOptionsForProduct([entry], {
                          name: entry.productName,
                          sku: entry.sku,
                          category: entry.category,
                        });
                        patchDraft({
                          freeItemName: entry.productName,
                          freeItemSku: entry.sku,
                          freeItemCategory: entry.category,
                          freeItemUnit: units[0]?.name ?? "",
                        });
                      } else {
                        applyRewardProduct(pick.product, false);
                      }
                    }}
                    onChangeName={(name) => patchDraft({ freeItemName: name })}
                    placeholder="Search reward product"
                    required={false}
                  />
                </div>
                {draft.offerType === "BUY_X_GET_Y" ? (
                  <div>
                    <label className={labelClass}>Free qty</label>
                    <input
                      type="number"
                      min={1}
                      value={draft.freeQty}
                      onChange={(e) => patchDraft({ freeQty: Math.max(1, Number(e.target.value) || 1) })}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Discount % on reward item</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draft.discountValue || ""}
                      onChange={(e) =>
                        patchDraft({
                          discountType: "PERCENT",
                          discountValue: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            )}

            {draft.offerType === "SLAB" && (
              <div className="space-y-3">
                <p className="text-xs text-text-muted">Quantity slabs (min–max, discount %)</p>
                {draft.slabs.map((slab, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                    <input
                      type="number"
                      min={1}
                      value={slab.minQty}
                      onChange={(e) => {
                        const slabs = [...draft.slabs];
                        slabs[index] = { ...slab, minQty: Math.max(1, Number(e.target.value) || 1) };
                        patchDraft({ slabs });
                      }}
                      className={inputClass}
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      min={0}
                      value={slab.maxQty ?? ""}
                      onChange={(e) => {
                        const slabs = [...draft.slabs];
                        slabs[index] = {
                          ...slab,
                          maxQty: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                        };
                        patchDraft({ slabs });
                      }}
                      className={inputClass}
                      placeholder="Max (blank=∞)"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={slab.discountPercent}
                      onChange={(e) => {
                        const slabs = [...draft.slabs];
                        slabs[index] = {
                          ...slab,
                          discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                        };
                        patchDraft({ slabs });
                      }}
                      className={inputClass}
                      placeholder="%"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchDraft({ slabs: draft.slabs.filter((_, i) => i !== index) })
                      }
                      className="rounded-lg border border-border px-2 text-text-muted hover:text-accent-red"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patchDraft({
                      slabs: [
                        ...draft.slabs,
                        { minQty: 1, maxQty: null, discountPercent: 5 },
                      ],
                    })
                  }
                  className="text-sm text-accent-blue"
                >
                  + Add slab
                </button>
              </div>
            )}

            {draft.offerType === "BILL_VALUE" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Min bill value</label>
                  <CurrencyInput
                    value={draft.minBillValue}
                    onChange={(minBillValue) => patchDraft({ minBillValue })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reward type</label>
                  <select
                    value={draft.rewardType}
                    onChange={(e) =>
                      patchDraft({
                        rewardType: e.target.value as ProductOffer["rewardType"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="PERCENT">% off bill</option>
                    <option value="FLAT">Flat off bill</option>
                    <option value="GIFT">Free gift</option>
                  </select>
                </div>
                {draft.rewardType !== "GIFT" ? (
                  <div>
                    <label className={labelClass}>
                      {draft.rewardType === "PERCENT" ? "Discount %" : "Amount off"}
                    </label>
                    {draft.rewardType === "PERCENT" ? (
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={draft.discountValue || ""}
                        onChange={(e) =>
                          patchDraft({
                            discountValue: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                        className={inputClass}
                      />
                    ) : (
                      <CurrencyInput
                        value={draft.discountValue}
                        onChange={(discountValue) => patchDraft({ discountValue })}
                      />
                    )}
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Gift item</label>
                    <OfferProductSelect
                      id="offer-bill-gift"
                      value={draft.giftProductName}
                      rateMasters={currentRates}
                      products={products}
                      onSelect={(pick) => {
                        if (pick.source === "product") applyRewardProduct(pick.product, true);
                        else {
                          const entry = pick.rateMaster;
                          patchDraft({
                            giftProductName: entry.productName,
                            giftSku: entry.sku,
                            giftCategory: entry.category,
                            giftUnit: entry.units[entry.units.length - 1]?.name ?? "",
                            giftQty: 1,
                          });
                        }
                      }}
                      onChangeName={(name) => patchDraft({ giftProductName: name })}
                      required={false}
                    />
                  </div>
                )}
              </div>
            )}

            {draft.offerType === "FREE_GIFT" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Gift item</label>
                  <OfferProductSelect
                    id="offer-gift-item"
                    value={draft.giftProductName}
                    rateMasters={currentRates}
                    products={products}
                    onSelect={(pick) => {
                      if (pick.source === "product") applyRewardProduct(pick.product, true);
                      else {
                        const entry = pick.rateMaster;
                        patchDraft({
                          giftProductName: entry.productName,
                          giftSku: entry.sku,
                          giftCategory: entry.category,
                          giftUnit: entry.units[entry.units.length - 1]?.name ?? "",
                        });
                      }
                    }}
                    onChangeName={(name) => patchDraft({ giftProductName: name })}
                    required={false}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Gift qty</label>
                    <input
                      type="number"
                      min={1}
                      value={draft.giftQty}
                      onChange={(e) =>
                        patchDraft({ giftQty: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Min bill (optional)</label>
                    <CurrencyInput
                      value={draft.minBillValue}
                      onChange={(minBillValue) => patchDraft({ minBillValue })}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={draft.deductStock}
                    onChange={(e) => patchDraft({ deductStock: e.target.checked })}
                  />
                  Deduct gift from stock
                </label>
              </div>
            )}

            {draft.offerType === "EVENT" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Event name</label>
                  <input
                    value={draft.eventName}
                    onChange={(e) => patchDraft({ eventName: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. Dashain Offer"
                  />
                </div>
                <div>
                  <label className={labelClass}>Linked offer type</label>
                  <select
                    value={draft.linkedOfferType}
                    onChange={(e) =>
                      patchDraft({
                        linkedOfferType: (e.target.value || "") as OfferType | "",
                      })
                    }
                    className={inputClass}
                  >
                    <option value="">Select linked type</option>
                    {OFFER_TYPES.filter((t) => t !== "EVENT").map((type) => (
                      <option key={type} value={type}>
                        {offerTypeShort(type)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {draft.offerType === "TIME_BOUND" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Start time</label>
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => patchDraft({ startTime: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>End time</label>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => patchDraft({ endTime: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {draft.offerType === "COUPON" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Coupon code</label>
                  <input
                    value={draft.couponCode}
                    onChange={(e) => patchDraft({ couponCode: e.target.value.toUpperCase() })}
                    className={inputClass}
                    placeholder="SAVE20"
                  />
                </div>
                <div>
                  <label className={labelClass}>Min bill (optional)</label>
                  <CurrencyInput
                    value={draft.minBillValue}
                    onChange={(minBillValue) => patchDraft({ minBillValue })}
                  />
                </div>
                {renderDiscountFields()}
              </div>
            )}

            {draft.offerType === "COMBO" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Bundle price</label>
                  <CurrencyInput
                    value={draft.bundlePrice}
                    onChange={(bundlePrice) => patchDraft({ bundlePrice })}
                  />
                </div>
                <p className="text-xs text-text-muted">
                  Add the main product above, then note extra components in Notes for now (full
                  multi-component picker can be extended). Bundle applies when components match.
                </p>
                <div>
                  <label className={labelClass}>Component SKUs (comma-separated)</label>
                  <input
                    value={draft.bundleComponents.map((c) => c.sku).join(", ")}
                    onChange={(e) => {
                      const skus = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      patchDraft({
                        bundleComponents: skus.map((sku) => {
                          const product = products.find(
                            (p) => p.sku.toLowerCase() === sku.toLowerCase(),
                          );
                          return {
                            productName: product?.name ?? sku,
                            sku,
                            category: product?.category ?? "",
                            unitName: product?.baseUom ?? DEFAULT_BASE_UOM,
                            quantity: 1,
                          };
                        }),
                      });
                    }}
                    className={inputClass}
                    placeholder="SKU-1, SKU-2"
                  />
                </div>
              </div>
            )}

            {draft.offerType === "CASHBACK" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Cashback %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.cashbackPercent || ""}
                    onChange={(e) =>
                      patchDraft({
                        cashbackPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max cashback</label>
                  <CurrencyInput
                    value={draft.maxCashback}
                    onChange={(maxCashback) => patchDraft({ maxCashback })}
                  />
                </div>
              </div>
            )}

            {draft.offerType === "PAYMENT" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Payment method</label>
                  <input
                    value={draft.paymentMethod}
                    onChange={(e) => patchDraft({ paymentMethod: e.target.value })}
                    className={inputClass}
                    placeholder="UPI / Bank name"
                  />
                </div>
                {renderDiscountFields()}
              </div>
            )}

            {draft.offerType === "MEMBERSHIP" && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Customer group</label>
                  <select
                    value={draft.customerGroup}
                    onChange={(e) => patchDraft({ customerGroup: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select group</option>
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                {renderDiscountFields()}
              </div>
            )}

            {draft.offerType === "MIX_MATCH" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Required qty (N)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.mixMatchQty}
                    onChange={(e) =>
                      patchDraft({ mixMatchQty: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reward</label>
                  <select
                    value={draft.mixMatchReward}
                    onChange={(e) =>
                      patchDraft({
                        mixMatchReward: e.target.value as ProductOffer["mixMatchReward"],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="PERCENT">% off</option>
                    <option value="FIXED_PRICE">Fixed group price</option>
                    <option value="CHEAPEST_FREE">Cheapest free</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Group SKUs (comma-separated)</label>
                  <input
                    value={draft.mixMatchGroupSkus.join(", ")}
                    onChange={(e) =>
                      patchDraft({
                        mixMatchGroupSkus: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {draft.offerType === "REFERRAL" && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Referrer reward</label>
                  <CurrencyInput
                    value={draft.referrerReward}
                    onChange={(referrerReward) => patchDraft({ referrerReward })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Referee reward</label>
                  <CurrencyInput
                    value={draft.refereeReward}
                    onChange={(refereeReward) => patchDraft({ refereeReward })}
                  />
                </div>
              </div>
            )}

            {draft.offerType === "LOYALTY" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Earn rate (points per 100 Nu)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.cashbackPercent || ""}
                    onChange={(e) =>
                      patchDraft({
                        cashbackPercent: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    className={inputClass}
                    placeholder="100 = 1 point per Nu"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Default 100 means 1 point per 1.00 Nu of sale total.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Redeem value (Nu per point)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={draft.discountValue || ""}
                    onChange={(e) =>
                      patchDraft({
                        discountValue: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    className={inputClass}
                    placeholder="1"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Points balance is stored on the customer and earned/redeemed at New Sale.
                  </p>
                </div>
              </div>
            )}

            {draft.offerType === "CLEARANCE" && (
              <div>
                <label className={labelClass}>Markdown reason</label>
                <input
                  value={draft.markdownReason}
                  onChange={(e) => patchDraft({ markdownReason: e.target.value })}
                  className={inputClass}
                  placeholder="Expiry / Slow-moving / Old season"
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Notes</label>
              <input
                value={draft.notes ?? ""}
                onChange={(e) => patchDraft({ notes: e.target.value })}
                className={inputClass}
                placeholder="Optional"
              />
            </div>

            {needsMainProduct(draft.offerType) && draft.unitName && listPrice > 0 && previewPrice > 0 && (
              <p className="text-sm text-text-secondary">
                List {draft.unitName}: {formatCurrency(listPrice)}
                {" → "}
                <span className="font-semibold text-accent-green">
                  Offer {formatCurrency(previewPrice)}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <SaveButton
              label={editingId ? "Save Changes" : "Save Offer"}
              saving={saving}
              variant="primary"
              className="bg-accent-purple hover:bg-accent-purple/90"
            />
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
        {sortedOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-2xl bg-accent-purple/10 p-4 text-accent-purple">
              <Tag className="h-8 w-8" />
            </div>
            <p className="text-sm text-text-muted">
              No offers yet. Create Discount, BOGO, Slab, Bill Value, and other Offer Master types.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sortedOffers.map((offer) => {
              const status = offerStatus(offer, today);
              const rateUnit = matchRateMasterSaleUnit(
                currentRates.find(
                  (entry) =>
                    entry.sku.toLowerCase() === offer.sku.toLowerCase() ||
                    entry.productName.toLowerCase() === offer.productName.toLowerCase(),
                ),
                offer.unitName,
              );
              const catalog = products.find(
                (entry) =>
                  entry.sku.trim().toLowerCase() === offer.sku.trim().toLowerCase() ||
                  (entry.name.trim().toLowerCase() === offer.productName.trim().toLowerCase() &&
                    entry.category.trim().toLowerCase() === offer.category.trim().toLowerCase()),
              );
              const baseList = rateUnit?.sellingPrice ?? catalog?.price ?? offer.offerPrice;
              const sellPrice = resolveOfferSellingPrice(offer, baseList);
              return (
                <div
                  key={offer.id}
                  className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${
                    status === "active" ? "bg-accent-green/[0.03]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{offer.name}</p>
                      <span className="rounded-md bg-accent-purple/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-purple">
                        {offerTypeShort(offer.offerType)}
                      </span>
                      {isOfferCheckoutLive(offer) ? null : (
                        <span className="rounded-md bg-accent-orange/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-orange">
                          Saved only
                        </span>
                      )}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                      {offer.priority > 0 && (
                        <span className="text-xs text-text-muted">P{offer.priority}</span>
                      )}
                      <span className="text-xs text-text-muted">{offer.id}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {[offer.productName, offer.sku, offer.category].filter(Boolean).join(" · ") ||
                        summaryForOffer(offer)}
                    </p>
                    <p className="mt-2 text-sm text-text-primary">
                      {summaryForOffer(offer)}
                      {needsMainProduct(offer.offerType) && baseList > 0 ? (
                        <>
                          {" → "}
                          <span className="font-semibold text-accent-green">
                            {formatCurrency(sellPrice)}
                          </span>
                          <span className="text-text-muted">
                            {" "}
                            (list {formatCurrency(baseList)})
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {formatDateGB(offer.effectiveFrom)}
                      {offer.effectiveTo ? ` to ${formatDateGB(offer.effectiveTo)}` : " · open-ended"}
                      {offer.notes ? ` · ${offer.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(offer)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(offer)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-red/40 hover:bg-accent-red/10 hover:text-accent-red"
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

      <PasswordConfirmDialog
        open={deleteTarget !== null}
        title="Delete offer"
        description={
          deleteTarget
            ? `Enter your password to delete ${deleteTarget.name}.`
            : "Enter your password to continue."
        }
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
