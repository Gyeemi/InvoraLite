import { formatUomDisplay, normalizeUomLabel, DEFAULT_BASE_UOM } from "./inventoryUom";
import { roundMoney } from "./constants";
import type { Product, PurchaseItem, RateMaster, RateMasterUnitLevel } from "../types";

export const RATE_MASTER_MIN_LEVELS = 2;
export const RATE_MASTER_MAX_LEVELS = 4;

export type RateMasterLevelCount = 2 | 3 | 4;

export const RATE_MASTER_LEVEL_ROLES: Record<
  1 | 2 | 3 | 4,
  { title: string; hint: string; example: string }
> = {
  1: {
    title: "Unit 1 — Base Purchase Unit",
    hint: "Largest unit used when buying stock",
    example: "Carton",
  },
  2: {
    title: "Unit 2 — Intermediate Selling Unit",
    hint: "Mid-level pack sold or broken from Unit 1",
    example: "Box",
  },
  3: {
    title: "Unit 3 — Smallest Selling Unit",
    hint: "Smallest standard sellable unit (or parent of Unit 4)",
    example: "Set",
  },
  4: {
    title: "Unit 4 — Sub-divisible Unit (optional)",
    hint: "Optional finer split (e.g. Half Tray between Tray and Piece)",
    example: "Piece",
  },
};

export function clampRateMasterLevelCount(count: number): RateMasterLevelCount {
  if (count >= 4) return 4;
  if (count === 2) return 2;
  return 3;
}

/** Role copy for a level, adjusted when that level is the smallest in the hierarchy. */
export function rateMasterLevelRole(
  level: 1 | 2 | 3 | 4,
  levelCount: RateMasterLevelCount,
): { title: string; hint: string; example: string } {
  if (level === 1) return RATE_MASTER_LEVEL_ROLES[1];
  if (level === levelCount) {
    return {
      title: `Unit ${level} — Smallest Selling Unit`,
      hint: "Smallest standard sellable unit",
      example: levelCount === 2 ? "Piece" : RATE_MASTER_LEVEL_ROLES[level].example,
    };
  }
  return RATE_MASTER_LEVEL_ROLES[level];
}

export function emptyRateMasterUnits(levelCount: RateMasterLevelCount = 3): RateMasterUnitLevel[] {
  const count = clampRateMasterLevelCount(levelCount);
  return Array.from({ length: count }, (_, index) => {
    const level = (index + 1) as 1 | 2 | 3 | 4;
    return {
      level,
      name: "",
      qtyPerChild: 1,
      sellingPrice: 0,
      costPrice: 0,
    };
  });
}

export function normalizeRateMasterUnit(unit: RateMasterUnitLevel): RateMasterUnitLevel {
  return {
    level: unit.level,
    name: formatUomDisplay(normalizeUomLabel(unit.name)),
    qtyPerChild: Math.max(1, Number(unit.qtyPerChild) || 1),
    sellingPrice: roundMoney(Math.max(0, Number(unit.sellingPrice) || 0)),
    costPrice: roundMoney(Math.max(0, Number(unit.costPrice) || 0)),
  };
}

export function normalizeRateMasterUnits(units: RateMasterUnitLevel[]): RateMasterUnitLevel[] {
  const sorted = [...units]
    .filter((unit) => unit.level >= 1 && unit.level <= 4)
    .sort((a, b) => a.level - b.level)
    .map(normalizeRateMasterUnit);

  if (sorted.length < RATE_MASTER_MIN_LEVELS) {
    return emptyRateMasterUnits(RATE_MASTER_MIN_LEVELS);
  }

  const capped = sorted.slice(0, RATE_MASTER_MAX_LEVELS).map((unit, index) => ({
    ...unit,
    level: (index + 1) as 1 | 2 | 3 | 4,
  }));

  const last = capped.length - 1;
  capped[last] = { ...capped[last], qtyPerChild: 1 };
  return capped;
}

/** Base (smallest) units contained in one Unit 1. */
export function baseUnitsPerPurchaseUnit(units: RateMasterUnitLevel[]): number {
  const normalized = normalizeRateMasterUnits(units);
  return normalized.slice(0, -1).reduce((product, unit) => product * unit.qtyPerChild, 1);
}

