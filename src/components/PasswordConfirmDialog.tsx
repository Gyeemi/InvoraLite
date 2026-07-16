import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { inputClass, labelClass } from "../lib/constants";

interface PasswordConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  onClose: () => void;
  onConfirm: (password: string) => Promise<boolean>;
}

export function PasswordConfirmDialog({
  open,
  title,
  description = "Enter your password to continue.",
  confirmLabel = "Confirm",
  loadingLabel = "Verifying…",
  onClose,
  onConfirm,
}: PasswordConfirmDialogProps) {
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setError("");
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setSubmitting(true);
    setError("");
    const ok = await onConfirm(password);
    setSubmitting(false);
    if (!ok) {
      setError("Incorrect password.");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-text-secondary">{description}</p>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red"
            >
              {error}
            </div>
          )}
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
              autoFocus
              disabled={submitting}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-accent-purple py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-purple/90 disabled:opacity-60"
            >
              {submitting ? loadingLabel : confirmLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
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
