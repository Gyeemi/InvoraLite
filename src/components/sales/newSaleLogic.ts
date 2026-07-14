import {
  getCustomers,
  getProductOffers,
  getProducts,
  getSales,
  nextId,
  saveJsonBatch,
} from "../../lib/data";
import { STORAGE_KEYS } from "../../lib/storage";
import {
  activeLoyaltyOffer,
  applyLoyaltyEarn,
  applyLoyaltyRedeem,
  clampRedeemPoints,
  computeLoyaltyEarn,
} from "../../lib/loyalty";
import {
  E_PAYMENT_PLATFORMS,
  isPhoneCategory,
  isValidImei,
  normalizeImei,
  normalizePhone,
  resolveSalePaymentMode,
  stockStatus,
  type EPaymentPlatform,
  type PartialPaymentCategory,
  type PaymentCategory,
} from "../../lib/constants";
import { DEFAULT_COUNTRY_CODE } from "../../lib/countryCodes";
import { DEFAULT_GST_RATE_PERCENT, productGstPercent, saleAmountsFromGstLines } from "../../lib/gst";
import {
  baseQtyFromSaleItem,
  DEFAULT_BASE_UOM,
  toBaseQty,
  type CustomerType,
} from "../../lib/inventoryUom";
import {
  findRateMasterForProduct,
  matchRateMasterSaleUnit,
} from "../../lib/rateMaster";
import { bogoPaidQuantity, findActiveBogoOffer } from "../../lib/productOffer";
import {
  bogoStockQuantity,
  resolveCartOffers,
  type CartLineInput,
} from "../../lib/cartOffers";
import type { Contact, Product, ProductOffer, Quotation, RateMaster, Sale, SaleItem, UserRole } from "../../types";
import {
  lineAppliedOffer,
  lineUnitPrice,
  normalizedDraftLine,
  type DraftLine,
  type LineOfferContext,
} from "./newSaleTypes";

