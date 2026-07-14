import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getCustomers,
  getProductOffers,
  getProducts,
  getPurchases,
  getRateMasters,
  getSales,
} from "../../lib/data";
import {
  DEFAULT_PAYMENT_METHODS,
  formatPhoneLocal,
  resolveSalePaymentMode,
  type EPaymentPlatform,
  type PartialPaymentCategory,
  type PaymentCategory,
} from "../../lib/constants";
import { DEFAULT_COUNTRY_CODE } from "../../lib/countryCodes";
import { saleAmountsFromGstLines, gstLabelForLines } from "../../lib/gst";
import { collectKnownUoms } from "../../lib/inventoryUom";
import { resolveCartOffers, type CartLineInput } from "../../lib/cartOffers";
import type { Contact, Product, ProductOffer, Purchase, RateMaster, Sale } from "../../types";
import { buildSaleItems, resolveCustomerForSale, submitSale, E_PAYMENT_PLATFORMS } from "./newSaleLogic";
import {
  emptyLine,
  lineGstPercent,
  lineSubtotal,
  lineUnitPrice,
  type DraftLine,
  type LineOfferContext,
} from "./newSaleTypes";

export function useNewSaleForm(onComplete: () => void, onReceiptReady?: (sale: Sale) => void) {
  const { user, business } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [rateMasters, setRateMasters] = useState<RateMaster[]>([]);
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState<string | null>(null);
  const [newCustomerPhoneCountryCode, setNewCustomerPhoneCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [paymentCategory, setPaymentCategory] = useState<PaymentCategory>("Cash");
  const [creditPartialEnabled, setCreditPartialEnabled] = useState(false);
  const [amountPaidNow, setAmountPaidNow] = useState(0);
  const [partialPaymentCategory, setPartialPaymentCategory] = useState<PartialPaymentCategory>("Cash");
  const [ePaymentPlatform, setEPaymentPlatform] = useState<EPaymentPlatform>(E_PAYMENT_PLATFORMS[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [redeemLoyaltyPoints, setRedeemLoyaltyPoints] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const [p, c, purchaseList, rateList, offerList, saleList] = await Promise.all([
        getProducts(),
        getCustomers(),
        getPurchases(),
        getRateMasters(),
        getProductOffers(),
        getSales(),
      ]);
      setProducts(p);
      setCustomers(c);
      setPurchases(purchaseList);
      setRateMasters(rateList);
      setOffers(offerList);
      setSalesHistory(saleList);
    })();
  }, []);

  const uomOptions = useMemo(
    () =>
      collectKnownUoms([
        ...products.map((product) => product.baseUom),
        ...purchases.flatMap((purchase) => purchase.items.map((item) => item.uom)),
        ...rateMasters.flatMap((entry) => entry.units.map((unit) => unit.name)),
        ...lines.map((line) => line.uom),
      ]),
    [products, purchases, rateMasters, lines],
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  const saleCustomerName = selectedCustomer?.name ?? newCustomerName?.trim() ?? "";
  const customerType = selectedCustomer?.customerType ?? "retail";

  const isFirstPurchase = useMemo(() => {
    if (!customerId) return true;
    return !salesHistory.some(
      (sale) => sale.status === "completed" && sale.customerId === customerId,
    );
  }, [customerId, salesHistory]);

  const paymentMethodLabel = useMemo(() => {
    if (paymentCategory === "Cash") return "Cash";
    if (paymentCategory === "E-Payment") return ePaymentPlatform;
    if (paymentCategory === "Credit") {
      if (creditPartialEnabled && partialPaymentCategory === "E-Payment") return ePaymentPlatform;
      if (creditPartialEnabled) return "Cash";
      return "Credit";
    }
    return paymentCategory;
  }, [paymentCategory, ePaymentPlatform, creditPartialEnabled, partialPaymentCategory]);

  const offerCtx = useMemo<LineOfferContext>(
    () => ({
      customerGroup: customerType,
      isFirstPurchase,
      paymentMethod: paymentMethodLabel,
      couponCode,
      sales: salesHistory,
      customerId: customerId || undefined,
      manualDiscount: discountEnabled ? discountAmount : 0,
    }),
    [
      customerType,
      isFirstPurchase,
      paymentMethodLabel,
      couponCode,
      salesHistory,
      customerId,
      discountEnabled,
      discountAmount,
    ],
  );

  const lineSubtotals = useMemo(
    () => lines.map((line) => lineSubtotal(line, products, rateMasters, offers, offerCtx)),
    [lines, products, rateMasters, offers, offerCtx],
  );

  const subtotalBeforeCart = useMemo(
    () => lineSubtotals.reduce((sum, value) => sum + value, 0),
    [lineSubtotals],
  );

  const cartPreview = useMemo(() => {
    const cartLines: CartLineInput[] = lines.map((line, index) => {
      const unitPrice = lineUnitPrice(line, products, rateMasters, offers, offerCtx);
      const total = lineSubtotals[index] ?? unitPrice * line.quantity;
      return {
        productId: line.productId || "MANUAL",
        quantity: line.quantity,
        uom: line.uom,
        conversionFactor: line.conversionFactor,
        unitListPrice: unitPrice,
        unitPrice,
        total,
      };
    });
    return resolveCartOffers(cartLines, products, offers, rateMasters, {
      customerId: customerId || undefined,
      customerGroup: customerType,
      isFirstPurchase,
      paymentMethod: paymentMethodLabel,
      couponCode,
      sales: salesHistory,
      manualDiscount: discountEnabled ? discountAmount : 0,
    });
  }, [
    lines,
    products,
    rateMasters,
    offers,
    offerCtx,
    lineSubtotals,
    customerId,
    customerType,
    isFirstPurchase,
    paymentMethodLabel,
    couponCode,
    salesHistory,
    discountEnabled,
    discountAmount,
  ]);

  const giftSubtotal = useMemo(
    () => cartPreview.giftItems.reduce((sum, item) => sum + item.total, 0),
    [cartPreview.giftItems],
  );

  const overrideDelta = useMemo(() => {
    let delta = 0;
    for (const [index, override] of cartPreview.lineTotalOverrides) {
      delta += override - (lineSubtotals[index] ?? 0);
    }
    return delta;
  }, [cartPreview.lineTotalOverrides, lineSubtotals]);

  const subtotal = Math.max(0, subtotalBeforeCart + overrideDelta + giftSubtotal);

  const couponOffer = useMemo(() => {
    if (!cartPreview.cartDiscountLabel.toLowerCase().includes("coupon")) return undefined;
    return { name: cartPreview.cartDiscountLabel } as ProductOffer;
  }, [cartPreview]);

  const couponDiscount = cartPreview.cartDiscountLabel.toLowerCase().includes("coupon")
    ? cartPreview.cartDiscount
    : 0;

  const couponError = useMemo(() => {
    const code = couponCode.trim();
    if (!code) return "";
    const label = cartPreview.cartDiscountLabel.toLowerCase();
    if (cartPreview.cartDiscount > 0 && (label.includes("coupon") || label.includes("referral"))) {
      return "";
    }
    const anyCode = offers.some(
      (offer) =>
        offer.offerType === "COUPON" ||
        offer.offerType === "REFERRAL" ||
        (offer.offerType === "EVENT" &&
          (offer.linkedOfferType === "COUPON" || offer.linkedOfferType === "REFERRAL")),
    );
    if (!anyCode) return "No coupon or referral offers are configured yet.";
    return "Invalid or inactive code, or minimum bill / usage limit not met.";
  }, [couponCode, cartPreview, offers]);

  const appliedDiscount = discountEnabled
    ? Math.min(discountAmount, subtotal)
    : Math.min(cartPreview.cartDiscount, subtotal);

  const discountLabel = discountEnabled
    ? "Discount"
    : cartPreview.cartDiscountLabel || "Discount";
  const hasGst = business?.hasGst ?? false;
  const gstLines = useMemo(
    () =>
      lines.map((line, index) => {
        const override = cartPreview.lineTotalOverrides.get(index);
        return {
          lineTotal: override ?? lineSubtotal(line, products, rateMasters, offers, offerCtx),
          gstPercent: lineGstPercent(line, products),
        };
      }),
    [lines, products, rateMasters, offers, offerCtx, cartPreview.lineTotalOverrides],
  );
  const saleAmounts = useMemo(
    () => saleAmountsFromGstLines(gstLines, appliedDiscount, hasGst),
    [gstLines, appliedDiscount, hasGst],
  );
  const grandTotal = saleAmounts.total;
  const gstAmount = saleAmounts.gstAmount;
  const netSelling = saleAmounts.netSelling;
  const gstLabel = useMemo(() => (hasGst ? gstLabelForLines(gstLines) : ""), [hasGst, gstLines]);
  const creditAmountPaid =
    paymentCategory === "Credit"
      ? creditPartialEnabled
        ? Math.min(Math.max(0, amountPaidNow), grandTotal)
        : 0
      : grandTotal;
  const creditAmountDue =
    paymentCategory === "Credit" ? Math.max(0, grandTotal - creditAmountPaid) : 0;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function clearLineProduct(key: string) {
    updateLine(key, {
      productId: "",
      newProductName: null,
      newProductPrice: "",
      imei1: "",
      priceType: "retail",
    });
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  function clearCustomerSelection() {
    setCustomerId("");
    setNewCustomerName(null);
    setNewCustomerPhoneCountryCode(DEFAULT_COUNTRY_CODE);
    setNewCustomerPhone("");
    setNewCustomerAddress("");
  }

  async function reloadSaleData() {
    const [productList, customerList, purchaseList, rateList, offerList, saleList] =
      await Promise.all([
        getProducts(),
        getCustomers(),
        getPurchases(),
        getRateMasters(),
        getProductOffers(),
        getSales(),
      ]);
    setProducts(productList);
    setCustomers(customerList);
    setPurchases(purchaseList);
    setRateMasters(rateList);
    setOffers(offerList);
    setSalesHistory(saleList);
  }

  async function handleSubmit(e: React.FormEvent, printReceipt = false) {
    e.preventDefault();
    setError("");

    const items = buildSaleItems(lines, products, setError, rateMasters, offers, offerCtx);
    if (!items) return;

    const customer = await resolveCustomerForSale({
      customerId,
      setCustomerId,
      setNewCustomerName,
      setNewCustomerPhone,
      setNewCustomerAddress,
      selectedCustomer,
      newCustomerName,
      newCustomerPhone,
      newCustomerPhoneCountryCode,
      newCustomerAddress,
      setError,
    });
    if (!customer) return;
    setCustomers(await getCustomers());

    if (paymentCategory === "E-Payment" && !paymentReference.trim()) {
      setError("Enter the payment reference / transaction ID.");
      return;
    }

    if (paymentCategory === "Credit") {
      if (!customer.id || customer.name === "Walk-in") {
        setError("Select or add a customer for credit sales.");
        return;
      }
      if (creditPartialEnabled) {
        if (creditAmountPaid <= 0) {
          setError("Enter the partial payment amount received now.");
          return;
        }
        if (creditAmountPaid >= grandTotal) {
          setError(
            "Partial payment must be less than the invoice total. Use Cash or E-Payment instead.",
          );
          return;
        }
        if (partialPaymentCategory === "E-Payment" && !paymentReference.trim()) {
          setError("Enter the payment reference / transaction ID for the partial e-payment.");
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const sale = await submitSale({
        items,
        customer,
        paymentCategory,
        creditPartialEnabled,
        creditAmountPaid,
        creditAmountDue,
        partialPaymentCategory,
        ePaymentPlatform,
        paymentReference,
        discountEnabled: discountEnabled || appliedDiscount > 0,
        discountAmount: appliedDiscount,
        grandTotal,
        hasGst,
        userRole: user?.role,
        appliedOfferIds: cartPreview.appliedOfferIds,
        cashbackAmount: cartPreview.cashbackAmount,
        redeemLoyaltyPoints:
          redeemLoyaltyPoints > 0 ? Math.floor(redeemLoyaltyPoints) : undefined,
      });
      await reloadSaleData();
      if (printReceipt && business) {
        onReceiptReady?.(sale);
      } else {
        onComplete();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    products,
    customers,
    rateMasters,
    offers,
    offerCtx,
    lines,
    uomOptions,
    customerId,
    newCustomerName,
    newCustomerPhoneCountryCode,
    newCustomerPhone,
    newCustomerAddress,
    paymentCategory,
    creditPartialEnabled,
    amountPaidNow,
    partialPaymentCategory,
    ePaymentPlatform,
    paymentReference,
    discountEnabled,
    discountAmount,
    redeemLoyaltyPoints,
    couponCode,
    couponOffer,
    couponDiscount,
    couponError,
    discountLabel,
    cashbackAmount: cartPreview.cashbackAmount,
    giftItems: cartPreview.giftItems,
    error,
    submitting,
    business,
    hasGst,
    saleCustomerName,
    selectedCustomer,
    subtotal,
    appliedDiscount,
    grandTotal,
    gstAmount,
    netSelling,
    gstLabel,
    creditAmountPaid,
    creditAmountDue,
    setCustomerId,
    setNewCustomerName,
    setNewCustomerPhoneCountryCode,
    setNewCustomerPhone,
    setNewCustomerAddress,
    setPaymentCategory,
    setCreditPartialEnabled,
    setAmountPaidNow,
    setPartialPaymentCategory,
    setEPaymentPlatform,
    setPaymentReference,
    setDiscountEnabled,
    setDiscountAmount,
    setRedeemLoyaltyPoints,
    setCouponCode,
    setError,
    updateLine,
    clearLineProduct,
    addLine,
    removeLine,
    clearCustomerSelection,
    reloadSaleData,
    handleSubmit,
    formatPhoneLocal,
    resolveSalePaymentMode,
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    DEFAULT_PAYMENT_METHODS,
    E_PAYMENT_PLATFORMS,
  };
}

export type NewSaleFormState = ReturnType<typeof useNewSaleForm>;
