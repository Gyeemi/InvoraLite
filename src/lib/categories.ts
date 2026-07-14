import { DEFAULT_PRODUCT_CATEGORIES } from "./constants";
import { STORAGE_KEYS, storageGet, storageSet } from "./storage";

function parseCategories(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const names = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<string[]> {
  const stored = parseCategories(await storageGet(STORAGE_KEYS.categories));
  return stored ?? [...DEFAULT_PRODUCT_CATEGORIES];
}

export async function saveCategories(categories: string[]): Promise<void> {
  const trimmed = categories.map((c) => c.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  await storageSet(STORAGE_KEYS.categories, JSON.stringify(trimmed));
}

export async function addCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return getCategories();

  const categories = await getCategories();
  if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return categories;
  }

  const next = [...categories, trimmed];
  await saveCategories(next);
  return next;
}

export async function removeCategory(name: string): Promise<string[]> {
  const categories = await getCategories();
  const next = categories.filter((c) => c !== name);
  if (next.length === 0) return categories;

  await saveCategories(next);
  return next;
}
