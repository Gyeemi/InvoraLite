import { BadgePercent, FileText, History, Layers, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessRestricted } from "../components/AccessRestricted";
import { OffersPanel } from "../components/OffersPanel";
import { QuotationsPanel } from "../components/QuotationsPanel";
import { CategorySelect } from "../components/CategorySelect";
import { PasswordConfirmDialog } from "../components/PasswordConfirmDialog";
import { SaveButton } from "../components/SaveButton";
import { UomSearchSelect } from "../components/UomSearchSelect";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { getProducts, getRateMasters, nextId, saveRateMasters } from "../lib/data";
import { collectKnownUoms } from "../lib/inventoryUom";
import {
  baseUnitsPerPurchaseUnit,
  clampRateMasterLevelCount,
  emptyRateMasterUnits,
  formatRateMasterHierarchy,
  groupRatesByProduct,
  insertRatePeriod,
  isRateLocked,
  needsBackdateWarning,
  rateHistoryPriceSummary,
  rateMasterLevelRole,
  rateStatus,
  todayISO,
  updateRatePeriod,
  validateRateMasterDraft,
  type RateMasterLevelCount,
  type RateMasterProductGroup,
  type RateStatus,
} from "../lib/rateMaster";
import {
  CURRENCY_SYMBOL,
  cardClass,
  formatCurrency,
  formatDateGB,
  inputClass,
  labelClass,
  roundMoney,
  tableHorizontalScrollClass,
} from "../lib/constants";
import type { RateMaster, RateMasterUnitLevel } from "../types";

const unitSegmentInputClass =
  "min-w-0 bg-transparent px-2 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted";

type HubTab = "rate-master" | "offers" | "quotations";
type RateSubTab = "rates" | "history";

