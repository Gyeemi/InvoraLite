import { RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessRestricted } from "./AccessRestricted";
import { PasswordConfirmDialog } from "./PasswordConfirmDialog";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import {
  AUDIT_LOG_CHANGED_EVENT,
  listAllAuditEntries,
  type AuditEntry,
} from "../lib/audit";
import {
  AUDIT_PERIOD_OPTIONS,
  collectAuditUsernames,
  filterAuditEntries,
  type AuditPeriod,
} from "../lib/auditFilters";
import { cardClass, formatAuditTimestamp, inputClass, labelClass, tableNoWrapClass } from "../lib/constants";
import { getStaff } from "../lib/data";
import { isTauri } from "../lib/storage";

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AuditLogPanel() {
  const { business, verifyPassword } = useAuth();
  const { canViewAuditLog } = usePermissions();
  const [unlocked, setUnlocked] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(true);
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [staffUsernames, setStaffUsernames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<AuditPeriod>("tillDate");
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [usernameFilter, setUsernameFilter] = useState("__all__");
  const desktopApp = isTauri();

  const loadEntries = useCallback(async () => {
    if (!desktopApp || !unlocked) {
      if (!desktopApp) {
        setAllEntries([]);
        setError("");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [rows, staff] = await Promise.all([listAllAuditEntries(), getStaff()]);
      setAllEntries(rows);
      const names = staff.map((member) => member.username);
      if (business?.username.trim()) {
        names.push(business.username.trim());
      }
      setStaffUsernames(names);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audit log.");
    } finally {
      setLoading(false);
    }
  }, [business?.username, desktopApp, unlocked]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!unlocked) return;
    const handleAuditChanged = () => {
      void loadEntries();
    };
    window.addEventListener(AUDIT_LOG_CHANGED_EVENT, handleAuditChanged);
    return () => window.removeEventListener(AUDIT_LOG_CHANGED_EVENT, handleAuditChanged);
  }, [loadEntries, unlocked]);

  const userOptions = useMemo(
    () => collectAuditUsernames(allEntries, staffUsernames),
    [allEntries, staffUsernames],
  );

  const filteredEntries = useMemo(
    () => filterAuditEntries(allEntries, period, selectedDate, usernameFilter),
    [allEntries, period, selectedDate, usernameFilter],
  );

  async function handlePasswordConfirm(password: string): Promise<boolean> {
    const ok = await verifyPassword(password);
    if (ok) {
      setUnlocked(true);
      setPasswordOpen(false);
    }
    return ok;
  }

  if (!canViewAuditLog) {
    return <AccessRestricted description="Only Super Admin and Manager can view the audit log." />;
  }

  return (
    <div className="space-y-4">
      <PasswordConfirmDialog
        open={passwordOpen && !unlocked}
        title="View audit log"
        description="Enter your password to view security and inventory audit events."
        confirmLabel="View log"
        onClose={() => setPasswordOpen(false)}
        onConfirm={handlePasswordConfirm}
      />

      {!unlocked ? (
        <div className={`${cardClass} flex flex-col items-center gap-4 p-10 text-center`}>
          <div className="rounded-2xl bg-accent-blue/10 p-4 text-accent-blue">
            <Shield className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Audit log is protected</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Confirm your password to review recorded user actions, stock changes, and security events.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
          >
            Enter password
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <p className="text-sm text-text-secondary">
              Review security and inventory events recorded by the application.
            </p>
            {desktopApp && (
              <button
                type="button"
                onClick={() => void loadEntries()}
                disabled={loading}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>

          {!desktopApp && (
            <div className="rounded-xl bg-accent-orange/10 px-4 py-3 text-sm text-accent-orange">
              The audit log is only available in the InvoraLite desktop app. Run the app with{" "}
              <code className="rounded bg-bg-main px-1 py-0.5 text-xs">npm run tauri:dev</code> to
              record and view audit events.
            </div>
          )}

          <div className={`${cardClass} grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3`}>
            <div>
              <label className={labelClass}>View period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as AuditPeriod)}
                className={inputClass}
              >
                {AUDIT_PERIOD_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {period === "date" && (
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  max={todayIsoDate()}
                  onChange={(e) => {
                    const next = e.target.value;
                    const max = todayIsoDate();
                    setSelectedDate(next > max ? max : next);
                  }}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>User</label>
              <select
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
                className={inputClass}
              >
                <option value="__all__">All users</option>
                {userOptions.map((username) => (
                  <option key={username} value={username}>
                    {username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{error}</div>
          )}

          <div className={`${cardClass} overflow-hidden`}>
            <div className="border-b border-border/60 px-4 py-3 text-xs text-text-muted">
              Showing {filteredEntries.length} event{filteredEntries.length === 1 ? "" : "s"}
              {allEntries.length !== filteredEntries.length
                ? ` of ${allEntries.length} loaded`
                : ""}
            </div>

            {loading ? (
              <p className="p-8 text-center text-sm text-text-muted">Loading audit log…</p>
            ) : filteredEntries.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">
                {desktopApp
                  ? "No audit events match the selected filters."
                  : "No audit events available in the browser preview."}
              </p>
            ) : (
              <table className={`min-w-[900px] text-left text-sm ${tableNoWrapClass}`}>
                <thead>
                  <tr className="border-b border-border bg-bg-main/60 text-xs uppercase tracking-wider text-text-muted">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Record</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-bg-hover/40">
                      <td className="px-4 py-3 text-text-secondary">
                        {formatAuditTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">{entry.username || "—"}</td>
                      <td className="px-4 py-3 font-medium text-text-primary">{entry.action}</td>
                      <td className="px-4 py-3 text-text-secondary">{entry.recordAffected}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            entry.status === "success"
                              ? "bg-accent-green/15 text-accent-green"
                              : "bg-accent-red/15 text-accent-red"
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-text-muted break-words">
                        {entry.details || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
