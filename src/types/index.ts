export type UserRole = "Admin" | "Manager" | "Store Keeper" | "Cashier" | "Viewer";

export interface User {
  name: string;
  role: UserRole;
  email: string;
  username: string;
  avatar?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  /** Argon2id password hash (PHC string). Never store plaintext. */
  password: string;
}

export interface Business {
  businessName: string;
  licenseNo: string;
  tpnNo: string;
  address: string;
  phoneCountryCode: string;
  phone: string;
  hasGst: boolean;
  gstRegistrationNo: string;
  email: string;
  /** Argon2id password hash (PHC string). Never store plaintext. */
  password: string;
  username: string;
  /** Month (1–12) when the fiscal year begins. Defaults to January (calendar year). */
  fiscalYearStartMonth?: number;
}

export type ProductStatus = "in-stock" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  /** Retail selling price per base unit (e.g. per packet/piece). */
  price: number;
  /** Wholesale selling price per alternate UOM (e.g. per case/carton). */
  wholesalePrice?: number;
  /** Base units in one wholesale UOM (matches purchase conversion factor). */
  wholesaleConversionFactor?: number;
  stock: number;
  status: ProductStatus;
  image?: string;
  brand?: string;
  costPrice?: number;
  hasSpecification?: boolean;
  specification?: string;
  /** When set, stock at or below this level triggers low-stock alerts for this product only. */
  lowStockThreshold?: number;
  /** GST rate applied to this product's selling price (exclusive). Defaults to 5% when unset. */
  gstPercent?: number;
  /** Canonical inventory unit (stock is always tracked in base units). */
  baseUom?: string;
}

export type CustomerType = "retail" | "wholesale";

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  imei1?: string;
  /** GST rate used for this line at time of sale. */
  gstPercent?: number;
  /** Unit of measure for this sale line (e.g. case, piece). */
  uom?: string;
  /** Multiplier from sale UOM to base stock units. */
  conversionFactor?: number;
  /** Quantity deducted from base stock (quantity × conversionFactor). */
  baseQtySold?: number;
  /** Snapshot of cost per base unit at sale time for COGS. */
  costPerBaseAtSale?: number;
  /** Offer Master id applied to this line (audit). */
  offerId?: string;
  offerName?: string;
}

export interface Sale {
  id: string;
  saleDate: string;
  customerName: string;
  customerId?: string;
  items: SaleItem[];
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: "completed" | "cancelled";
  paymentMode: string;
  paymentReference?: string;
  /** Amount collected at sale time (full total for Cash/E-Payment). */
  amountPaid?: number;
  /** Remaining balance owed by the customer. */
  amountCredit?: number;
  /** Cash or e-payment platform used for a partial payment on credit sales. */
  partialPaymentMode?: string;
  createdBy?: string;
  subtotal?: number;
  discountAmount?: number;
  /** GST added on selling price when business has GST enabled. */
  gstAmount?: number;
  /** Customer pricing segment used for this sale. */
  customerType?: CustomerType;
  /** Cart-level offer ids (coupon, bill-value, payment, referral, cashback, etc.). */
  appliedOfferIds?: string[];
  /** Cashback earned on this sale (to be returned later). */
  cashbackAmount?: number;
  /** Loyalty points earned on this sale. */
  loyaltyPointsEarned?: number;
  /** Loyalty points redeemed on this sale. */
  loyaltyPointsRedeemed?: number;
  /** Source quotation when converted. */
  quotationId?: string;
}

/** Why the customer returned goods. */
export type SalesReturnReason = "warranty" | "complaint" | "damage" | "other";

/** How the customer is settled for a sales return. */
export type SalesReturnSettlement = "refund" | "credit" | "replacement";

export type SalesReturnStatus = "open" | "closed" | "sent_to_supplier";

export interface SalesReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  imei1?: string;
  gstPercent?: number;
  uom?: string;
  conversionFactor?: number;
  baseQtyReturned: number;
}

/**
 * Stage 1 — customer return. Increases stock and settles the customer.
 * May later link to a Purchase Return when supplier-liable.
 */
export interface SalesReturn {
  id: string;
  saleId: string;
  returnDate: string;
  customerName: string;
  customerId?: string;
  reason: SalesReturnReason;
  settlement: SalesReturnSettlement;
  supplierLiable: boolean;
  notes?: string;
  items: SalesReturnItem[];
  subtotal: number;
  total: number;
  status: SalesReturnStatus;
  /** Set when Stage 2 purchase return is created. */
  purchaseReturnId?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseReturnItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPrice: number;
  total: number;
  imei1?: string;
  uom?: string;
  conversionFactor?: number;
  baseQtyReturned: number;
}

