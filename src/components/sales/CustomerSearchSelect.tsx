import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatContactLabel, inputClass } from "../../lib/constants";
import type { Contact } from "../../types";

interface CustomerSearchSelectProps {
  customers: Contact[];
  customerId: string;
  newCustomerName: string | null;
  onSelectCustomer: (customer: Contact) => void;
  onAddNewCustomer: (name: string) => void;
  onClearSelection: () => void;
  placeholder?: string;
  id?: string;
}

export function CustomerSearchSelect({
  customers,
  customerId,
  newCustomerName,
  onSelectCustomer,
  onAddNewCustomer,
  onClearSelection,
  placeholder = "Search customer by name or phone",
  id,
}: CustomerSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customers, customerId],
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.name);
      return;
    }
    if (newCustomerName) {
      setQuery(newCustomerName);
      return;
    }
    setQuery("");
  }, [selected, newCustomerName]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(selected.name);
        else if (newCustomerName) setQuery(newCustomerName);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selected, newCustomerName]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const termDigits = term.replace(/\D/g, "");
    if (!term) return customers;
    return customers.filter((customer) => {
      const label = formatContactLabel(customer).toLowerCase();
      return (
        customer.name.toLowerCase().includes(term) ||
        customer.phone.toLowerCase().includes(term) ||
        customer.countryCode.toLowerCase().includes(term) ||
        label.includes(term) ||
        (termDigits.length > 0 && customer.phone.includes(termDigits))
      );
    });
  }, [customers, query]);

  const hasExactMatch = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return false;
    return customers.some(
      (customer) =>
        customer.name.toLowerCase() === term ||
        formatContactLabel(customer).toLowerCase() === term,
    );
  }, [customers, query]);

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

  function pick(customer: Contact) {
    setQuery(customer.name);
    onSelectCustomer(customer);
    setOpen(false);
  }

  function addNew(name: string) {
    setQuery(name);
    onAddNewCustomer(name);
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
      else if (newCustomerName) setQuery(newCustomerName);
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
          aria-controls={open ? "customer-search-listbox" : undefined}
        />
      </div>

      {open && (
        <ul
          id="customer-search-listbox"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border bg-bg-card py-1 shadow-xl shadow-black/30"
        >
          {matches.length > 0 ? (
            matches.map((customer, index) => {
              const highlighted = index === highlightIndex;
              return (
                <li key={customer.id} role="presentation">
                  <button
                    type="button"
                    data-option-index={index}
                    role="option"
                    aria-selected={highlighted || customer.id === customerId}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(customer)}
                    className={`flex w-full px-3 py-2 text-left text-sm transition-colors ${
                      highlighted ? "bg-bg-hover" : "hover:bg-bg-hover"
                    } ${
                      customer.id === customerId ? "font-medium text-accent-blue" : "text-text-primary"
                    }`}
                  >
                    <span className="min-w-0 truncate">{formatContactLabel(customer)}</span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-text-muted">
              {customers.length === 0 ? "No customers saved" : "No matching customers"}
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
                Add &quot;{query.trim()}&quot; as new customer
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