/** Human-readable chain, e.g. "1 Carton = 10 Tray = 120 Piece". */
export function formatRateMasterHierarchy(units: RateMasterUnitLevel[]): string {
  const normalized = normalizeRateMasterUnits(units);
  if (normalized.every((unit) => !unit.name.trim())) return "—";

  const parts: string[] = [];
  let running = 1;
  for (let i = 0; i < normalized.length; i += 1) {
    const unit = normalized[i];
    const label = unit.name.trim() || `Unit ${unit.level}`;
    if (i === 0) {
      parts.push(`1 ${label}`);
    } else {
      parts.push(`${running} ${label}`);
    }
    if (i < normalized.length - 1) {
      running *= unit.qtyPerChild;
    }
  }
  return parts.join(" = ");
}

export function validateRateMasterUnits(units: RateMasterUnitLevel[]): string | null {
  const sorted = [...units]
    .filter((unit) => unit.level >= 1 && unit.level <= 4)
    .sort((a, b) => a.level - b.level);

  if (sorted.length < RATE_MASTER_MIN_LEVELS || sorted.length > RATE_MASTER_MAX_LEVELS) {
    return `Unit hierarchy must have ${RATE_MASTER_MIN_LEVELS}–${RATE_MASTER_MAX_LEVELS} levels.`;
  }

  const normalized = normalizeRateMasterUnits(sorted);

  for (const unit of normalized) {
    if (!unit.name.trim()) {
      return `Enter a name for Unit ${unit.level}.`;
    }
    if (unit.level < normalized.length && unit.qtyPerChild < 1) {
      return `Unit ${unit.level} must contain at least 1 of the next unit.`;
    }
  }

  if (!normalized.some((unit) => unit.sellingPrice > 0)) {
    return "Enter a selling price for at least one unit (blank means not sold at that rate code).";
  }

  const names = normalized.map((unit) => normalizeUomLabel(unit.name));
  if (new Set(names).size !== names.length) {
    return "Each unit level must use a different unit name.";
  }

  return null;
}

export function validateRateMasterDraft(input: {
  productName: string;
  category: string;
  brand: string;
  sku: string;
  units: RateMasterUnitLevel[];
  effectiveFrom?: string;
}): string | null {
  if (!input.productName.trim()) return "Enter a product name.";
  if (!input.category.trim()) return "Select a category.";
  if (!input.sku.trim()) return "Enter a SKU / barcode.";
  if (input.effectiveFrom !== undefined && !isValidISODate(input.effectiveFrom)) {
    return "Enter a valid Effective From date.";
  }
  return validateRateMasterUnits(input.units);
}

export function summarizeRateMaster(entry: RateMaster): string {
  return formatRateMasterHierarchy(entry.units);
}

// --- Effective-date rate history (D1–D6) ---

export type RateStatus = "active" | "expired" | "scheduled";

