import { X } from "lucide-react";
import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  confirmTone?: "default" | "danger";
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  loadingLabel,
  cancelLabel = "Cancel",
  confirmTone = "default",
  loading = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const confirmClass =
    confirmTone === "danger"
      ? "bg-accent-red text-white hover:bg-accent-red/90 shadow-lg shadow-accent-red/20"
      : "bg-accent-blue text-white hover:bg-accent-blue/90 shadow-lg shadow-accent-blue/20";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!loading) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="confirm-dialog-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {description && <p className="mb-5 text-sm leading-relaxed text-text-secondary">{description}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? (loadingLabel ?? confirmLabel) : confirmLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