export function buildSaleItems(
  lines: DraftLine[],
  products: Product[],
  setError: (message: string) => void,
  rateMasters: RateMaster[] = [],
  offers: ProductOffer[] = [],
  offerCtx: LineOfferContext = {},
): SaleItem[] | null {
  const baseStockUsage = new Map<string, number>();
  const items: SaleItem[] = [];
  const cartLines: CartLineInput[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const line = normalizedDraftLine(rawLine);
    const product = products.find((entry) => entry.id === line.productId);

    if (product) {
      const rateMaster = findRateMasterForProduct(rateMasters, product);
      const rateUnit = matchRateMasterSaleUnit(rateMaster, line.uom);
      const conversionFactor = rateUnit?.conversionFactor ?? line.conversionFactor;

      if (product.stock === 0) {
        setError(`"${product.name}" is out of stock.`);
        return null;
      }
      if (line.quantity < 1) {
        setError(`Enter a valid quantity for item ${index + 1}.`);
        return null;
      }

      const normalizedImei = normalizeImei(line.imei1);
      if (isPhoneCategory(product.category)) {
        if (!normalizedImei) {
          setError(`Enter the IMEI for "${product.name}" (item ${index + 1}).`);
          return null;
        }
        if (!isValidImei(normalizedImei)) {
          setError(`IMEI for "${product.name}" must be 15 digits.`);
          return null;
        }
      }

      const bogo = findActiveBogoOffer(
        offers,
        product,
        line.uom,
        undefined,
        offerCtx.sales,
        offerCtx.customerId,
      );
      const applied = lineAppliedOffer(
        { ...line, conversionFactor },
        products,
        rateMasters,
        offers,
        offerCtx,
      );
      let unitPrice = lineUnitPrice(
        { ...line, conversionFactor },
        products,
        rateMasters,
        offers,
        offerCtx,
      );
      let total = unitPrice * line.quantity;
      let offerId = applied?.id;
      let offerName = applied?.name;
      let paidQty = line.quantity;

      if (bogo) {
        const listPrice = rateUnit?.sellingPrice ?? unitPrice;
        paidQty = bogoPaidQuantity(line.quantity, bogo.buyQty, bogo.freeQty);
        unitPrice = listPrice;
        total = listPrice * paidQty;
        offerId = bogo.id;
        offerName = bogo.name;
      }

      const stockQty = bogoStockQuantity(line.quantity, bogo, paidQty);
      const baseQtySold = toBaseQty(stockQty, conversionFactor);

      const used = baseStockUsage.get(product.id) ?? 0;
      if (used + baseQtySold > product.stock) {
        setError(`Insufficient stock for "${product.name}" (item ${index + 1}).`);
        return null;
      }
      baseStockUsage.set(product.id, used + baseQtySold);

      const saleItem: SaleItem = {
        productId: product.id,
        productName: product.name,
        quantity: line.quantity,
        unitPrice,
        total,
        gstPercent: productGstPercent(product),
        uom: rateUnit?.name ?? line.uom,
        conversionFactor,
        baseQtySold,
        costPerBaseAtSale: product.costPrice,
        ...(offerId ? { offerId, offerName } : {}),
        ...(normalizedImei ? { imei1: normalizedImei } : {}),
      };
      items.push(saleItem);
      cartLines.push({
        productId: product.id,
        quantity: line.quantity,
        uom: saleItem.uom ?? line.uom,
        conversionFactor,
        unitListPrice: rateUnit?.sellingPrice ?? unitPrice,
        unitPrice,
        total,
        offerId,
        offerName,
      });
      continue;
    }

    const name = line.newProductName?.trim() ?? "";
    const price = Number.parseFloat(line.newProductPrice);
    if (!name) {
      setError(`Select or add a product for item ${index + 1}.`);
      return null;
    }
    if (Number.isNaN(price) || price <= 0) {
      setError(`Enter a valid unit price for "${name}".`);
      return null;
    }
    if (line.quantity < 1) {
      setError(`Enter a valid quantity for item ${index + 1}.`);
      return null;
    }

    const manualItem: SaleItem = {
      productId: "MANUAL",
      productName: name,
      quantity: line.quantity,
      unitPrice: price,
      total: price * line.quantity,
      gstPercent: DEFAULT_GST_RATE_PERCENT,
      uom: line.uom,
      conversionFactor: line.conversionFactor,
      baseQtySold: toBaseQty(line.quantity, line.conversionFactor),
    };
    items.push(manualItem);
    cartLines.push({
      productId: "MANUAL",
      quantity: line.quantity,
      uom: line.uom,
      conversionFactor: line.conversionFactor,
      unitListPrice: price,
      unitPrice: price,
      total: manualItem.total,
    });
  }

  if (items.length === 0) {
    setError("Add at least one product to the sale.");
    return null;
  }

  const cart = resolveCartOffers(cartLines, products, offers, rateMasters, {
    customerId: offerCtx.customerId,
    customerGroup: offerCtx.customerGroup,
    isFirstPurchase: offerCtx.isFirstPurchase,
    paymentMethod: offerCtx.paymentMethod,
    couponCode: offerCtx.couponCode,
    sales: offerCtx.sales,
    manualDiscount: offerCtx.manualDiscount,
  });

  for (const [index, override] of cart.lineTotalOverrides) {
    if (items[index]) {
      items[index] = { ...items[index], total: override };
    }
  }

  for (const gift of cart.giftItems) {
    if (gift.productId === "MANUAL") continue;
    const product = products.find((p) => p.id === gift.productId);
    if (!product) {
      setError(`Gift product for offer "${gift.offerName}" is not in inventory.`);
      return null;
    }
    const baseQty = gift.baseQtySold ?? 0;
    const used = baseStockUsage.get(product.id) ?? 0;
    if (used + baseQty > product.stock) {
      setError(`Insufficient stock for gift "${product.name}".`);
      return null;
    }
    baseStockUsage.set(product.id, used + baseQty);
    items.push(gift);
  }

  // Stash cart metadata on a symbol-like property via first item is awkward —
  // callers should use resolveCartOffers separately for discount. Attach via return
  // is not possible without changing signature; useNewSaleForm resolves cart again.
  void cart;

  return items;
}

type CustomerResolution = {
  customerId: string;
  setCustomerId: (id: string) => void;
  setNewCustomerName: (name: string | null) => void;
  setNewCustomerPhone: (phone: string) => void;
  setNewCustomerAddress: (address: string) => void;
  selectedCustomer?: Contact;
  newCustomerName: string | null;
  newCustomerPhone: string;
  newCustomerPhoneCountryCode: string;
  newCustomerAddress: string;
  setError: (message: string) => void;
};

