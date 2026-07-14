import { useEffect, useState } from "react";
import { inputClass, labelClass } from "../lib/constants";

interface BackupPasswordDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  requireConfirmation?: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<boolean>;
}

export function BackupPasswordDialog({
  open,
  title,
  description,
  confirmLabel,
  requireConfirmation = true,
  onClose,
  onConfirm,
}: BackupPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Backup password must be at least 8 characters.");
      return;
    }
    if (requireConfirmation && password !== confirmPassword) {
      setError("Backup passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    const ok = await onConfirm(password);
    setSubmitting(false);
    if (!ok) {
      setError("Could not continue with this backup password.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="backupPassword" className={labelClass}>
              Backup password
            </label>
            <input
              id="backupPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoFocus
              required
            />
          </div>
          {requireConfirmation && (
            <div>
              <label htmlFor="backupPasswordConfirm" className={labelClass}>
                Confirm backup password
              </label>
              <input
                id="backupPasswordConfirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {submitting ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
