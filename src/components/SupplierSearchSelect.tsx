import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass } from "../lib/constants";
import type { Contact } from "../types";

interface SupplierSearchSelectProps {
  suppliers: Contact[];
  supplierId: string;
  newSupplierName: string | null;
  onSelectSupplier: (supplier: Contact) => void;
  onAddNewSupplier: (name: string) => void;
  onClearSelection: () => void;
  placeholder?: string;
  id?: string;
}

export function SupplierSearchSelect({
  suppliers,
  supplierId,
  newSupplierName,
  onSelectSupplier,
  onAddNewSupplier,
  onClearSelection,
  placeholder = "Search supplier by name or ID",
  id,
}: SupplierSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId),
    [suppliers, supplierId],
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
      return;
    }
    if (newSupplierName) {
      setQuery(newSupplierName);
      return;
    }
    setQuery("");
  }, [selected, newSupplierName]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(selected.name);
        else if (newSupplierName) setQuery(newSupplierName);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selected, newSupplierName]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(term) ||
        supplier.id.toLowerCase().includes(term),
    );
  }, [suppliers, query]);

  const hasExactMatch = useMemo(
    () => suppliers.some((supplier) => supplier.name.toLowerCase() === query.trim().toLowerCase()),
    [suppliers, query],
  );

  const showAddNew = query.trim().length > 0 && !hasExactMatch;
  const optionCount = matches.length + (showAddNew ? 1 : 0);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, matches.length, showAddNew]);

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-option-index="${highlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  function pick(supplier: Contact) {
    setQuery(supplier.name);
    onSelectSupplier(supplier);
    setOpen(false);
  }

  function addNew(name: string) {
    setQuery(name);
    onAddNewSupplier(name);
    setOpen(false);
  }

  function handleInputChange(next: string) {
    setQuery(next);
    onClearSelection();
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

    if (!open) return;

    if (e.key === "Enter") {
      if (highlightIndex < 0 || optionCount === 0) return;
      e.preventDefault();
      if (highlightIndex < matches.length) {
        pick(matches[highlightIndex]);
      } else if (showAddNew) {
        addNew(query.trim());
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      if (selected) setQuery(selected.name);
      else if (newSupplierName) setQuery(newSupplierName);
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
          required={!supplierId && !newSupplierName}
          className={`${inputClass} pl-10`}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? "supplier-search-listbox" : undefined}
        />
      </div>

      {open && (
        <ul
          id="supplier-search-listbox"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((supplier, index) => {
              const highlighted = index === highlightIndex;
              return (
                <li key={supplier.id} role="presentation">
                  <button
                    type="button"
                    data-option-index={index}
                    role="option"
                    aria-selected={highlighted || supplier.id === supplierId}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(supplier)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                    } ${
                      supplier.id === supplierId ? "font-medium text-accent-blue" : "text-text-primary"
                    }`}
                  >
                    <span className="min-w-0 truncate">{supplier.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">{supplier.id}</span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">
              {suppliers.length === 0 ? "No suppliers saved" : "No matching suppliers"}
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
                onClick={() => addNew(query.trim())}
                className={`flex w-full px-3 py-2 text-left text-sm text-accent-blue transition-colors ${
                  highlightIndex === matches.length ? "bg-bg-hover" : "hover:bg-bg-hover"
                }`}
              >
                Add &quot;{query.trim()}&quot; as new supplier
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
