import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { ThemeToggle } from "../components/ThemeToggle";
import { LicenseZipUploadField } from "../components/LicenseZipUploadField";
import { activateLicenseFromZip, startTrial } from "../lib/license";
import { LICENSE_TRIAL_DAYS, formatDateGB } from "../lib/constants";
import type { LicenseStatus } from "../types";

interface LicenseGateProps {
  status: LicenseStatus;
  onActivated: () => void;
}

export function LicenseGate({ status, onActivated }: LicenseGateProps) {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(status.error ?? "");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyDeviceId() {
    try {
      await navigator.clipboard.writeText(status.deviceId);
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
      `License activated${result.customerName ? ` for ${result.customerName}` : ""} until ${result.expiresAt ? formatDateGB(result.expiresAt) : ""}.`,
    );
    window.setTimeout(onActivated, 800);
  }

  async function handleTrial() {
    setError("");
    setSuccess("");
    const result = await startTrial();
    if (!result.success) {
      setError(result.error ?? "Could not start trial.");
      return;
    }
    setSuccess(
      result.alreadyStarted
        ? `Free trial already active (${result.daysRemaining ?? 0} days remaining).`
        : `${LICENSE_TRIAL_DAYS}-day free trial started${result.daysRemaining ? ` (${result.daysRemaining} days remaining)` : ""}.`,
    );
    window.setTimeout(onActivated, 800);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-main p-6">
      <ThemeToggle floating />
      <div className="flex w-full max-w-lg flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-bg-card ring-1 ring-border/60">
            <AppIcon className="h-11 w-11" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Activate Invora</h1>
          <p className="max-w-md text-sm text-text-secondary">
            Upload your password-protected licence ZIP to use Invora on this computer. Each licence
            is tied to one Device ID.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-bg-card p-8 shadow-lg shadow-black/20">
          <div className="mb-6 rounded-xl border border-border bg-bg-main/50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Device ID
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all text-sm text-accent-blue">{status.deviceId}</code>
              <button
                type="button"
                onClick={() => void copyDeviceId()}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
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
              Send this Device ID when you purchase a license. Your key will only work on this PC.
            </p>
          </div>

          <form onSubmit={(e) => void handleActivate(e)} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
                {success}
              </div>
            )}
            <LicenseZipUploadField
              id="licenseZip"
              file={zipFile}
              onFileChange={setZipFile}
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-blue/25 transition-colors hover:bg-accent-blue/90 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {submitting ? "Activating…" : "Activate License"}
            </button>
            {!status.trialUsed && (
              <button
                type="button"
                onClick={() => void handleTrial()}
                className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
              >
                Start {LICENSE_TRIAL_DAYS}-Day Free Trial
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
