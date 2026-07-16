import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { AppIcon } from "../components/AppIcon";
import { ThemeToggle } from "../components/ThemeToggle";
import { useState } from "react";
import { CountryCodeSelect } from "../components/CountryCodeSelect";
import { useAuth } from "../contexts/AuthContext";
import {
  formatPhoneLocal,
  inputClass,
  labelClass,
  phoneInnerInputClass,
  phoneInputGroupClass,
  phoneMaxLength,
  phonePlaceholder,
} from "../lib/constants";
import { passwordComplexityMessage, validatePasswordComplexity } from "../lib/passwordPolicy";

export function SetupPage() {
  const { completeSetup } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    licenseNo: "",
    tpnNo: "",
    address: "",
    phoneCountryCode: "+975",
    phone: "",
    hasGst: false,
    gstRegistrationNo: "",
    email: "",
    password: "",
    username: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validatePasswordComplexity(form.password)) {
      setError(passwordComplexityMessage());
      return;
    }
    if (form.hasGst && !form.gstRegistrationNo.trim()) {
      setError("Please enter your GST Registration No.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await completeSetup({
        ...form,
        phone: form.phone.replace(/\D/g, ""),
      });
      if (!ok) setError("Please fill in all required fields.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-main p-6">
      <ThemeToggle floating />
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-bg-card ring-1 ring-border/60">
            <AppIcon className="h-11 w-11" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Welcome to InvoraLite</h1>
          <p className="max-w-sm text-sm text-text-secondary">
            Set up your business profile to get started with inventory management.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-border bg-bg-card p-8 shadow-lg shadow-black/20"
        >
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-accent-red/20 bg-accent-red/10 px-4 py-3 text-sm text-accent-red"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <fieldset disabled={submitting} className="min-w-0 border-0 p-0">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Business Details
          </p>

          <div className="mb-4">
            <label htmlFor="businessName" className={labelClass}>
              Business Name
            </label>
            <input
              id="businessName"
              value={form.businessName}
              onChange={(e) => update("businessName", e.target.value)}
              placeholder="Enter your business name"
              required
              className={inputClass}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="licenseNo" className={labelClass}>
                License No.
              </label>
              <input
                id="licenseNo"
                value={form.licenseNo}
                onChange={(e) => update("licenseNo", e.target.value)}
                placeholder="License number"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tpnNo" className={labelClass}>
                TPN No.
              </label>
              <input
                id="tpnNo"
                value={form.tpnNo}
                onChange={(e) => update("tpnNo", e.target.value)}
                placeholder="Tax payer number"
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="address" className={labelClass}>
              Address
            </label>
            <textarea
              id="address"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Business address"
              required
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone No.
              </label>
              <div className={phoneInputGroupClass}>
                <CountryCodeSelect
                  value={form.phoneCountryCode}
                  onChange={(code) =>
                    setForm((prev) => ({
                      ...prev,
                      phoneCountryCode: code,
                      phone: formatPhoneLocal(code, prev.phone),
                    }))
                  }
                />
                <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
                <input
                  id="phone"
                  value={form.phone}
                  onChange={(e) =>
                    update("phone", formatPhoneLocal(form.phoneCountryCode, e.target.value))
                  }
                  placeholder={phonePlaceholder(form.phoneCountryCode)}
                  inputMode="numeric"
                  maxLength={phoneMaxLength(form.phoneCountryCode)}
                  required
                  className={phoneInnerInputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@business.com"
                required
                className={inputClass}
              />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-bg-main px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Does your business have GST?</p>
              <p className="text-xs text-text-muted">Enable if registered for GST</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.hasGst}
              aria-label="Business has GST"
              onClick={() => update("hasGst", !form.hasGst)}
              className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-main ${
                form.hasGst ? "bg-accent-blue" : "bg-border/80"
              }`}
            >
              <span
                className={`block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                  form.hasGst ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="mb-6">
            <label htmlFor="gstRegistrationNo" className={`${labelClass} ${form.hasGst ? "" : "text-text-muted"}`}>
              GST Registration No.
            </label>
            <input
              id="gstRegistrationNo"
              value={form.gstRegistrationNo}
              onChange={(e) => update("gstRegistrationNo", e.target.value)}
              placeholder={
                form.hasGst
                  ? "Enter GST registration number"
                  : "Enable GST to enter registration number"
              }
              disabled={!form.hasGst}
              required={form.hasGst}
              className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </div>

          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Account Details
          </p>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="username" className={labelClass}>
                Set User Name
              </label>
              <input
                id="username"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="Choose a username"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Create Password
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Create a password"
                required
                className={inputClass}
              />
            </div>
          </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-blue/25 transition-colors hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Completing setup…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Complete Setup
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