/**
 * Stage 2 — return goods to supplier (debit note). Decreases stock and
 * reduces supplier payable / increases advance.
 */
export interface PurchaseReturn {
  id: string;
  salesReturnId?: string;
  supplierId?: string;
  supplierName: string;
  returnDate: string;
  debitNoteNo: string;
  notes?: string;
  items: PurchaseReturnItem[];
  total: number;
  status: "completed" | "cancelled";
  createdBy: string;
  createdAt: string;
}

export interface PurchaseItem {
  name: string;
  category: string;
  brand: string;
  /** Stock-keeping unit for inventory matching / product creation. */
  sku?: string;
  /** Optional product barcode (separate from SKU). */
  barcode?: string;
  hasSpecification: boolean;
  specification: string;
  quantity: number;
  costPrice: number;
  gstPercent: number;
  /** Selling price per base unit (e.g. per packet/piece). */
  retailSellingPrice: number;
  /** Selling price per purchase UOM (e.g. per case/carton). */
  wholesaleSellingPrice: number;
  /** Purchase unit label (e.g. case, carton). */
  uom?: string;
  /** Base units received per purchase unit (base_qty = quantity × conversionFactor). */
  conversionFactor?: number;
  /** Inventory base unit when purchase UOM differs (e.g. Piece when buying Carton). */
  baseUom?: string;
}

export interface Purchase {
  id: string;
  invoiceNo: string;
  supplierId?: string;
  supplierName: string;
  purchaseDate: string;
  shippingCharge: number;
  items: PurchaseItem[];
  total: number;
  status: "pending" | "received" | "cancelled";
  createdBy: string;
  stockedToInventory: boolean;
}

export interface Contact {
  id: string;
  name: string;
  countryCode: string;
  phone: string;
  email: string;
  address: string;
  /** Opening balance recorded when the supplier was created. */
  openingBalance?: number;
  /** Credit = payable to supplier. Advance = prepaid to supplier. */
  openingBalanceType?: "credit" | "advance";
  /** Amount the contact owes (customers) or is owed to them (suppliers). */
  creditBalance?: number;
  /** Store credit owed to the customer (e.g. from sales returns on paid invoices). */
  storeCredit?: number;
  /** Loyalty points balance (earned on sales; redeemable at till). */
  loyaltyPoints?: number;
  /** Retail vs wholesale pricing on sales. */
  customerType?: CustomerType;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  paymentDate: string;
  paymentMode: string;
  paymentReference?: string;
  amount: number;
  balanceAfter: number;
  notes?: string;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  paymentMode: string;
  paymentReference?: string;
  amount: number;
  balanceAfter: number;
  notes?: string;
}

export interface Office {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface OfficeExpense {
  id: string;
  officeId?: string;
  /** When set, this expense was auto-created from a purchase shipping charge. */
  purchaseId?: string;
  category: string;
  expenseType: string;
  amount: number;
  expenseDate: string;
  notes?: string;
}

export interface OfficeAsset {
  id: string;
  officeId?: string;
  name: string;
  category: string;
  purchaseDate: string;
  amount: number;
  notes?: string;
}

/** One level in a Rate Master unit hierarchy (Unit 1 = largest). */
export interface RateMasterUnitLevel {
  level: 1 | 2 | 3 | 4;
  /** Unit label, e.g. Carton, Tray, Piece. */
  name: string;
  /**
   * How many of the next-smaller unit are contained in one of this unit.
   * For the smallest level in the hierarchy this is always 1.
   */
  qtyPerChild: number;
  /** Selling price for one of this unit. Blank / 0 = not sold at this rate code. */
  sellingPrice: number;
  /**
   * Purchase/cost price for one of this unit.
   * Primarily used on Unit 1 (base purchase unit, e.g. Carton).
   * Updated from Purchase cost when stock is bought.
   */
  costPrice?: number;
}

/**
 * Offer Master — promotional / pricing rules linked to products or cart conditions.
 * See docs/Offer_Types_Master_Reference.md for type definitions.
 */
export type OfferType =
  | "DISCOUNT"
  | "BOGO"
  | "BUY_X_GET_Y"
  | "EVENT"
  | "SLAB"
  | "BUY_X_GET_Y_DISC"
  | "FLAT_OFF"
  | "BILL_VALUE"
  | "FREE_GIFT"
  | "COMBO"
  | "LOYALTY"
  | "COUPON"
  | "CASHBACK"
  | "PAYMENT"
  | "CLEARANCE"
  | "TIME_BOUND"
  | "MEMBERSHIP"
  | "MIX_MATCH"
  | "FIRST_PURCHASE"
  | "REFERRAL";

export type OfferDiscountType = "PERCENT" | "FLAT" | "OFFER_PRICE";
export type OfferRewardType = "PERCENT" | "FLAT" | "GIFT" | "FIXED_BUNDLE";
export type OfferMasterStatus = "active" | "inactive";
export type MixMatchReward = "FIXED_PRICE" | "CHEAPEST_FREE" | "PERCENT";

export interface OfferSlab {
  minQty: number;
  /** Inclusive max; null = open-ended. */
  maxQty: number | null;
  discountPercent: number;
}

export interface OfferBundleComponent {
  productName: string;
  sku: string;
  category: string;
  unitName: string;
  quantity: number;
}

export interface ProductOffer {
  id: string;
  name: string;
  offerType: OfferType;
  /** Manual toggle; date/time windows still apply when active. */
  status: OfferMasterStatus;
  /** Higher wins when multiple offers compete (then best customer price). */
  priority: number;

