import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { CountryCodeSelect } from "./CountryCodeSelect";
import {
  formatPhoneLocal,
  inputClass,
  labelClass,
  normalizePhone,
  phoneInnerInputClass,
  phoneInputGroupClass,
  phoneMaxLength,
  phonePlaceholder,
} from "../lib/constants";
import { DEFAULT_COUNTRY_CODE } from "../lib/countryCodes";
import type { Contact } from "../types";

interface ContactEditDialogProps {
  open: boolean;
  contact: Contact | null;
  contactLabel: string;
  onClose: () => void;
  onSave: (contact: Contact) => void | Promise<void>;
}

export function ContactEditDialog({
  open,
  contact,
  contactLabel,
  onClose,
  onSave,
}: ContactEditDialogProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !contact) return;
    setName(contact.name);
    setCountryCode(contact.countryCode || DEFAULT_COUNTRY_CODE);
    setPhone(
      contact.phone
        ? formatPhoneLocal(contact.countryCode || DEFAULT_COUNTRY_CODE, contact.phone)
        : "",
    );
    setAddress(contact.address);
    setSaving(false);
  }, [open, contact]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  if (!open || !contact) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    const current = contact;
    const trimmed = name.trim();
    if (!trimmed) return;

    const phoneDigits = normalizePhone(phone);
    setSaving(true);
    try {
      await onSave({
        ...current,
        name: trimmed,
        countryCode: phoneDigits ? countryCode : "",
        phone: phoneDigits,
        address: address.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-lg font-semibold text-text-primary">
            Edit {contactLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <fieldset disabled={saving} className="min-w-0 space-y-4 border-0 p-0">
            <div>
              <label className={labelClass}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Phone number</label>
              <div className={phoneInputGroupClass}>
                <CountryCodeSelect
                  value={countryCode}
                  onChange={(code) => {
                    setCountryCode(code);
                    setPhone(formatPhoneLocal(code, phone));
                  }}
                />
                <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneLocal(countryCode, e.target.value))}
                  placeholder={phonePlaceholder(countryCode)}
                  inputMode="numeric"
                  maxLength={phoneMaxLength(countryCode)}
                  className={phoneInnerInputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Billing address"
                className={inputClass}
              />
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-accent-purple py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-purple/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
