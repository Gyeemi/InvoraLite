import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency, inputClass } from "../lib/constants";
import { formatRateMasterHierarchy } from "../lib/rateMaster";
import type { RateMaster } from "../types";

interface PurchaseItemNameSelectProps {
  value: string;
  rateMasters: RateMaster[];
  onSelectRateMaster: (entry: RateMaster) => void;
  onChangeName: (name: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
}

export function PurchaseItemNameSelect({
  value,
  rateMasters,
  onSelectRateMaster,
  onChangeName,
  placeholder = "Search Rate Master or enter new item",
  id,
  required = true,
}: PurchaseItemNameSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rateMasters;
    return rateMasters.filter(
      (entry) =>
        entry.productName.toLowerCase().includes(term) ||
        entry.sku.toLowerCase().includes(term) ||
        entry.brand.toLowerCase().includes(term) ||
        entry.category.toLowerCase().includes(term),
    );
  }, [rateMasters, query]);

  const trimmed = query.trim();
  const hasExactMatch = useMemo(
    () =>
      trimmed.length > 0 &&
      rateMasters.some((entry) => entry.productName.toLowerCase() === trimmed.toLowerCase()),
    [rateMasters, trimmed],
  );
  const showAddNew = trimmed.length > 0 && !hasExactMatch;
  const optionCount = matches.length + (showAddNew ? 1 : 0);

  function commitName(name: string) {
    const next = name.trim();
    setQuery(next);
    onChangeName(next);
    setOpen(false);
  }

  function pick(entry: RateMaster) {
    setQuery(entry.productName);
    onSelectRateMaster(entry);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      if (trimmed) {
        const exact = rateMasters.find(
          (entry) => entry.productName.toLowerCase() === trimmed.toLowerCase(),
        );
        if (exact) {
          pick(exact);
          return;
        }
        commitName(trimmed);
        return;
      }
      setOpen(false);
      setQuery(value);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  });

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, matches.length, showAddNew]);

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-option-index="${highlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

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
      if (highlightIndex === matches.length && showAddNew) {
        commitName(trimmed);
        return;
      }
      if (trimmed) {
        const exact = matches.find(
          (entry) => entry.productName.toLowerCase() === trimmed.toLowerCase(),
        );
        if (exact) {
          pick(exact);
          return;
        }
        commitName(trimmed);
        return;
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
          aria-controls={open ? `${id ?? "purchase-item"}-listbox` : undefined}
        />
      </div>

      {open && (
        <ul
          id={`${id ?? "purchase-item"}-listbox`}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((entry, index) => {
              const highlighted = index === highlightIndex;
              const selected = entry.productName.toLowerCase() === value.trim().toLowerCase();
              const unit1 = entry.units[0];
              return (
                <li key={entry.id} role="presentation">
                  <button
                    type="button"
                    data-option-index={index}
                    role="option"
                    aria-selected={highlighted || selected}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(entry)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                      highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                    }`}
                  >
                    <span
                      className={`truncate text-sm ${
                        selected ? "font-medium text-accent-blue" : "text-text-primary"
                      }`}
                    >
                      {entry.productName}
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
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">
              {rateMasters.length === 0 ? "No Rate Masters yet" : "No matching Rate Masters"}
            </li>
          )}
          {showAddNew && (
            <li className="border-t border-border/60" role="presentation">
              <button
                type="button"
                data-option-index={matches.length}
                role="option"
                aria-selected={highlightIndex === matches.length}
                onMouseEnter={() => setHighlightIndex(matches.length)}
                onClick={() => commitName(trimmed)}
                className={`flex w-full px-3 py-2 text-left text-sm text-accent-blue transition-colors ${
                  highlightIndex === matches.length ? "bg-bg-hover" : "hover:bg-bg-hover"
                }`}
              >
                Use &quot;{trimmed}&quot; as new item
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
