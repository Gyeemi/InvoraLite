import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
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
        setMessage(
          `Update ${result.update.version} is available (current ${result.currentVersion}).`,
        );
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
          are downloaded from GitHub Releases when available.
        </p>
      </div>

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
            className="inline-flex items-center gap-2 rounded-lg border border-accent-blue px-4 py-2 text-sm font-medium text-accent-blue transition-opacity disabled:opacity-60"
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