export async function resolveCustomerForSale(
  ctx: CustomerResolution,
): Promise<{ name: string; id?: string; customerType: CustomerType } | null> {
  if (ctx.selectedCustomer) {
    return {
      name: ctx.selectedCustomer.name,
      id: ctx.selectedCustomer.id,
      customerType: ctx.selectedCustomer.customerType ?? "retail",
    };
  }

  const name = ctx.newCustomerName?.trim() ?? "";
  if (!name) {
    return { name: "Walk-in", customerType: "retail" };
  }

  const phone = normalizePhone(ctx.newCustomerPhone);
  const allCustomers = await getCustomers();
  const contact: Contact = {
    id: nextId("CUS", allCustomers),
    name,
    countryCode: phone ? ctx.newCustomerPhoneCountryCode : "",
    phone,
    email: "",
    address: ctx.newCustomerAddress.trim(),
    customerType: "retail",
  };
  // Persist new customer inside submitSale batch when possible; here we still need the id.
  await saveJsonBatch([
    { key: STORAGE_KEYS.customers, value: [contact, ...allCustomers] },
  ]);
  ctx.setCustomerId(contact.id);
  ctx.setNewCustomerName(null);
  ctx.setNewCustomerPhone("");
  ctx.setNewCustomerAddress("");
  return { name: contact.name, id: contact.id, customerType: contact.customerType ?? "retail" };
}

export type SubmitSaleInput = {
  items: SaleItem[];
  customer: { name: string; id?: string; customerType: CustomerType };
  paymentCategory: PaymentCategory;
  creditPartialEnabled: boolean;
  creditAmountPaid: number;
  creditAmountDue: number;
  partialPaymentCategory: PartialPaymentCategory;
  ePaymentPlatform: EPaymentPlatform;
  paymentReference: string;
  discountEnabled: boolean;
  discountAmount: number;
  grandTotal: number;
  hasGst: boolean;
  userRole?: UserRole;
  appliedOfferIds?: string[];
  cashbackAmount?: number;
  /** Points the cashier wants to redeem (clamped against balance and sale total). */
  redeemLoyaltyPoints?: number;
  /** When converting a quotation — mark it converted in the same transaction. */
  quotationUpdate?: {
    quotations: Quotation[];
    quotationId: string;
  };
};