function SectionTabButton({
  active,
  onClick,
  icon,
  label,
  tabId,
  panelId,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "text-accent-purple" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

type DraftForm = {
  productName: string;
  category: string;
  brand: string;
  sku: string;
  units: RateMasterUnitLevel[];
  effectiveFrom: string;
  notes: string;
};

type FormMode = "create" | "edit" | "new-period" | "view";

function emptyDraft(): DraftForm {
  return {
    productName: "",
    category: "Electronics",
    brand: "",
    sku: "",
    units: emptyRateMasterUnits(3),
    effectiveFrom: todayISO(),
    notes: "",
  };
}

function draftFromEntry(entry: RateMaster): DraftForm {
  const levelCount = clampRateMasterLevelCount(entry.units.length);
  return {
    productName: entry.productName,
    category: entry.category,
    brand: entry.brand,
    sku: entry.sku,
    units: emptyRateMasterUnits(levelCount).map((slot, index) => ({
      ...slot,
      name: entry.units[index]?.name ?? "",
      qtyPerChild: entry.units[index]?.qtyPerChild ?? 1,
      sellingPrice: entry.units[index]?.sellingPrice ?? 0,
      costPrice: entry.units[index]?.costPrice ?? 0,
    })),
    effectiveFrom: entry.effectiveFrom || todayISO(),
    notes: entry.notes ?? "",
  };
}

function statusBadgeClass(status: RateStatus): string {
  if (status === "active") return "bg-accent-green/15 text-accent-green";
  if (status === "scheduled") return "bg-accent-blue/15 text-accent-blue";
  return "bg-bg-hover text-text-muted";
}

function statusLabel(status: RateStatus): string {
  if (status === "active") return "Current";
  if (status === "scheduled") return "Scheduled";
  return "Expired";
}

export function RateMasterPage() {
  const { verifyPassword } = useAuth();
  const { canManageProducts, canDelete } = usePermissions();
  const [entries, setEntries] = useState<RateMaster[]>([]);
  const [uomOptions, setUomOptions] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RateMaster | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [backdatePending, setBackdatePending] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>("rate-master");
  const [tab, setTab] = useState<RateSubTab>("rates");

  const today = todayISO();
  const readOnly = formMode === "view";

  useEffect(() => {
    void (async () => {
      const [rateList, products] = await Promise.all([getRateMasters(), getProducts()]);
      setEntries(rateList);
      setUomOptions(
        collectKnownUoms([
          ...products.map((product) => product.baseUom),
          ...rateList.flatMap((entry) => entry.units.map((unit) => unit.name)),
        ]),
      );
    })();
  }, []);

  const productGroups = useMemo(() => groupRatesByProduct(entries, today), [entries, today]);
  const historyGroup = useMemo(
    () => productGroups.find((group) => group.key === historyKey) ?? null,
    [productGroups, historyKey],
  );
  const historyHeaderPrices = historyGroup?.rates[0]
    ? rateHistoryPriceSummary(historyGroup.rates[0])
    : null;

  const levelCount = clampRateMasterLevelCount(draft.units.length);
  const hierarchyPreview = useMemo(() => formatRateMasterHierarchy(draft.units), [draft.units]);
  const basePerPurchase = useMemo(() => baseUnitsPerPurchaseUnit(draft.units), [draft.units]);

  function openCreate() {
    setHubTab("rate-master");
    setTab("rates");
    setFormMode("create");
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
    setMessage("");
    setBackdatePending(false);
    setShowForm(true);
  }

  function openEdit(entry: RateMaster) {
    setHubTab("rate-master");
    setTab("rates");
    const locked = isRateLocked(entry, today);
    setFormMode(locked ? "view" : "edit");
    setEditingId(entry.id);
    setDraft(draftFromEntry(entry));
    setError("");
    setMessage("");
    setBackdatePending(false);
    setShowForm(true);
  }

  function openNewPeriod(group: RateMasterProductGroup) {
    setHubTab("rate-master");
    setTab("rates");
    const source = group.current ?? group.rates[0];
    if (!source) return;
    setFormMode("new-period");
    setEditingId(null);
    setDraft({
      ...draftFromEntry(source),
      effectiveFrom: todayISO(),
      notes: "",
    });
    setError("");
    setMessage("");
    setBackdatePending(false);
    setShowForm(true);
  }

  function openHistory(groupKey: string) {
    setHubTab("rate-master");
    setHistoryKey(groupKey);
    setTab("history");
    setShowForm(false);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormMode("create");
    setDraft(emptyDraft());
    setError("");
    setBackdatePending(false);
  }

  function setLevelCount(count: RateMasterLevelCount) {
    if (formMode !== "create") return;
    setDraft((prev) => {
      const next = emptyRateMasterUnits(count).map((slot, index) => ({
        ...slot,
        name: prev.units[index]?.name ?? "",
        qtyPerChild:
          index === count - 1 ? 1 : Math.max(1, prev.units[index]?.qtyPerChild ?? 1),
        sellingPrice: Math.max(0, prev.units[index]?.sellingPrice ?? 0),
        costPrice: Math.max(0, prev.units[index]?.costPrice ?? 0),
      }));
      return { ...prev, units: next };
    });
  }

  function updateUnit(level: 1 | 2 | 3 | 4, patch: Partial<RateMasterUnitLevel>) {
    if (readOnly) return;
    setDraft((prev) => ({
      ...prev,
      units: prev.units.map((unit) => {
        if (unit.level !== level) return unit;
        const next = { ...unit, ...patch };
        if (unit.level === prev.units.length) {
          next.qtyPerChild = 1;
        } else if (patch.qtyPerChild != null) {
          next.qtyPerChild = Math.max(0, Number(patch.qtyPerChild) || 0);
        }
        if (patch.sellingPrice != null) {
          next.sellingPrice = roundMoney(Math.max(0, patch.sellingPrice));
        }
        if (patch.costPrice != null) {
          next.costPrice = roundMoney(Math.max(0, patch.costPrice));
        }
        return next;
      }),
    }));
  }

  async function persist(next: RateMaster[]) {
    await saveRateMasters(next);
    setEntries(next);
    setUomOptions((current) =>
      collectKnownUoms([
        ...current,
        ...next.flatMap((entry) => entry.units.map((unit) => unit.name)),
      ]),
    );
  }

  async function commitSave() {
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const units = draft.units.map((unit, index) => ({
        ...unit,
        level: (index + 1) as 1 | 2 | 3 | 4,
        name: unit.name.trim(),
        qtyPerChild: index === draft.units.length - 1 ? 1 : Math.max(1, unit.qtyPerChild),
        sellingPrice: roundMoney(Math.max(0, unit.sellingPrice)),
        costPrice: roundMoney(Math.max(0, unit.costPrice ?? 0)),
      }));

      if (formMode === "edit" && editingId) {
        const existing = entries.find((entry) => entry.id === editingId);
        if (!existing) {
          setError("Rate record not found.");
          return;
        }
        if (isRateLocked(existing, today)) {
          setError("This rate period has ended and is locked.");
          return;
        }
        const updated: RateMaster = {
          ...existing,
          productName: draft.productName.trim(),
          category: draft.category.trim(),
          brand: draft.brand.trim(),
          sku: draft.sku.trim(),
          units,
          effectiveFrom: draft.effectiveFrom,
          notes: draft.notes.trim() || undefined,
          updatedAt: now,
        };
        await persist(updateRatePeriod(entries, updated));
        setMessage("Rate master updated.");
      } else {
        const entry: RateMaster = {
          id: nextId("RM", entries),
          productName: draft.productName.trim(),
          category: draft.category.trim(),
          brand: draft.brand.trim(),
          sku: draft.sku.trim(),
          units,
          effectiveFrom: draft.effectiveFrom,
          effectiveTo: null,
          notes: draft.notes.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };
        await persist(insertRatePeriod(entries, entry));
        setMessage(formMode === "new-period" ? "New rate period created." : "Rate master created.");
      }
      closeForm();
    } finally {
      setSaving(false);
      setBackdatePending(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageProducts || readOnly) return;

    const validationError = validateRateMasterDraft({
      ...draft,
      effectiveFrom: draft.effectiveFrom,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (
      (formMode === "create" || formMode === "new-period") &&
      needsBackdateWarning(draft.effectiveFrom, today) &&
      !backdatePending
    ) {
      setBackdatePending(true);
      setError(
        `This will close the current active rate as of ${formatDateGB(draft.effectiveFrom)}. Are you sure? Click Save again to confirm.`,
      );
      return;
    }

    await commitSave();
  }

  async function handleConfirmDelete(password: string) {
    if (!deleteTarget) return false;
    if (isRateLocked(deleteTarget, today)) {
      setMessage("Expired rate periods are locked and cannot be deleted.");
      setDeleteTarget(null);
      return false;
    }
    const ok = await verifyPassword(password);
    if (!ok) return false;
    const next = entries.filter((entry) => entry.id !== deleteTarget.id);
    await persist(next);
    setDeleteTarget(null);
    setMessage(`Removed rate ${deleteTarget.id} for ${deleteTarget.productName}.`);
    return true;
  }

  if (!canManageProducts) {
    return (
      <AccessRestricted
        description={
          <>
            Only <strong>Admin</strong>, <strong>Manager</strong>, and <strong>Store Keeper</strong> can
            manage rate masters.
          </>
        }
      />
    );
  }

  const formTitle =
    formMode === "view"
      ? "View Rate (locked)"
      : formMode === "edit"
        ? "Edit Rate"
        : formMode === "new-period"
          ? "New Rate Period"
          : "New Rate Master";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Pricing</h2>
          <p className="text-sm text-text-secondary">
            Rate Master, offers, and quotations for your products
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center border-b border-border"
        role="tablist"
        aria-label="Pricing sections"
      >
        <SectionTabButton
          tabId="pricing-rate-master-tab"
          panelId="pricing-rate-master-panel"
          active={hubTab === "rate-master"}
          onClick={() => setHubTab("rate-master")}
          icon={<BadgePercent className="h-4 w-4" />}
          label="Rate Master"
        />
        <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <SectionTabButton
          tabId="pricing-offers-tab"
          panelId="pricing-offers-panel"
          active={hubTab === "offers"}
          onClick={() => {
            setHubTab("offers");
            setShowForm(false);
          }}
          icon={<Tag className="h-4 w-4" />}
          label="Offers"
        />
        <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        <SectionTabButton
          tabId="pricing-quotations-tab"
          panelId="pricing-quotations-panel"
          active={hubTab === "quotations"}
          onClick={() => {
            setHubTab("quotations");
            setShowForm(false);
          }}
          icon={<FileText className="h-4 w-4" />}
          label="Quotations"
        />
      </div>

      {hubTab === "rate-master" && (
        <div
          role="tabpanel"
          id="pricing-rate-master-panel"
          aria-labelledby="pricing-rate-master-tab"
          className="space-y-5"
        >
          <div
            className="flex flex-wrap items-center border-b border-border"
            role="tablist"
            aria-label="Rate Master sections"
          >
            <SectionTabButton
              tabId="rate-master-rates-tab"
              panelId="rate-master-rates-panel"
              active={tab === "rates"}
              onClick={() => setTab("rates")}
              icon={<BadgePercent className="h-4 w-4" />}
              label="Current Rates"
            />
            <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <SectionTabButton
              tabId="rate-master-history-tab"
              panelId="rate-master-history-panel"
              active={tab === "history"}
              onClick={() => {
                setTab("history");
                setShowForm(false);
                if (!historyKey && productGroups[0]) {
                  setHistoryKey(productGroups[0].key);
                }
              }}
              icon={<History className="h-4 w-4" />}
              label="Rate History"
            />
          </div>

      {message && tab === "rates" && (
        <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">{message}</div>
      )}

      {tab === "rates" && (
        <div
          role="tabpanel"
          id="rate-master-rates-panel"
          aria-labelledby="rate-master-rates-tab"
          className="space-y-5"
        >
      {showForm && (
        <form onSubmit={(e) => void handleSave(e)} className={`${cardClass} space-y-5 p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-text-primary">{formTitle}</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Unit 1 is the largest purchase unit; Unit {levelCount} is the smallest sellable unit.
                {readOnly ? " This period has ended and cannot be changed." : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label="Close form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}

          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Product name</label>
              <input
                value={draft.productName}
                onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
                className={inputClass}
                placeholder="Product name"
                required
                disabled={readOnly || formMode === "new-period"}
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <CategorySelect
                value={draft.category}
                onChange={(category) => setDraft({ ...draft, category })}
                disabled={readOnly || formMode === "new-period"}
              />
            </div>
            <div>
              <label className={labelClass}>SKU / Barcode</label>
              <input
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                className={inputClass}
                placeholder="SKU or barcode"
                required
                disabled={readOnly || formMode === "new-period"}
              />
            </div>
            <div>
              <label className={labelClass}>Brand</label>
              <input
                value={draft.brand}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                className={inputClass}
                placeholder="Brand (optional)"
                disabled={readOnly || formMode === "new-period"}
              />
            </div>
            <div>
              <label className={labelClass}>Effective from</label>
              <input
                type="date"
                value={draft.effectiveFrom}
                onChange={(e) => {
                  setBackdatePending(false);
                  setDraft({ ...draft, effectiveFrom: e.target.value });
                }}
                className={inputClass}
                required
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className={inputClass}
                placeholder="e.g. Seasonal drop"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg-main/40 p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-text-primary">
                <Layers className="h-4 w-4 text-accent-purple" />
                <div>
                  <h4 className="text-sm font-semibold">Unit hierarchy</h4>
                  <p className="text-xs text-text-muted">
                    Unit 1 is largest · Unit {levelCount} is smallest
                  </p>
                </div>
              </div>
              {formMode === "create" ? (
                <div
                  className="inline-flex items-center rounded-xl border border-border bg-bg-card p-1"
                  role="group"
                  aria-label="Number of unit levels"
                >
                  {([2, 3, 4] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setLevelCount(count)}
                      className={`min-w-[4.25rem] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        levelCount === count
                          ? "bg-accent-purple text-white shadow-sm"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      }`}
                    >
                      {count} levels
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="inline-flex items-center rounded-xl border border-border bg-bg-card px-3 py-1.5 text-xs font-medium text-text-secondary"
                  title="Level count is fixed after the product is created"
                >
                  {levelCount} levels
                </div>
              )}
            </div>

            <div className="mb-2 hidden grid-cols-[minmax(10rem,12rem)_minmax(0,1fr)_5rem_8.25rem_8.25rem] items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wider text-text-muted lg:grid">
              <span>Level</span>
              <span>Unit name</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Selling</span>
            </div>

            <div className="space-y-2.5">
              {draft.units.map((unit, index) => {
                const role = rateMasterLevelRole(unit.level, levelCount);
                const isSmallest = index === draft.units.length - 1;
                const childLabel = draft.units[index + 1]?.name.trim() || `Unit ${unit.level + 1}`;
                const parentLabel = unit.name.trim() || `Unit ${unit.level}`;
                const showCost = unit.level === 1;
                return (
                  <div
                    key={unit.level}
                    className="grid grid-cols-1 items-stretch gap-3 rounded-xl border border-border/70 bg-bg-card p-3 lg:grid-cols-[minmax(10rem,12rem)_minmax(0,1fr)_5rem_8.25rem_8.25rem] lg:items-center lg:gap-2 lg:py-2.5"
                  >
                    <div className="min-w-0 lg:pr-1">
                      <p className="text-sm font-medium text-text-primary">
                        Unit {unit.level}
                        <span className="ml-1.5 text-xs font-normal text-text-muted">
                          {isSmallest
                            ? "· Smallest"
                            : unit.level === 1
                              ? "· Purchase"
                              : levelCount === 4 && unit.level === 2
                                ? "· Upper Mid"
                                : levelCount === 4 && unit.level === 3
                                  ? "· Lower Mid"
                                  : "· Mid"}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted" title={role.hint}>
                        {role.hint}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>Unit name</label>
                      <div className="rounded-xl border border-border bg-bg-main transition-colors focus-within:border-accent-blue">
                        <UomSearchSelect
                          id={`rate-master-uom-${unit.level}`}
                          value={unit.name}
                          options={uomOptions}
                          onChange={(name) => updateUnit(unit.level, { name })}
                          placeholder={`e.g. ${role.example}`}
                          embedded
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>
                        {isSmallest ? "Qty" : `Qty of ${childLabel} in ${parentLabel}`}
                      </label>
                      {isSmallest ? (
                        <div className="flex h-[42px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-bg-main/50 text-xs text-text-muted">
                          —
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={unit.qtyPerChild > 0 ? unit.qtyPerChild : ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateUnit(unit.level, {
                              qtyPerChild: raw === "" ? 0 : Math.max(0, Number.parseInt(raw, 10) || 0),
                            });
                          }}
                          onBlur={() => {
                            if (unit.qtyPerChild < 1) {
                              updateUnit(unit.level, { qtyPerChild: 1 });
                            }
                          }}
                          className={`${inputClass} text-center tabular-nums`}
                          aria-label={`Quantity of ${childLabel} in one ${parentLabel}`}
                          required
                          disabled={readOnly}
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>Cost</label>
                      {showCost ? (
                        <div className="flex items-center rounded-xl border border-border bg-bg-main transition-colors focus-within:border-accent-blue">
                          <span className="shrink-0 border-r border-border px-2 py-2.5 text-xs font-medium text-text-muted">
                            {CURRENCY_SYMBOL}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={unit.costPrice || ""}
                            onChange={(e) =>
                              updateUnit(unit.level, {
                                costPrice: roundMoney(Number(e.target.value) || 0),
                              })
                            }
                            placeholder="0.00"
                            className={`${unitSegmentInputClass} flex-1 text-right tabular-nums`}
                            aria-label={`Cost price for ${parentLabel}`}
                            disabled={readOnly}
                          />
                        </div>
                      ) : (
                        <div className="flex h-[42px] items-center justify-end rounded-xl border border-dashed border-border/60 bg-bg-main/50 px-3 text-xs text-text-muted">
                          —
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <label className={`${labelClass} lg:sr-only`}>Selling price</label>
                      <div className="flex items-center rounded-xl border border-border bg-bg-main transition-colors focus-within:border-accent-blue">
                        <span className="shrink-0 border-r border-border px-2 py-2.5 text-xs font-medium text-text-muted">
                          {CURRENCY_SYMBOL}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={unit.sellingPrice || ""}
                          onChange={(e) =>
                            updateUnit(unit.level, {
                              sellingPrice: roundMoney(Number(e.target.value) || 0),
                            })
                          }
                          placeholder="—"
                          className={`${unitSegmentInputClass} flex-1 text-right tabular-nums`}
                          aria-label={`Selling price for ${parentLabel} (blank = not sold at this rate code)`}
                          disabled={readOnly}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-accent-purple/20 bg-accent-purple/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Hierarchy</p>
                <p className="mt-0.5 text-sm font-medium text-text-primary">{hierarchyPreview}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Base per purchase</p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  1 {draft.units[0]?.name.trim() || "Unit 1"} ={" "}
                  <span className="font-semibold text-text-primary">{basePerPurchase}</span>{" "}
                  {draft.units[draft.units.length - 1]?.name.trim() || `Unit ${levelCount}`}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Cost on Unit 1 is filled from Purchase (per {draft.units[0]?.name.trim() || "Unit 1"}) when
              you buy stock. Leave Selling blank on a unit if you do not sell at that rate code.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!readOnly && (
              <SaveButton
                label={
                  backdatePending
                    ? "Confirm & Save"
                    : formMode === "edit"
                      ? "Save Changes"
                      : formMode === "new-period"
                        ? "Save Rate Period"
                        : "Save Rate Master"
                }
                saving={saving}
                variant="primary"
                className="bg-accent-purple hover:bg-accent-purple/90"
              />
            )}
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-accent-purple px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-purple/90"
        >
          <Plus className="h-4 w-4" />
          Add Rate Master
        </button>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        {productGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-2xl bg-accent-purple/10 p-4 text-accent-purple">
              <BadgePercent className="h-8 w-8" />
            </div>
            <p className="text-sm text-text-muted">
              No rate masters yet. Add one to define carton → tray → piece with an effective date.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {productGroups.map((group) => {
              const entry = group.current;
              if (!entry) return null;
              const status = rateStatus(entry, today);
              const locked = isRateLocked(entry, today);
              return (
                <div
                  key={group.key}
                  className={`flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${
                    status === "active" ? "bg-accent-purple/[0.03]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{group.productName}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                      <span className="text-xs text-text-muted">{entry.id}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {[group.brand, group.category, group.sku].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-2 text-sm text-text-primary">
                      {formatRateMasterHierarchy(entry.units)}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {entry.units
                        .filter((unit) => (unit.sellingPrice ?? 0) > 0)
                        .map(
                          (unit) =>
                            `${unit.name || `Unit ${unit.level}`} ${formatCurrency(unit.sellingPrice ?? 0)}`,
                        )
                        .join(" · ") || "No sell rates set"}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Effective from {formatDateGB(entry.effectiveFrom)}
                      {entry.effectiveTo ? ` to ${formatDateGB(entry.effectiveTo)}` : " · open-ended"}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                      {group.rates.length > 1 ? ` · ${group.rates.length} periods` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openHistory(group.key)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-purple/40 hover:bg-accent-purple/10 hover:text-accent-purple"
                    >
                      <History className="h-3.5 w-3.5" />
                      Rate History
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewPeriod(group)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-green/40 hover:bg-accent-green/10 hover:text-accent-green"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New period
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(entry)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-blue/40 hover:bg-accent-blue/10 hover:text-accent-blue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {locked ? "View" : "Edit"}
                    </button>
                    {canDelete && !locked && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(entry)}
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
        </div>
      )}

      {tab === "history" && (
        <div
          role="tabpanel"
          id="rate-master-history-panel"
          aria-labelledby="rate-master-history-tab"
          className="space-y-4"
        >
          {productGroups.length === 0 ? (
            <div className={`${cardClass} p-12 text-center text-sm text-text-muted`}>
              No rate history yet. Add a Rate Master first.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <label className={labelClass} htmlFor="rate-history-product">
                    Product
                  </label>
                  <select
                    id="rate-history-product"
                    value={historyKey ?? ""}
                    onChange={(e) => setHistoryKey(e.target.value || null)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select a product
                    </option>
                    {productGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.productName}
                        {group.sku ? ` · ${group.sku}` : ""}
                        {group.rates.length > 1 ? ` (${group.rates.length} periods)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {historyGroup && historyHeaderPrices ? (
                <div className={`${cardClass} overflow-hidden`}>
                  <div className="border-b border-border px-5 py-4">
                    <h3 className="font-semibold text-text-primary">
                      Rate History — {historyGroup.productName}
                    </h3>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {[historyGroup.brand, historyGroup.category, historyGroup.sku]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className={tableHorizontalScrollClass}>
                    <table
                      className={`w-full text-left text-sm ${
                        historyHeaderPrices.hasMid ? "min-w-[960px]" : "min-w-[820px]"
                      }`}
                    >
                      <thead className="border-b border-border bg-bg-main/60 text-xs uppercase tracking-wider text-text-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">Rate ID</th>
                          <th className="px-4 py-3 font-medium">Effective From</th>
                          <th className="px-4 py-3 font-medium">Effective To</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">
                            {historyHeaderPrices.purchaseLabel} Cost
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {historyHeaderPrices.purchaseLabel} Price
                          </th>
                          {historyHeaderPrices.hasMid && (
                            <th className="px-4 py-3 font-medium">
                              {historyHeaderPrices.midLabel} Price
                            </th>
                          )}
                          <th className="px-4 py-3 font-medium">
                            {historyHeaderPrices.baseLabel} Price
                          </th>
                          <th className="px-4 py-3 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {[...historyGroup.rates]
                          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
                          .map((entry) => {
                            const status = rateStatus(entry, today);
                            const prices = rateHistoryPriceSummary(entry);
                            return (
                              <tr
                                key={entry.id}
                                className="cursor-pointer transition-colors hover:bg-bg-hover/40"
                                onClick={() => openEdit(entry)}
                              >
                                <td className="px-4 py-3 font-medium text-text-primary">{entry.id}</td>
                                <td className="px-4 py-3 text-text-secondary">
                                  {formatDateGB(entry.effectiveFrom)}
                                </td>
                                <td className="px-4 py-3 text-text-secondary">
                                  {entry.effectiveTo ? formatDateGB(entry.effectiveTo) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                                  >
                                    {status === "active"
                                      ? "Active"
                                      : status === "scheduled"
                                        ? "Scheduled"
                                        : "Expired"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 tabular-nums text-text-primary">
                                  {prices.purchaseCost > 0
                                    ? formatCurrency(prices.purchaseCost)
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-text-primary">
                                  {prices.purchasePrice > 0
                                    ? formatCurrency(prices.purchasePrice)
                                    : "—"}
                                </td>
                                {prices.hasMid && (
                                  <td className="px-4 py-3 tabular-nums text-text-primary">
                                    {prices.midPrice > 0 ? formatCurrency(prices.midPrice) : "—"}
                                  </td>
                                )}
                                <td className="px-4 py-3 tabular-nums text-text-primary">
                                  {prices.basePrice > 0 ? formatCurrency(prices.basePrice) : "—"}
                                </td>
                                <td className="max-w-[12rem] truncate px-4 py-3 text-text-muted">
                                  {entry.notes || "—"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className={`${cardClass} p-8 text-center text-sm text-text-muted`}>
                  Select a product to view its rate periods.
                </div>
              )}
            </>
          )}
        </div>
      )}
        </div>
      )}

      {hubTab === "offers" && (
        <div
          role="tabpanel"
          id="pricing-offers-panel"
          aria-labelledby="pricing-offers-tab"
        >
          <OffersPanel />
        </div>
      )}

      {hubTab === "quotations" && (
        <div
          role="tabpanel"
          id="pricing-quotations-panel"
          aria-labelledby="pricing-quotations-tab"
        >
          <QuotationsPanel />
        </div>
      )}

      <PasswordConfirmDialog
        open={deleteTarget !== null}
        title="Delete rate period"
        description={
          deleteTarget
            ? `Enter your password to delete ${deleteTarget.id} for ${deleteTarget.productName}.`
            : "Enter your password to continue."
        }
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
