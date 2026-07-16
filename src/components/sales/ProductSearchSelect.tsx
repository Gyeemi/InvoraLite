import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass } from "../../lib/constants";
import type { Product } from "../../types";

interface ProductSearchSelectProps {
  products: Product[];
  productId: string;
  newProductName: string | null;
  onSelectProduct: (product: Product) => void;
  onAddNewProduct: (name: string) => void;
  onClearSelection: () => void;
  placeholder?: string;
  id?: string;
}

export function ProductSearchSelect({
  products,
  productId,
  newProductName,
  onSelectProduct,
  onAddNewProduct,
  onClearSelection,
  placeholder = "Search product by name, SKU, or ID",
  id,
}: ProductSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId],
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
      return;
    }
    if (newProductName) {
      setQuery(newProductName);
      return;
    }
    setQuery("");
  }, [selected, newProductName]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(selected.name);
        else if (newProductName) setQuery(newProductName);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selected, newProductName]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.id.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term),
    );
  }, [products, query]);

  const hasExactInventoryMatch = useMemo(
    () =>
      products.some((product) => product.name.toLowerCase() === query.trim().toLowerCase()),
    [products, query],
  );

  const showAddNew = query.trim().length > 0 && !hasExactInventoryMatch;
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

  function pick(product: Product) {
    setQuery(product.name);
    onSelectProduct(product);
    setOpen(false);
  }

  function addNew(name: string) {
    setQuery(name);
    onAddNewProduct(name);
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
      if (optionCount === 0) return;
      e.preventDefault();
      const index = highlightIndex < 0 ? (showAddNew ? matches.length : 0) : highlightIndex;
      if (index < matches.length) {
        pick(matches[index]);
      } else if (showAddNew) {
        addNew(query.trim());
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      if (selected) setQuery(selected.name);
      else if (newProductName) setQuery(newProductName);
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
          className={`${inputClass} pl-10`}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? "product-search-listbox" : undefined}
        />
      </div>

      {open && (
        <ul
          id="product-search-listbox"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((product, index) => {
              const highlighted = index === highlightIndex;
              return (
              <li key={product.id} role="presentation">
                <button
                  type="button"
                  data-option-index={index}
                  role="option"
                  aria-selected={highlighted || product.id === productId}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => pick(product)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                  } ${
                    product.id === productId
                      ? "font-medium text-accent-blue"
                      : product.stock === 0
                        ? "text-text-muted"
                        : "text-text-primary"
                  }`}
                >
                  <span className="min-w-0 truncate">{product.name}</span>
                  <span
                    className={`shrink-0 text-xs ${
                      product.stock === 0 ? "text-accent-red" : "text-text-muted"
                    }`}
                  >
                    Stock: {product.stock}
                  </span>
                </button>
              </li>
            );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">
              {products.length === 0 ? "No products in inventory" : "No matching products"}
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
                Add &quot;{query.trim()}&quot; as new product
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
