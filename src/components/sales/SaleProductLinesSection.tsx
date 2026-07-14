import { Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "../CurrencyInput";
import { UomSearchSelect } from "../UomSearchSelect";
import {
  formatCurrency,
  inputClass,
  isPhoneCategory,
  labelClass,
  normalizeImei,
} from "../../lib/constants";
import { productGstPercent, sellingPriceWithGst } from "../../lib/gst";
import { DEFAULT_BASE_UOM, formatUomDisplay, getSaleUnitPrice } from "../../lib/inventoryUom";
import {
  defaultRateMasterSaleUnit,
  findRateMasterForProduct,
  formatRateMasterHierarchy,
  isHalfSaleUnit,
  matchRateMasterSaleUnit,
  rateMasterSaleUnits,
  resolveRateMasterSaleUnitForQuantity,
} from "../../lib/rateMaster";
import {
  findActiveOfferForSale,
  resolveOfferSellingPrice,
} from "../../lib/productOffer";
import { ProductSearchSelect } from "./ProductSearchSelect";
import {
  lineGstPercent,
  linePriceType,
  lineSubtotal,
  lineUnitPrice,
} from "./newSaleTypes";
import type { NewSaleFormState } from "./useNewSaleForm";

const compactInputClass = `${inputClass} px-2 text-center tabular-nums`;
const compactBoxClass =
  "flex h-[42px] items-center justify-center rounded-xl border border-border bg-bg-main px-2 text-sm tabular-nums text-text-secondary";

export function SaleProductLinesSection({ form }: { form: NewSaleFormState }) {
  const {
    products,
    rateMasters,
    offers,
    lines,
    uomOptions,
    hasGst,
    offerCtx,
    updateLine,
    clearLineProduct,
    addLine,
    removeLine,
  } = form;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Products ({lines.length})
      </p>

      {lines.map((line, index) => {
        const selectedProduct = products.find((product) => product.id === line.productId);
        const rateMaster = selectedProduct
          ? findRateMasterForProduct(rateMasters, selectedProduct)
          : undefined;
        const rateUnits = rateMaster ? rateMasterSaleUnits(rateMaster.units) : [];
        const rateUnit = matchRateMasterSaleUnit(rateMaster, line.uom);
        const catalogPrice = selectedProduct
          ? getSaleUnitPrice(selectedProduct, {
              conversionFactor: line.conversionFactor,
              customerType: linePriceType(line),
            })
          : 0;
        const listUnitPrice = rateUnit?.sellingPrice ?? catalogPrice;
        const activeOffer = selectedProduct
          ? findActiveOfferForSale(offers, selectedProduct, line.uom, rateMasters, {
              quantity: line.quantity,
              fallbackUnitPrice: listUnitPrice,
              customerGroup: offerCtx?.customerGroup ?? linePriceType(line),
              isFirstPurchase: offerCtx?.isFirstPurchase,
            })
          : undefined;
        const offerUnitPrice = activeOffer
          ? resolveOfferSellingPrice(activeOffer, listUnitPrice, line.quantity)
          : null;
        const lineUomOptions =
          rateUnits.length > 0 ? rateUnits.map((unit) => unit.name) : uomOptions;
        const requiresImei = selectedProduct ? isPhoneCategory(selectedProduct.category) : false;
        const unitPrice = lineUnitPrice(line, products, rateMasters, offers, offerCtx);
        const sellingPrice = lineSubtotal(line, products, rateMasters, offers, offerCtx);
        const lineGstRate = lineGstPercent(line, products);
        const lineAmounts =
          hasGst && sellingPrice > 0 ? sellingPriceWithGst(sellingPrice, lineGstRate) : null;
        const isWholesale = linePriceType(line) === "wholesale";
        const hasWholesalePrice =
          selectedProduct != null &&
          selectedProduct.wholesalePrice != null &&
          selectedProduct.wholesalePrice > 0;
        const displayTotal = lineAmounts?.total ?? sellingPrice;
        const displayUnitPrice = rateUnit
          ? unitPrice
          : lineAmounts
            ? lineAmounts.sellingPrice
            : unitPrice;
        const halfUnit = isHalfSaleUnit(line.uom);

        return (
          <div key={line.key} className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-text-primary">Item {index + 1}</p>
              <div className="flex items-center gap-3">
                {selectedProduct && !rateMaster && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs ${!isWholesale ? "font-medium text-text-primary" : "text-text-muted"}`}
                    >
                      Retail
                    </span>
                    <button
                      type="button"
                      role="switch"
                      onClick={() =>
                        updateLine(line.key, {
                          priceType: isWholesale ? "retail" : "wholesale",
                        })
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                        isWholesale ? "bg-accent-purple" : "bg-border"
                      }`}
                      aria-checked={isWholesale}
                      aria-label={`Toggle wholesale pricing for item ${index + 1}`}
                    >
                      <span
                        className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          isWholesale ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <span
                      className={`text-xs ${isWholesale ? "font-medium text-text-primary" : "text-text-muted"}`}
                    >
                      Wholesale
                    </span>
                  </div>
                )}
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-accent-red/10 hover:text-accent-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Product</label>
                <ProductSearchSelect
                  id={`productSearch-${line.key}`}
                  products={products}
                  productId={line.productId}
                  newProductName={line.newProductName}
                  onSelectProduct={(product) => {
                    const matched = findRateMasterForProduct(rateMasters, product);
                    const saleUnit = matched
                      ? defaultRateMasterSaleUnit(matched, product.baseUom)
                      : null;
                    updateLine(line.key, {
                      productId: product.id,
                      newProductName: null,
                      newProductPrice: "",
                      imei1: "",
                      priceType: "retail",
                      uom: saleUnit?.name ?? product.baseUom ?? DEFAULT_BASE_UOM,
                      conversionFactor: saleUnit?.conversionFactor ?? 1,
                    });
                  }}
                  onAddNewProduct={(name) => {
                    updateLine(line.key, {
                      productId: "",
                      newProductName: name,
                      newProductPrice: "",
                      imei1: "",
                      uom: DEFAULT_BASE_UOM,
                      conversionFactor: 1,
                    });
                  }}
                  onClearSelection={() => clearLineProduct(line.key)}
                />
                {selectedProduct && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                    <span>
                      Stock {selectedProduct.stock}
                      {line.conversionFactor !== 1 && (
                        <>
                          {" "}
                          · {Math.floor(selectedProduct.stock / line.conversionFactor)}{" "}
                          {formatUomDisplay(line.uom || DEFAULT_BASE_UOM)}
                        </>
                      )}
                    </span>
                    {hasGst && <span>· GST {productGstPercent(selectedProduct)}%</span>}
                    {isWholesale && !hasWholesalePrice && !rateMaster && (
                      <span>· Wholesale estimated</span>
                    )}
                    {rateMaster && (
                      <span className="text-accent-purple">
                        · {formatRateMasterHierarchy(rateMaster.units)}
                      </span>
                    )}
                    {activeOffer && (
                      <span className="rounded-md bg-accent-green/15 px-1.5 py-0.5 font-medium text-accent-green">
                        Offer: {activeOffer.name}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {requiresImei && (
                <div>
                  <label className={labelClass}>IMEI</label>
                  <input
                    value={line.imei1}
                    onChange={(e) =>
                      updateLine(line.key, {
                        imei1: normalizeImei(e.target.value).slice(0, 15),
                      })
                    }
                    placeholder="15-digit IMEI number"
                    inputMode="numeric"
                    maxLength={15}
                    className={inputClass}
                    required
                  />
                </div>
              )}

              {line.newProductName && (
                <div>
                  <label className={labelClass}>Unit price</label>
                  <CurrencyInput
                    value={line.newProductPrice}
                    onChange={(price) =>
                      updateLine(line.key, {
                        newProductPrice: price > 0 ? String(price) : "",
                      })
                    }
                    placeholder="Enter selling price"
                  />
                </div>
              )}

              <div className="grid grid-cols-[minmax(0,1.2fr)_4.5rem_4.5rem_minmax(10rem,1.1fr)] items-start gap-x-2.5 gap-y-2">
                <div className="min-w-0">
                  <label className={labelClass}>UOM</label>
                  <UomSearchSelect
                    id={`sale-uom-${line.key}`}
                    value={line.uom}
                    options={lineUomOptions}
                    onChange={(uom) => {
                      const matchedUnit = matchRateMasterSaleUnit(rateMaster, uom);
                      updateLine(line.key, {
                        uom,
                        conversionFactor: matchedUnit?.conversionFactor ?? (
                          rateMaster ? 1 : line.conversionFactor
                        ),
                        ...(isHalfSaleUnit(uom) && line.quantity < 1
                          ? { quantity: 1 }
                          : {}),
                      });
                    }}
                    placeholder={rateMaster ? "Select unit" : "Search unit"}
                  />
                </div>

                <div>
                  <label className={`${labelClass} text-center`}>Qty</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      halfUnit && line.quantity === 1
                        ? "½"
                        : line.quantity > 0
                          ? String(line.quantity)
                          : ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") {
                        updateLine(line.key, { quantity: 0 });
                        return;
                      }
                      if (raw === "½" || raw === "1/2" || raw === "0.5") {
                        updateLine(line.key, { quantity: 1 });
                        return;
                      }
                      const parsed = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
                      const quantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
                      if (rateUnits.length > 0 && quantity > 0) {
                        const converted = resolveRateMasterSaleUnitForQuantity(
                          rateUnits,
                          line.uom,
                          quantity,
                        );
                        if (converted) {
                          updateLine(line.key, {
                            quantity: converted.quantity,
                            uom: converted.unit.name,
                            conversionFactor: converted.unit.conversionFactor,
                          });
                          return;
                        }
                      }
                      updateLine(line.key, { quantity });
                    }}
                    onBlur={() => {
                      if (line.quantity < 1) {
                        updateLine(line.key, { quantity: 1 });
                        return;
                      }
                      if (rateUnits.length === 0) return;
                      const converted = resolveRateMasterSaleUnitForQuantity(
                        rateUnits,
                        line.uom,
                        line.quantity,
                      );
                      if (!converted) return;
                      updateLine(line.key, {
                        quantity: converted.quantity,
                        uom: converted.unit.name,
                        conversionFactor: converted.unit.conversionFactor,
                      });
                    }}
                    className={compactInputClass}
                    aria-label={halfUnit ? "Quantity (½ = one half pack)" : "Quantity"}
                    title={halfUnit ? "½ = one half pack" : undefined}
                  />
                </div>

                <div>
                  <label className={`${labelClass} text-center`}>Conv.</label>
                  {rateUnit ? (
                    <div
                      className={compactBoxClass}
                      title="Conversion factor from Rate Master"
                    >
                      {rateUnit.conversionFactor}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0.0001}
                      step="any"
                      value={line.conversionFactor > 0 ? line.conversionFactor : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateLine(line.key, {
                          conversionFactor:
                            raw === "" ? 0 : Math.max(0, Number.parseFloat(raw) || 0),
                        });
                      }}
                      onBlur={() => {
                        if (line.conversionFactor < 0.0001) {
                          updateLine(line.key, { conversionFactor: 1 });
                        }
                      }}
                      className={compactInputClass}
                      aria-label="Conversion factor"
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <label className={labelClass}>Line total</label>
                  <div className="flex min-h-[42px] flex-col justify-center rounded-xl border border-border bg-bg-main px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs text-text-muted">
                        {rateUnit
                          ? halfUnit
                            ? `½ ${formatUomDisplay(rateUnit.name.replace(/^half[\s-]+/i, ""))} @ ${formatCurrency(offerUnitPrice ?? rateUnit.sellingPrice)}`
                            : `${formatUomDisplay(rateUnit.name)} @ ${formatCurrency(offerUnitPrice ?? rateUnit.sellingPrice)}`
                          : isWholesale
                            ? "Wholesale"
                            : activeOffer
                              ? `${formatUomDisplay(line.uom)} @ ${formatCurrency(offerUnitPrice ?? unitPrice)}`
                              : "Unit price"}
                        {activeOffer &&
                        listUnitPrice > 0 &&
                        offerUnitPrice != null &&
                        offerUnitPrice < listUnitPrice
                          ? ` (was ${formatCurrency(listUnitPrice)})`
                          : ""}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                        {formatCurrency(displayUnitPrice)}
                      </span>
                    </div>
                    {lineAmounts && lineAmounts.gst > 0 && (
                      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-text-muted">
                        <span>GST ({lineAmounts.gstPercent}%)</span>
                        <span className="tabular-nums">{formatCurrency(lineAmounts.gst)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border/60 pt-1">
                      <span className="text-xs font-medium text-text-secondary">Total</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                        {formatCurrency(displayTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addLine}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-green/40 bg-accent-green/10 py-2.5 text-sm font-semibold text-accent-green transition-colors hover:bg-accent-green/15"
      >
        <Plus className="h-4 w-4" />
        Add Product
      </button>
    </div>
  );
}
