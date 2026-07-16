import { useEffect, useState } from "react";
import { ArrowUpCircle, Download, RefreshCw } from "lucide-react";
import {
  checkForAppUpdate,
  downloadInstallAndRelaunch,
  getAppVersion,
  type UpdateCheckResult,
} from "../lib/appUpdater";

export function SoftwareUpdatesCard() {
  const [version, setVersion] = useState("…");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Extract<
    UpdateCheckResult,
    { status: "available" }
  > | null>(null);

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await checkForAppUpdate();
      if (result.status === "available") {
        setVersion(result.currentVersion);
        setPending(result);
      } else if (result.status === "upToDate") {
        setVersion(result.currentVersion);
      }
    })();
  }, []);

  async function handleCheck() {
    setBusy(true);
    setError("");
    setMessage("");
    setPending(null);
    try {
      const result = await checkForAppUpdate();
      if (result.status === "unavailable") {
        setMessage("Updates are only available in the desktop app.");
      } else if (result.status === "upToDate") {
        setVersion(result.currentVersion);
        setMessage("You are up-to-date.");
      } else if (result.status === "available") {
        setVersion(result.currentVersion);
        setPending(result);
        setMessage("");
      } else {
        setError(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleInstall() {
    if (!pending) return;
    setBusy(true);
    setError("");
    setMessage("Downloading update… the app will restart when ready.");
    try {
      await downloadInstallAndRelaunch(pending.update);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-bg-card p-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Software updates</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Installed version <span className="font-medium text-text-primary">{version}</span>. Updates
          are downloaded from Software Host Releases when available.
        </p>
      </div>

      {pending && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-3"
        >
          <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-accent-green">Update Available</p>
            <p className="mt-0.5 text-sm text-text-secondary">
              Version <span className="font-medium text-text-primary">{pending.update.version}</span>{" "}
              is ready to install (current {pending.currentVersion}).
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCheck()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          Check for updates
        </button>
        {pending && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleInstall()}
            className="inline-flex items-center gap-2 rounded-lg border border-accent-green bg-accent-green px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Download & install {pending.update.version}
          </button>
        )}
      </div>

      {message && <p className="text-sm text-text-secondary">{message}</p>}
      {error && <p className="text-sm text-accent-red">{error}</p>}
    </section>
  );
}
