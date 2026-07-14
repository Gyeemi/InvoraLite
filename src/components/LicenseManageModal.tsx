import { Check, Copy, KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LicenseZipUploadField } from "./LicenseZipUploadField";
import { activateLicenseFromZip, getDeviceId, getLicenseStatus, hasLicenseApi } from "../lib/license";
import { formatDateGB } from "../lib/constants";
import type { LicenseStatus } from "../types";

interface LicenseManageModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function LicenseManageModal({ open, onClose, onUpdated }: LicenseManageModalProps) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [detectingDevice, setDetectingDevice] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setZipFile(null);
    setError("");
    setSuccess("");
    setCopied(false);
    setStatus(null);
    setDeviceId(null);
    setDetectingDevice(true);
    void (async () => {
      const [detectedId, licenseStatus] = await Promise.all([getDeviceId(), getLicenseStatus()]);
      setDeviceId(detectedId);
      setStatus(licenseStatus);
      setDetectingDevice(false);
    })();
  }, [open]);

  if (!open) return null;

  async function copyDeviceId() {
    const id = deviceId ?? status?.deviceId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy Device ID. Please copy it manually.");
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!zipFile) {
      setError("Upload your password-protected licence ZIP file.");
      return;
    }
    setSubmitting(true);
    const result = await activateLicenseFromZip(zipFile);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Activation failed.");
      return;
    }
    setSuccess(
      `Licence activated${result.customerName ? ` for ${result.customerName}` : ""} until ${result.expiresAt ? formatDateGB(result.expiresAt) : ""}.`,
    );
    const [nextStatus, nextDeviceId] = await Promise.all([getLicenseStatus(), getDeviceId()]);
    setStatus(nextStatus);
    setDeviceId(nextDeviceId);
    onUpdated?.();
    window.setTimeout(() => {
      setSuccess("");
      onClose();
    }, 1200);
  }

  const statusLabel = status?.trial
    ? `Free trial${status.daysRemaining !== undefined ? ` · ${status.daysRemaining} days left` : ""}`
    : status?.licensed
      ? status.expiresAt
        ? `Licensed until ${formatDateGB(status.expiresAt)}${status.daysRemaining !== undefined && status.daysRemaining <= 30 ? ` (${status.daysRemaining} days left)` : ""}`
        : "Licensed"
      : "Not activated";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">InvoraLite Licence</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!hasLicenseApi() && (
          <div className="mb-4 rounded-xl bg-accent-orange/10 px-4 py-3 text-sm text-accent-orange">
            Browser dev mode: Device ID is generated for this browser. Use the installed desktop app
            for machine-bound licensing.
          </div>
        )}

        {(status || detectingDevice) && (
          <>
            {status && (
            <div className="mb-4 rounded-xl border border-border bg-bg-main/50 p-4">
              <p className="text-sm font-medium text-text-primary">{statusLabel}</p>
              {status.customerName && (
                <p className="mt-1 text-xs text-text-secondary">Registered to {status.customerName}</p>
              )}
            </div>
            )}

            <div className="mb-6 rounded-xl border border-border bg-bg-main/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Device ID
              </p>
              <div className="flex items-start gap-2">
                {detectingDevice ? (
                  <p className="flex-1 text-sm text-text-muted">Detecting device…</p>
                ) : (
                  <code className="flex-1 break-all text-sm text-accent-blue">
                    {deviceId ?? status?.deviceId ?? "—"}
                  </code>
                )}
                <button
                  type="button"
                  onClick={() => void copyDeviceId()}
                  disabled={detectingDevice || !(deviceId ?? status?.deviceId)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-accent-green" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Each licence key is tied to this Device ID. Send it when you purchase or renew.
              </p>
            </div>
          </>
        )}

        <form onSubmit={(e) => void handleActivate(e)} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}
          {success && (
            <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
              {success}
            </div>
          )}
          <LicenseZipUploadField
            id="manageLicenseZip"
            file={zipFile}
            onFileChange={setZipFile}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-60"
          >
            <KeyRound className="h-4 w-4" />
            {submitting ? "Activating…" : "Activate / Update Licence"}
          </button>
        </form>
      </div>
    </div>
  );
}
