import { CheckCircle2, X } from "lucide-react";
import { formatDateDMY } from "../lib/constants";

interface LicenseValidModalProps {
  open: boolean;
  onClose: () => void;
  expiresAt: string;
  customerName?: string;
}

export function LicenseValidModal({
  open,
  onClose,
  expiresAt,
  customerName,
}: LicenseValidModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-green/15">
              <CheckCircle2 className="h-5 w-5 text-accent-green" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">Licence Active</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-text-secondary">
          Your licence is valid till{" "}
          <span className="font-semibold text-text-primary">{formatDateDMY(expiresAt)}</span>.
        </p>
        {customerName && (
          <p className="mt-2 text-xs text-text-muted">Registered to {customerName}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
        >
          OK
        </button>
      </div>
    </div>
  );
}
