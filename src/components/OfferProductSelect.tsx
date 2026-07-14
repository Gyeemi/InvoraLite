import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, inputClass } from "../lib/constants";
import { formatRateMasterHierarchy } from "../lib/rateMaster";
import type { Product, RateMaster } from "../types";

export type OfferProductPick =
  | { source: "rate-master"; rateMaster: RateMaster }
  | { source: "product"; product: Product };

type OfferProductOption =
  | { key: string; source: "rate-master"; rateMaster: RateMaster; label: string }
  | { key: string; source: "product"; product: Product; label: string };

interface OfferProductSelectProps {
  value: string;
  rateMasters: RateMaster[];
  products: Product[];
  onSelect: (pick: OfferProductPick) => void;
  onChangeName: (name: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
}

function coveredByRateMaster(product: Product, rateMasters: RateMaster[]): boolean {
  const sku = product.sku.trim().toLowerCase();
  if (sku && rateMasters.some((entry) => entry.sku.trim().toLowerCase() === sku)) {
    return true;
  }
  const name = product.name.trim().toLowerCase();
  const category = product.category.trim().toLowerCase();
  return rateMasters.some(
    (entry) =>
      entry.productName.trim().toLowerCase() === name &&
      entry.category.trim().toLowerCase() === category,
  );
}

function buildOptions(rateMasters: RateMaster[], products: Product[]): OfferProductOption[] {
  const fromRates: OfferProductOption[] = rateMasters.map((entry) => ({
    key: `rm:${entry.id}`,
    source: "rate-master",
    rateMaster: entry,
    label: entry.productName,
  }));

  const fromProducts: OfferProductOption[] = products
    .filter((product) => !coveredByRateMaster(product, rateMasters))
    .map((product) => ({
      key: `prd:${product.id}`,
      source: "product",
      product,
      label: product.name,
    }));

  return [...fromRates, ...fromProducts];
}

export function OfferProductSelect({
  value,
  rateMasters,
  products,
  onSelect,
  onChangeName,
  placeholder = "Search Rate Master or Products",
  id,
  required = true,
}: OfferProductSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const options = useMemo(
    () => buildOptions(rateMasters, products),
    [rateMasters, products],
  );

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => {
      if (option.source === "rate-master") {
        const entry = option.rateMaster;
        return (
          entry.productName.toLowerCase().includes(term) ||
          entry.sku.toLowerCase().includes(term) ||
          entry.brand.toLowerCase().includes(term) ||
          entry.category.toLowerCase().includes(term)
        );
      }
      const product = option.product;
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.id.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term) ||
        (product.brand ?? "").toLowerCase().includes(term)
      );
    });
  }, [options, query]);

  const optionCount = matches.length;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setQuery(value);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  });

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, matches.length]);

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-option-index="${highlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  function pick(option: OfferProductOption) {
    if (option.source === "rate-master") {
      setQuery(option.rateMaster.productName);
      onSelect({ source: "rate-master", rateMaster: option.rateMaster });
    } else {
      setQuery(option.product.name);
      onSelect({ source: "product", product: option.product });
    }
    setOpen(false);
  }

  function handleInputChange(next: string) {
    setQuery(next);
    onChangeName(next);
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) setOpen(true);
      if (optionCount === 0) return;
      e.preventDefault();
      setHighlightIndex((prev) => {
        if (e.key === "ArrowDown") {
          if (prev < 0) return 0;
          return (prev + 1) % optionCount;
        }
        if (prev < 0) return optionCount - 1;
        return (prev - 1 + optionCount) % optionCount;
      });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < matches.length) {
        pick(matches[highlightIndex]);
        return;
      }
      const trimmed = query.trim();
      if (trimmed) {
        const exact = matches.find(
          (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
        );
        if (exact) {
          pick(exact);
          return;
        }
      }
      setOpen(false);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className={`${inputClass} pl-10`}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? `${id ?? "offer-product"}-listbox` : undefined}
        />
      </div>

      {open && (
        <ul
          id={`${id ?? "offer-product"}-listbox`}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((option, index) => {
              const highlighted = index === highlightIndex;
              if (option.source === "rate-master") {
                const entry = option.rateMaster;
                const selected =
                  entry.productName.toLowerCase() === value.trim().toLowerCase();
                const unit1 = entry.units[0];
                return (
                  <li key={option.key} role="presentation">
                    <button
                      type="button"
                      data-option-index={index}
                      role="option"
                      aria-selected={highlighted || selected}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => pick(option)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                        highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm ${
                            selected ? "font-medium text-accent-blue" : "text-text-primary"
                          }`}
                        >
                          {entry.productName}
                        </span>
                        <span className="shrink-0 rounded-md bg-accent-purple/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-purple">
                          Rate Master
                        </span>
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {[entry.brand, entry.category, entry.sku].filter(Boolean).join(" · ")}
                      </span>
                      <span className="truncate text-xs text-text-secondary">
                        {formatRateMasterHierarchy(entry.units)}
                        {unit1?.sellingPrice
                          ? ` · ${unit1.name} ${formatCurrency(unit1.sellingPrice)}`
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              }

              const product = option.product;
              const selected = product.name.toLowerCase() === value.trim().toLowerCase();
              return (
                <li key={option.key} role="presentation">
                  <button
                    type="button"
                    data-option-index={index}
                    role="option"
                    aria-selected={highlighted || selected}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(option)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                      highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${
                          selected ? "font-medium text-accent-blue" : "text-text-primary"
                        }`}
                      >
                        {product.name}
                      </span>
                      <span className="shrink-0 rounded-md bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-blue">
                        Product
                      </span>
                    </span>
                    <span className="truncate text-xs text-text-muted">
                      {[product.id, product.brand, product.category, product.sku]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="truncate text-xs text-text-secondary">
                      {(product.baseUom || "unit").trim()} · {formatCurrency(product.price)}
                    </span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">
              {options.length === 0
                ? "No Rate Master or Products yet"
                : "No matching products"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
