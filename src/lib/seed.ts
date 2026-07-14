import type { Contact, Product, Purchase, Sale } from "../types";
import { dicebearImage } from "./constants";

export const SEED_PRODUCTS: Product[] = [
  {
    id: "PRD-001",
    name: "Coffee Bag",
    category: "Food & Beverage",
    sku: "CFB-SM-01",
    price: 10.55,
    stock: 142,
    status: "in-stock",
    image: dicebearImage("coffee"),
  },
  {
    id: "PRD-002",
    name: "Wireless Earbuds",
    category: "Electronics",
    sku: "WEB-MD-02",
    price: 89.99,
    stock: 28,
    status: "low",
    image: dicebearImage("earbuds"),
  },
  {
    id: "PRD-003",
    name: "Leather Wallet",
    category: "Accessories",
    sku: "LWL-LG-03",
    price: 45,
    stock: 0,
    status: "out",
    image: dicebearImage("wallet"),
  },
  {
    id: "PRD-004",
    name: "Smart Watch",
    category: "Electronics",
    sku: "SWT-MD-04",
    price: 199,
    stock: 67,
    status: "in-stock",
    image: dicebearImage("watch"),
  },
  {
    id: "PRD-005",
    name: "Running Shoes",
    category: "Clothing",
    sku: "RNS-LG-05",
    price: 120,
    stock: 15,
    status: "low",
    image: dicebearImage("shoes"),
  },
];

export const SEED_CUSTOMERS: Contact[] = [
  {
    id: "CUS-001",
    name: "Leslie Alexander",
    countryCode: "+975",
    phone: "17123456",
    email: "",
    address: "",
  },
];

export const SEED_SUPPLIERS: Contact[] = [
  {
    id: "SUP-001",
    name: "Himalayan Supplies Co.",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
  },
  {
    id: "SUP-002",
    name: "Bhutan Electronics Traders",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
  },
  {
    id: "SUP-003",
    name: "Thimphu General Store",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
  },
  {
    id: "SUP-004",
    name: "Paro Wholesale Mart",
    countryCode: "",
    phone: "",
    email: "",
    address: "",
  },
];

export const SEED_PURCHASES: Purchase[] = [
  {
    id: "PUR-001",
    invoiceNo: "INV-2026-0142",
    supplierId: "SUP-001",
    supplierName: "Himalayan Supplies Co.",
    purchaseDate: "2026-06-10",
    items: [
      {
        name: "Coffee Bag",
        category: "Food & Beverage",
        brand: "Himalayan Brew",
        hasSpecification: true,
        specification: "250g, Arabica blend",
        quantity: 1,
        costPrice: 8.5,
        gstPercent: 5,
        retailSellingPrice: 10.55,
        wholesaleSellingPrice: 9.5,
        uom: "case",
        conversionFactor: 12,
      },
      {
        name: "Wireless Earbuds",
        category: "Electronics",
        brand: "SoundMax",
        hasSpecification: false,
        specification: "",
        quantity: 1,
        costPrice: 65,
        gstPercent: 5,
        retailSellingPrice: 89.99,
        wholesaleSellingPrice: 80.99,
      },
    ],
    shippingCharge: 0,
    total: 77.38,
    status: "received",
    createdBy: "Admin",
    stockedToInventory: false,
  },
];

export const SEED_SALES: Sale[] = [
  {
    id: "SAL-001",
    saleDate: "2026-06-12",
    customerName: "Leslie Alexander",
    customerId: "CUS-001",
    items: [
      {
        productId: "PRD-001",
        productName: "Coffee Bag",
        quantity: 2,
        unitPrice: 10.55,
        total: 21.1,
      },
    ],
    productId: "PRD-001",
    productName: "Coffee Bag",
    quantity: 2,
    unitPrice: 10.55,
    subtotal: 21.1,
    total: 21.1,
    status: "completed",
    paymentMode: "Cash",
    amountPaid: 21.1,
    createdBy: "Admin",
  },
];