export async function submitSale(input: SubmitSaleInput): Promise<Sale> {
  const {
    items,
    customer,
    paymentCategory,
    creditPartialEnabled,
    creditAmountPaid,
    creditAmountDue,
    partialPaymentCategory,
    ePaymentPlatform,
    paymentReference,
    discountAmount,
    hasGst,
    userRole,
    appliedOfferIds,
    cashbackAmount,
    redeemLoyaltyPoints,
    quotationUpdate,
  } = input;

  const computedSubtotal = items.reduce((sum, item) => sum + item.total, 0);
  let discount = Math.min(Math.max(0, discountAmount), computedSubtotal);

  const offers = await getProductOffers();
  const loyaltyOffer = activeLoyaltyOffer(offers);
  let loyaltyRedeemed = 0;
  let allCustomers = await getCustomers();
  if (customer.id && (redeemLoyaltyPoints ?? 0) > 0) {
    const balance =
      allCustomers.find((entry) => entry.id === customer.id)?.loyaltyPoints ?? 0;
    const preGstTotal = Math.max(0, computedSubtotal - discount);
    const clamped = clampRedeemPoints(
      redeemLoyaltyPoints ?? 0,
      balance,
      preGstTotal,
      loyaltyOffer,
    );
    loyaltyRedeemed = clamped.points;
    discount = Math.min(computedSubtotal, discount + clamped.discount);
  }
  const gstLines = items.map((item) => ({
    lineTotal: item.total,
    gstPercent: item.gstPercent ?? DEFAULT_GST_RATE_PERCENT,
  }));
  const amounts = saleAmountsFromGstLines(gstLines, discount, hasGst);
  const total = amounts.total;
  const gstAmount = amounts.gstAmount;

  let allProducts = await getProducts();
  const stockUsage = new Map<string, number>();
  for (const item of items) {
    if (item.productId === "MANUAL") continue;
    stockUsage.set(
      item.productId,
      (stockUsage.get(item.productId) ?? 0) + baseQtyFromSaleItem(item),
    );
  }
  allProducts = allProducts.map((product) => {
    const used = stockUsage.get(product.id);
    if (!used) return product;
    const stock = product.stock - used;
    return { ...product, stock, status: stockStatus(stock, product.lowStockThreshold) };
  });

  const firstItem = items[0];
  const allSales = await getSales();
  const partialPaymentMode =
    paymentCategory === "Credit" && creditPartialEnabled && creditAmountPaid > 0
      ? partialPaymentCategory === "Cash"
        ? "Cash"
        : ePaymentPlatform
      : undefined;
  const paymentMode = resolveSalePaymentMode(
    paymentCategory,
    ePaymentPlatform,
    paymentCategory === "Credit"
      ? {
          partialCategory: creditPartialEnabled ? partialPaymentCategory : undefined,
          amountPaid: creditAmountPaid,
        }
      : undefined,
  );

  const saleId = nextId("SAL", allSales);
  const sale: Sale = {
    id: saleId,
    saleDate: new Date().toISOString().split("T")[0],
    customerName: customer.name,
    customerId: customer.id,
    customerType: customer.customerType,
    items,
    productId: firstItem.productId,
    productName:
      items.length > 1 ? `${firstItem.productName} +${items.length - 1} more` : firstItem.productName,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    unitPrice: firstItem.unitPrice,
    subtotal: computedSubtotal,
    discountAmount: discount > 0 ? discount : undefined,
    gstAmount: gstAmount > 0 ? gstAmount : undefined,
    total,
    status: "completed",
    paymentMode,
    paymentReference:
      paymentCategory === "E-Payment" ||
      (paymentCategory === "Credit" &&
        creditPartialEnabled &&
        partialPaymentCategory === "E-Payment")
        ? paymentReference.trim()
        : undefined,
    amountPaid: paymentCategory === "Credit" ? creditAmountPaid : total,
    amountCredit: paymentCategory === "Credit" ? creditAmountDue : undefined,
    partialPaymentMode,
    createdBy: userRole ?? "Admin",
    appliedOfferIds:
      appliedOfferIds && appliedOfferIds.length > 0 ? [...new Set(appliedOfferIds)] : undefined,
    cashbackAmount: cashbackAmount && cashbackAmount > 0 ? cashbackAmount : undefined,
    quotationId: quotationUpdate?.quotationId,
  };

  const loyaltyEarned = customer.id ? computeLoyaltyEarn(total, loyaltyOffer) : 0;
  if (loyaltyEarned > 0) {
    sale.loyaltyPointsEarned = loyaltyEarned;
  }
  if (loyaltyRedeemed > 0) {
    sale.loyaltyPointsRedeemed = loyaltyRedeemed;
  }

  const batch: Array<{ key: string; value: unknown }> = [
    { key: STORAGE_KEYS.products, value: allProducts },
    { key: STORAGE_KEYS.sales, value: [sale, ...allSales] },
  ];

  if (customer.id) {
    let nextCustomers = allCustomers;
    if (loyaltyRedeemed > 0) {
      nextCustomers = applyLoyaltyRedeem(nextCustomers, customer.id, loyaltyRedeemed);
    }
    if (loyaltyEarned > 0) {
      nextCustomers = applyLoyaltyEarn(nextCustomers, customer.id, loyaltyEarned);
    }
    if (paymentCategory === "Credit" && creditAmountDue > 0) {
      nextCustomers = nextCustomers.map((entry) =>
        entry.id === customer.id
          ? { ...entry, creditBalance: (entry.creditBalance ?? 0) + creditAmountDue }
          : entry,
      );
    }
    if (nextCustomers !== allCustomers) {
      batch.push({ key: STORAGE_KEYS.customers, value: nextCustomers });
    }
  }

  if (quotationUpdate) {
    const nextQuotes = quotationUpdate.quotations.map((entry) =>
      entry.id === quotationUpdate.quotationId
        ? {
            ...entry,
            status: "converted" as const,
            convertedSaleId: saleId,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    );
    batch.push({ key: STORAGE_KEYS.quotations, value: nextQuotes });
  }

  await saveJsonBatch(batch);
  return sale;
}

export { DEFAULT_COUNTRY_CODE, DEFAULT_BASE_UOM, E_PAYMENT_PLATFORMS };
