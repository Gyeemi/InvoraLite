import { useEffect, useState } from "react";
import { COUNTRY_CODES, countryLabel, DEFAULT_COUNTRY_CODE } from "../lib/countryCodes";

interface CountryCodeSelectProps {
  value: string;
  onChange: (code: string) => void;
}

export function CountryCodeSelect({ value, onChange }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function select(code: string) {
    onChange(code);
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 min-w-[5.5rem] shrink-0 items-center bg-transparent px-3 text-sm font-medium text-text-primary outline-none transition-colors hover:text-accent-blue"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value || DEFAULT_COUNTRY_CODE}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="country-code-title"
          >
            <div className="border-b border-border/60 px-5 py-4">
              <h4 id="country-code-title" className="text-base font-semibold text-text-primary">
                Select country code
              </h4>
            </div>

            <ul className="max-h-72 overflow-y-auto">
              {COUNTRY_CODES.map((country, index) => (
                <li key={`${country.name}-${country.code}`}>
                  <button
                    type="button"
                    onClick={() => select(country.code)}
                    className={`flex w-full px-5 py-3.5 text-left text-sm font-medium transition-colors ${
                      country.code === value
                        ? "bg-accent-blue text-white"
                        : "text-text-primary hover:bg-bg-hover"
                    }`}
                  >
                    <span className="mr-2" aria-hidden="true">
                      {country.flag}
                    </span>
                    {countryLabel(country)}
                  </button>
                  {index < COUNTRY_CODES.length - 1 && (
                    <div className="mx-5 border-b border-border/50" />
                  )}
                </li>
              ))}
            </ul>

            <div className="border-t border-border/60 p-4">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-full border border-border py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
