import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { Product } from "../types";
import { getProducts, nextId, saveProducts } from "./data";
import { stockStatus } from "./constants";
import { gstOnExclusive, productGstPercent, totalWithGst } from "./gst";
import { isTauri } from "./storage";

const CSV_HEADERS = ["id", "name", "category", "sku", "price", "stock", "brand", "costPrice"] as const;
const CSV_GST_HEADERS = ["gstPercent", "gstAmount", "priceInclGst"] as const;

function escapeCsv(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

export function productsToCsv(products: Product[], includeGst = false): string {
  const headers = includeGst ? [...CSV_HEADERS, ...CSV_GST_HEADERS] : CSV_HEADERS;
  const header = headers.join(",");
  const rows = products.map((product) => {
    const base = [
      product.id,
      product.name,
      product.category,
      product.sku,
      product.price,
      product.stock,
      product.brand ?? "",
      product.costPrice ?? "",
    ];
    const gstRow = includeGst
      ? (() => {
          const rate = productGstPercent(product);
          return [rate, gstOnExclusive(product.price, rate), totalWithGst(product.price, rate)];
        })()
      : [];
    return [...base, ...gstRow].map(escapeCsv).join(",");
  });
  return [header, ...rows].join("\r\n");
}

export function parseProductsCsv(raw: string): Omit<Product, "status" | "image">[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const read = (name: string) => cols[index(name)]?.trim() ?? "";
    const price = Number.parseFloat(read("price"));
    const stock = Number.parseInt(read("stock"), 10);
    const costPriceRaw = read("costprice");
    const costPrice = costPriceRaw ? Number.parseFloat(costPriceRaw) : undefined;
    const gstPercentRaw = read("gstpercent");
    const gstPercentParsed = gstPercentRaw ? Number.parseFloat(gstPercentRaw) : undefined;
    const gstPercent =
      gstPercentParsed !== undefined && !Number.isNaN(gstPercentParsed)
        ? Math.min(100, Math.max(0, gstPercentParsed))
        : undefined;

    return {
      id: read("id"),
      name: read("name"),
      category: read("category") || "General",
      sku: read("sku"),
      price: Number.isNaN(price) ? 0 : price,
      stock: Number.isNaN(stock) ? 0 : Math.max(0, stock),
      brand: read("brand") || undefined,
      costPrice: costPrice !== undefined && !Number.isNaN(costPrice) ? costPrice : undefined,
      ...(gstPercent != null ? { gstPercent } : {}),
    };
  });
}

export async function exportProductsCsv(
  products: Product[],
  includeGst = false,
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isTauri()) {
    return { success: false, error: "CSV export is only available in the desktop app." };
  }

  const destination = await save({
    defaultPath: `invora_products_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!destination) {
    return { success: false, error: "Export cancelled." };
  }

  try {
    await invoke("write_text_file", { path: destination, contents: productsToCsv(products, includeGst) });
    return { success: true, path: destination };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not export products.",
    };
  }
}

export async function importProductsCsv(): Promise<{
  success: boolean;
  imported: number;
  error?: string;
}> {
  if (!isTauri()) {
    return { success: false, imported: 0, error: "CSV import is only available in the desktop app." };
  }

  const source = await open({
    multiple: false,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!source || Array.isArray(source)) {
    return { success: false, imported: 0, error: "Import cancelled." };
  }

  try {
    const raw = await invoke<string>("read_text_file", { path: source });
    const rows = parseProductsCsv(raw).filter((row) => row.name.trim());
    if (rows.length === 0) {
      return { success: false, imported: 0, error: "No valid product rows found in the CSV file." };
    }

    const existing = await getProducts();
    const byId = new Map(existing.map((product) => [product.id, product]));
    const bySku = new Map(existing.map((product) => [product.sku.toLowerCase(), product]));

    const next = [...existing];
    let imported = 0;

    for (const row of rows) {
      const matchById = row.id ? byId.get(row.id) : undefined;
      const matchBySku = row.sku ? bySku.get(row.sku.toLowerCase()) : undefined;
      const match = matchById ?? matchBySku;
      const stock = row.stock;
      const product: Product = {
        id: match?.id ?? (row.id || nextId("PRD", next)),
        name: row.name,
        category: row.category,
        sku: row.sku || match?.sku || `${row.name.slice(0, 3).toUpperCase()}-01`,
        price: row.price > 0 ? row.price : (match?.price ?? 0),
        stock,
        status: stockStatus(stock),
        brand: row.brand,
        costPrice: row.costPrice,
        image: match?.image,
      };

      if (match) {
        const index = next.findIndex((entry) => entry.id === match.id);
        if (index >= 0) next[index] = { ...match, ...product };
      } else {
        next.unshift(product);
        imported += 1;
      }
    }

    await saveProducts(next);
    return { success: true, imported };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : "Could not import products.",
    };
  }
}
