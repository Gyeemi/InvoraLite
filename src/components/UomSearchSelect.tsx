import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass, phoneInnerInputClass } from "../lib/constants";
import { DEFAULT_BASE_UOM, formatUomDisplay, normalizeUomLabel } from "../lib/inventoryUom";

interface UomSearchSelectProps {
  value: string;
  options: string[];
  onChange: (uom: string) => void;
  placeholder?: string;
  id?: string;
  /** Borderless style for use inside a shared input group. */
  embedded?: boolean;
}

function displayValue(value: string): string {
  return formatUomDisplay(value);
}

function capitalizeWhileTyping(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function UomSearchSelect({
  value,
  options,
  onChange,
  placeholder = "Search unit (e.g. case)",
  id,
  embedded = false,
}: UomSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(displayValue(value));
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(displayValue(value));
  }, [value]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.toLowerCase().includes(term));
  }, [options, query]);

  const trimmedQuery = normalizeUomLabel(query);
  const hasExactMatch = useMemo(
    () => trimmedQuery.length > 0 && options.some((option) => option.toLowerCase() === trimmedQuery),
    [options, trimmedQuery],
  );

  const showAddNew = trimmedQuery.length > 0 && !hasExactMatch;
  const optionCount = matches.length + (showAddNew ? 1 : 0);
  const showClear = query.length > 0;

  function pick(uom: string) {
    const normalized = normalizeUomLabel(uom) || DEFAULT_BASE_UOM;
    setQuery(formatUomDisplay(normalized));
    onChange(normalized);
    setOpen(false);
  }

  function commitTypedOrKeep() {
    if (trimmedQuery) {
      pick(trimmedQuery);
      return;
    }
    setOpen(false);
    setQuery(displayValue(value));
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        commitTypedOrKeep();
      }
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

  function clearField() {
    setQuery("");
    onChange("");
    setOpen(true);
    setHighlightIndex(-1);
    inputRef.current?.focus();
  }

  function handleInputChange(next: string) {
    const formatted = capitalizeWhileTyping(next);
    setQuery(formatted);
    setOpen(true);
    if (formatted.trim() === "") {
      onChange("");
    }
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
        pick(trimmedQuery);
        return;
      }
      if (trimmedQuery) {
        pick(trimmedQuery);
        return;
      }
      setOpen(false);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(displayValue(value));
    }
  }

  const committedValue = displayValue(value) || DEFAULT_BASE_UOM;

  return (
    <div className={`relative ${embedded ? "min-w-0 flex-1" : ""}`} ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={
            embedded
              ? `${phoneInnerInputClass} pl-10 ${showClear ? "pr-10" : ""}`
              : `${inputClass} pl-10 ${showClear ? "pr-10" : ""}`
          }
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? `${id ?? "uom"}-listbox` : undefined}
        />
        {showClear && (
          <button
            type="button"
            onClick={clearField}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            aria-label="Clear unit"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <ul
          id={`${id ?? "uom"}-listbox`}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((option, index) => {
              const highlighted = index === highlightIndex;
              const selected = option.toLowerCase() === committedValue.toLowerCase();
              return (
                <li key={option} role="presentation">
                  <button
                    type="button"
                    data-option-index={index}
                    role="option"
                    aria-selected={highlighted || selected}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(option)}
                    className={`flex w-full px-3 py-2 text-left text-sm transition-colors ${
                      highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                    } ${selected ? "font-medium text-accent-purple" : "text-text-primary"}`}
                  >
                    {formatUomDisplay(option)}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">No matching units</li>
          )}
          {showAddNew && (
            <li className="border-t border-border/60" role="presentation">
              <button
                type="button"
                data-option-index={matches.length}
                role="option"
                aria-selected={highlightIndex === matches.length}
                onMouseEnter={() => setHighlightIndex(matches.length)}
                onClick={() => pick(trimmedQuery)}
                className={`flex w-full px-3 py-2 text-left text-sm text-accent-purple transition-colors ${
                  highlightIndex === matches.length ? "bg-bg-hover" : "hover:bg-bg-hover"
                }`}
              >
                Add &quot;{formatUomDisplay(trimmedQuery)}&quot; as new unit
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