export type RateMasterProductGroup = {
  key: string;
  productName: string;
  category: string;
  brand: string;
  sku: string;
  rates: RateMaster[];
  current: RateMaster | undefined;
};

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const date = new Date(`${value.trim()}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

export function compareISODate(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Subtract one calendar day from YYYY-MM-DD. */
export function addDaysISO(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function rateProductKey(
  entry: Pick<RateMaster, "sku" | "productName" | "category">,
): string {
  const sku = entry.sku.trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  return `name:${entry.productName.trim().toLowerCase()}::${entry.category.trim().toLowerCase()}`;
}

export function normalizeRateMasterEntry(
  entry: RateMaster & { effectiveFrom?: string; effectiveTo?: string | null; notes?: string },
): RateMaster {
  const createdDay = (entry.createdAt ?? todayISO()).slice(0, 10);
  const effectiveFrom =
    entry.effectiveFrom && isValidISODate(entry.effectiveFrom)
      ? entry.effectiveFrom
      : isValidISODate(createdDay)
        ? createdDay
        : todayISO();
  const effectiveTo =
    entry.effectiveTo && isValidISODate(entry.effectiveTo) ? entry.effectiveTo : null;

  return {
    ...entry,
    brand: entry.brand ?? "",
    sku: entry.sku ?? "",
    units: normalizeRateMasterUnits(entry.units ?? []),
    effectiveFrom,
    effectiveTo,
    notes: entry.notes?.trim() || undefined,
  };
}

export function rateCoversDate(entry: RateMaster, onDate: string): boolean {
  if (compareISODate(onDate, entry.effectiveFrom) < 0) return false;
  if (entry.effectiveTo && compareISODate(onDate, entry.effectiveTo) > 0) return false;
  return true;
}

export function rateStatus(entry: RateMaster, onDate = todayISO()): RateStatus {
  if (compareISODate(entry.effectiveFrom, onDate) > 0) return "scheduled";
  if (entry.effectiveTo && compareISODate(entry.effectiveTo, onDate) < 0) return "expired";
  return "active";
}

/** D4 — past periods (effectiveTo before today) are locked. */
export function isRateLocked(entry: RateMaster, onDate = todayISO()): boolean {
  return Boolean(entry.effectiveTo && compareISODate(entry.effectiveTo, onDate) < 0);
}

export function needsBackdateWarning(effectiveFrom: string, onDate = todayISO()): boolean {
  return compareISODate(effectiveFrom, onDate) < 0;
}

export function findActiveRateInList(
  rates: RateMaster[],
  onDate = todayISO(),
): RateMaster | undefined {
  return rates.find((entry) => rateStatus(entry, onDate) === "active");
}

export function groupRatesByProduct(
  entries: RateMaster[],
  onDate = todayISO(),
): RateMasterProductGroup[] {
  const map = new Map<string, RateMaster[]>();
  for (const entry of entries.map(normalizeRateMasterEntry)) {
    const key = rateProductKey(entry);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, rates]) => {
      const sorted = [...rates].sort((a, b) => compareISODate(b.effectiveFrom, a.effectiveFrom));
      const current =
        findActiveRateInList(sorted, onDate) ??
        sorted.find((rate) => rateStatus(rate, onDate) === "scheduled") ??
        sorted[0];
      const sample = current ?? sorted[0];
      return {
        key,
        productName: sample.productName,
        category: sample.category,
        brand: sample.brand,
        sku: sample.sku,
        rates: sorted,
        current,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

/**
 * D2 — When inserting a new period starting on `effectiveFrom`, close any prior
 * open-ended or overlapping rate for the same product to the day before.
 */
export function insertRatePeriod(
  entries: RateMaster[],
  newRate: RateMaster,
): RateMaster[] {
  const normalizedNew = normalizeRateMasterEntry({
    ...newRate,
    effectiveTo: null,
  });
  const key = rateProductKey(normalizedNew);
  const from = normalizedNew.effectiveFrom;
  const closeOn = addDaysISO(from, -1);

  const adjusted = entries.map((entry) => {
    const normalized = normalizeRateMasterEntry(entry);
    if (rateProductKey(normalized) !== key) return normalized;
    if (normalized.id === normalizedNew.id) return normalized;

    const startsBeforeOrSame = compareISODate(normalized.effectiveFrom, from) <= 0;
    const openOrOverlaps =
      !normalized.effectiveTo || compareISODate(normalized.effectiveTo, from) >= 0;

    // Same-day replacement: drop the previous period that starts on this date.
    if (
      compareISODate(normalized.effectiveFrom, from) === 0 &&
      openOrOverlaps
    ) {
      return null;
    }

    if (startsBeforeOrSame && openOrOverlaps) {
      const nextTo =
        !normalized.effectiveTo || compareISODate(normalized.effectiveTo, closeOn) > 0
          ? closeOn
          : normalized.effectiveTo;
      // If closeOn is before the rate's own start, keep as-is (invalid gap avoided by UI)
      if (compareISODate(nextTo, normalized.effectiveFrom) < 0) {
        return { ...normalized, effectiveTo: normalized.effectiveFrom };
      }
      return { ...normalized, effectiveTo: nextTo };
    }

    return normalized;
  });

  const withoutSelf = adjusted
    .filter((entry): entry is RateMaster => entry != null)
    .filter((entry) => entry.id !== normalizedNew.id);
  return [normalizedNew, ...withoutSelf];
}

export function updateRatePeriod(
  entries: RateMaster[],
  updated: RateMaster,
): RateMaster[] {
  const normalized = normalizeRateMasterEntry(updated);
  return entries.map((entry) => (entry.id === normalized.id ? normalized : normalizeRateMasterEntry(entry)));
}

export type RateMasterSaleUnit = {
  name: string;
  level: 1 | 2 | 3 | 4;
  /** Base (smallest) units contained in one of this unit. */
  conversionFactor: number;
  sellingPrice: number;
};

function alreadyDefinesHalfUnit(
  units: RateMasterSaleUnit[],
  parentName: string,
): boolean {
  const parent = normalizeUomLabel(parentName);
  return units.some((unit) => {
    const name = normalizeUomLabel(unit.name);
    return (
      name === `half ${parent}` ||
      name === `half-${parent}` ||
      name === `1/2 ${parent}` ||
      name === `½ ${parent}`
    );
  });
}

/** Sale UOM options derived from a Rate Master hierarchy (largest → smallest).
 * Units with no selling price are omitted — blank price means not sold at that rate code.
 */
export function rateMasterSaleUnits(units: RateMasterUnitLevel[]): RateMasterSaleUnit[] {
  const normalized = normalizeRateMasterUnits(units);
  const baseUnits: RateMasterSaleUnit[] = normalized
    .map((unit, index) => ({
      name: unit.name,
      level: unit.level,
      conversionFactor: normalized
        .slice(index, -1)
        .reduce((product, entry) => product * entry.qtyPerChild, 1),
      sellingPrice: unit.sellingPrice,
    }))
    .filter((unit) => unit.sellingPrice > 0);

  const withHalves: RateMasterSaleUnit[] = [];
  for (const unit of baseUnits) {
    withHalves.push(unit);
    if (
      unit.conversionFactor >= 2 &&
      unit.conversionFactor % 2 === 0 &&
      !alreadyDefinesHalfUnit(baseUnits, unit.name)
    ) {
      withHalves.push({
        name: `Half ${formatUomDisplay(unit.name)}`,
        level: unit.level,
        conversionFactor: unit.conversionFactor / 2,
        sellingPrice: roundMoney(unit.sellingPrice / 2),
      });
    }
  }
  return withHalves;
}

/** Active rate for a product on a given date (D1). */
export function findRateMasterForProduct(
  rateMasters: RateMaster[],
  product: Pick<Product, "name" | "sku" | "category">,
  onDate = todayISO(),
): RateMaster | undefined {
  const normalized = rateMasters.map(normalizeRateMasterEntry);
  const sku = product.sku?.trim().toLowerCase();

  let candidates: RateMaster[] = [];
  if (sku) {
    candidates = normalized.filter((entry) => entry.sku.trim().toLowerCase() === sku);
  }
  if (candidates.length === 0) {
    const name = product.name.trim().toLowerCase();
    const category = product.category.trim().toLowerCase();
    candidates = normalized.filter(
      (entry) =>
        entry.productName.trim().toLowerCase() === name &&
        entry.category.trim().toLowerCase() === category,
    );
    if (candidates.length === 0) {
      candidates = normalized.filter(
        (entry) => entry.productName.trim().toLowerCase() === name,
      );
    }
  }

  return (
    findActiveRateInList(candidates, onDate) ??
    candidates.find((entry) => rateCoversDate(entry, onDate))
  );
}

export function matchRateMasterSaleUnit(
  entry: RateMaster | undefined,
  uom: string,
): RateMasterSaleUnit | undefined {
  if (!entry) return undefined;
  const needle = normalizeUomLabel(uom);
  return rateMasterSaleUnits(entry.units).find(
    (unit) => normalizeUomLabel(unit.name) === needle,
  );
}

/**
 * When quantity × current unit equals an exact pack of a larger Rate Master unit,
 * return that unit with the converted quantity (e.g. 30 Piece → 1 Tray).
 */
export function resolveRateMasterSaleUnitForQuantity(
  units: RateMasterSaleUnit[],
  currentUom: string,
  quantity: number,
): { unit: RateMasterSaleUnit; quantity: number } | null {
  if (!(quantity > 0) || units.length === 0) return null;

  const currentNeedle = normalizeUomLabel(currentUom);
  const current =
    units.find((unit) => normalizeUomLabel(unit.name) === currentNeedle) ??
    units[units.length - 1];
  if (!current || !(current.conversionFactor > 0)) return null;

  const baseQty = quantity * current.conversionFactor;
  if (!(baseQty > 0)) return null;

  const candidates = units
    .filter((unit) => {
      if (!(unit.conversionFactor > 0)) return false;
      // Prefer packs at least as large as the current unit.
      if (unit.conversionFactor < current.conversionFactor) return false;
      const packs = baseQty / unit.conversionFactor;
      return Number.isFinite(packs) && packs >= 1 && Math.abs(packs - Math.round(packs)) < 1e-9;
    })
    .map((unit) => ({
      unit,
      quantity: Math.round(baseQty / unit.conversionFactor),
    }))
    .sort((a, b) => b.unit.conversionFactor - a.unit.conversionFactor);

  const best = candidates[0];
  if (!best) return null;

  const sameUnit = normalizeUomLabel(best.unit.name) === currentNeedle;
  if (sameUnit && best.quantity === quantity) return null;
  // No upgrade if we only matched the same pack size under another name.
  if (best.unit.conversionFactor === current.conversionFactor && sameUnit) return null;
  if (best.unit.conversionFactor === current.conversionFactor && !sameUnit) return null;

  return best;
}

/** True for synthesized or explicit half packs (Half Tray, Half Carton, …). */
export function isHalfSaleUnit(uom: string): boolean {
  return /^half[\s-]/i.test(normalizeUomLabel(uom));
}

/** Parent pack name from a half UOM, e.g. "Half Tray" → "Tray". */
export function parentUnitFromHalfSaleUnit(uom: string): string | null {
  const match = normalizeUomLabel(uom).match(/^half[\s-]+(.+)$/);
  return match ? formatUomDisplay(match[1]) : null;
}

export function defaultRateMasterSaleUnit(
  entry: RateMaster,
  preferredUom?: string | null,
): RateMasterSaleUnit {
  const units = rateMasterSaleUnits(entry.units).filter(
    (unit) => !normalizeUomLabel(unit.name).startsWith("half "),
  );
  if (preferredUom?.trim()) {
    const preferred = matchRateMasterSaleUnit(entry, preferredUom);
    if (preferred) return preferred;
  }
  return units[units.length - 1] ?? {
    name: DEFAULT_BASE_UOM,
    level: 3,
    conversionFactor: 1,
    sellingPrice: 0,
  };
}

export function listCurrentRateMasters(
  entries: RateMaster[],
  onDate = todayISO(),
): RateMaster[] {
  return groupRatesByProduct(entries, onDate)
    .map((group) => group.current)
    .filter((entry): entry is RateMaster => entry != null);
}

/** Unit 1 (purchase), optional mid unit, and smallest unit prices for history tables. */
export function rateHistoryPriceSummary(entry: RateMaster): {
  purchaseLabel: string;
  purchaseCost: number;
  purchasePrice: number;
  hasMid: boolean;
  midLabel: string;
  midPrice: number;
  baseLabel: string;
  basePrice: number;
} {
  const units = normalizeRateMasterUnits(entry.units);
  const purchase = units[0];
  const hasMid = units.length >= 3;
  const mid = hasMid ? units[1] : undefined;
  const base = units[units.length - 1];
  return {
    purchaseLabel: purchase?.name || "Unit 1",
    purchaseCost: purchase?.costPrice ?? 0,
    purchasePrice: purchase?.sellingPrice ?? 0,
    hasMid,
    midLabel: mid?.name || "Unit 2",
    midPrice: mid?.sellingPrice ?? 0,
    baseLabel: base?.name || `Unit ${units.length}`,
    basePrice: base?.sellingPrice ?? 0,
  };
}

/**
 * Write purchase-line cost onto the active Rate Master Unit 1 cost price
 * for matching products (by SKU / name).
 */
export function applyPurchaseCostsToRateMasters(
  rateMasters: RateMaster[],
  purchaseItems: Array<Pick<PurchaseItem, "name" | "sku" | "category" | "costPrice">>,
  onDate = todayISO(),
): RateMaster[] {
  let next = rateMasters.map(normalizeRateMasterEntry);

  for (const item of purchaseItems) {
    if (!(item.costPrice > 0)) continue;
    const active = findRateMasterForProduct(
      next,
      {
        name: item.name,
        sku: item.sku ?? "",
        category: item.category,
      },
      onDate,
    );
    if (!active) continue;

    next = next.map((entry) => {
      if (entry.id !== active.id) return entry;
      const units = normalizeRateMasterUnits(entry.units).map((unit, index) =>
        index === 0
          ? { ...unit, costPrice: roundMoney(item.costPrice) }
          : unit,
      );
      return { ...entry, units, updatedAt: new Date().toISOString() };
    });
  }

  return next;
}
