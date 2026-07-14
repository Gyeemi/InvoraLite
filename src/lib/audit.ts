import { invoke } from "@tauri-apps/api/core";
import type { StorageMutationResult } from "./storage";
import { getStorageContext, isTauri } from "./storage";

export const AUDIT_LOG_CHANGED_EVENT = "invora-audit-changed";

export interface LockoutStatus {
  locked: boolean;
  failedAttempts: number;
  lockedUntil?: string;
  remainingSeconds?: number;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  username: string;
  action: string;
  recordAffected: string;
  status: string;
  details: string;
}

export function notifyAuditLogChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUDIT_LOG_CHANGED_EVENT));
}

export async function listAuditEntries(limit = 100, offset = 0): Promise<AuditEntry[]> {
  if (!isTauri()) return [];
  return invoke<AuditEntry[]>("audit_list", {
    limit,
    offset,
    context: getStorageContext() ?? undefined,
  });
}

export async function listAllAuditEntries(max = 10_000): Promise<AuditEntry[]> {
  if (!isTauri()) return [];

  const batch = 500;
  const all: AuditEntry[] = [];

  for (let offset = 0; offset < max; offset += batch) {
    const rows = await listAuditEntries(batch, offset);
    all.push(...rows);
    if (rows.length < batch) break;
  }

  return all;
}

export async function getLockoutStatus(username: string): Promise<LockoutStatus | null> {
  if (!isTauri() || !username.trim()) return null;
  return invoke<LockoutStatus>("auth_lockout_status", { username: username.trim() });
}

export async function recordFailedLogin(username: string): Promise<LockoutStatus | null> {
  if (!isTauri() || !username.trim()) return null;
  return invoke<LockoutStatus>("auth_record_failed_login", { username: username.trim() });
}

export async function clearLoginLockout(username: string): Promise<void> {
  if (!isTauri() || !username.trim()) return;
  await invoke("auth_clear_lockout", { username: username.trim() });
}

export async function recordAudit(
  username: string,
  action: string,
  recordAffected: string,
  status: "success" | "failure",
  details = "",
): Promise<void> {
  if (!isTauri()) return;

  const result = await invoke<StorageMutationResult>("audit_record", {
    username,
    action,
    recordAffected,
    status,
    details,
  });

  if (!result.success) {
    throw new Error(result.error ?? "Could not write audit log entry.");
  }

  notifyAuditLogChanged();
}