  productName: string;
  category: string;
  brand: string;
  sku: string;
  unitName: string;

  buyQty: number;
  freeItemName: string;
  freeItemSku: string;
  freeItemCategory: string;
  freeItemUnit: string;
  freeQty: number;

  discountType: OfferDiscountType;
  /** Percent or flat amount depending on discountType. */
  discountValue: number;
  /** Used when discountType = OFFER_PRICE. */
  offerPrice: number;

  minBillValue: number;
  slabs: OfferSlab[];
  couponCode: string;
  paymentMethod: string;
  customerGroup: string;
  eventName: string;
  /** For EVENT wrapper — which mechanic is active in the window. */
  linkedOfferType: OfferType | "";

  effectiveFrom: string;
  effectiveTo: string | null;
  /** HH:mm local time for TIME_BOUND. */
  startTime: string;
  endTime: string;
  /** 0=Sun … 6=Sat; empty = every day. */
  daysApplicable: number[];

  usageLimit: number | null;
  perCustomerLimit: number | null;
  deductStock: boolean;

  rewardType: OfferRewardType;
  giftProductName: string;
  giftSku: string;
  giftCategory: string;
  giftUnit: string;
  giftQty: number;

  bundleComponents: OfferBundleComponent[];
  bundlePrice: number;

  cashbackPercent: number;
  maxCashback: number;

  mixMatchGroupSkus: string[];
  mixMatchQty: number;
  mixMatchReward: MixMatchReward;
  mixMatchFixedPrice: number;

  referrerReward: number;
  refereeReward: number;

  markdownReason: string;
  /** Cap for FLAT_OFF qty, etc. */
  maxQty: number | null;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "converted" | "cancelled";

export interface QuotationItem {
  productId: string;
  productName: string;
  category: string;
  sku: string;
  quantity: number;
  uom: string;
  /** Multiplier from sale UOM to base stock units. */
  conversionFactor: number;
  /** Selling price excluding GST. */
  unitPrice: number;
  gstPercent: number;
}

/**
 * Customer quotation prepared from Products (and Rate Master prices when available).
 * Can be printed and later converted to a sale.
 */
export interface Quotation {
  id: string;
  /** Company / customer name the quotation is addressed to. */
  quotationTo: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  /** ISO date YYYY-MM-DD; displayed as DD|MM|YYYY. */
  quotationDate: string;
  validUntil: string | null;
  subject?: string;
  reference?: string;
  items: QuotationItem[];
  notes?: string;
  terms?: string;
  status: QuotationStatus;
  convertedSaleId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Product rate master with a 2–4 level unit hierarchy.
 * Unit 1 = base purchase (largest); the last level = smallest selling unit.
 * Multiple rows with the same SKU (or name+category) form rate history over time.
 */
export interface RateMaster {
  id: string;
  productName: string;
  category: string;
  brand: string;
  sku: string;
  units: RateMasterUnitLevel[];
  /** Inclusive start of validity (YYYY-MM-DD). */
  effectiveFrom: string;
  /** Inclusive end of validity (YYYY-MM-DD), or null while open-ended. */
  effectiveTo: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PageId =
  | "dashboard"
  | "products"
  | "purchase"
  | "people"
  | "analytics"
  | "invoice"
  | "rate-master"
  | "settings";

export interface LicenseStatus {
  licensed: boolean;
  trial?: boolean;
  deviceId: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialUsed?: boolean;
  daysRemaining?: number;
  expiresAt?: string;
  customerName?: string;
  error?: string;
}

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  category: string;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  periodKey: string;
  reference: string;
  source: "auto" | "manual";
  description: string;
  lines: JournalLine[];
}

export interface MonthlyClose {
  periodKey: string;
  closedAt: string;
  closedBy: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  depreciation: number;
  gstOutput: number;
  gstInput: number;
  netProfit: number;
}
