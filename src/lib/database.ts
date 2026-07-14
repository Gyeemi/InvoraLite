import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./storage";

export interface HealthReport {
  healthy: boolean;
  databaseExists: boolean;
  schemaOk: boolean;
  schemaVersion: number;
  expectedSchemaVersion: number;
  integrityOk: boolean;
  foreignKeysOn: boolean;
  encryptionEnabled: boolean;
  message?: string;
}

export async function checkDatabaseHealth(): Promise<HealthReport | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<HealthReport>("database_health");
  } catch {
    return {
      healthy: false,
      databaseExists: false,
      schemaOk: false,
      schemaVersion: 0,
      expectedSchemaVersion: 1,
      integrityOk: false,
      foreignKeysOn: false,
      encryptionEnabled: false,
      message: "Could not verify database health.",
    };
  }
}

/** Seal the live DB after logout so plaintext is not left on disk between sessions. */
export async function sealDatabaseAtRest(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    await invoke("database_seal_at_rest");
    return true;
  } catch {
    return false;
  }
}

/** Reopen the vault after seal-at-rest (e.g. before login / setup storage). */
export async function ensureDatabaseOpen(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    await invoke("database_ensure_open");
    return true;
  } catch {
    return false;
  }
}

/** Refresh encrypted vault from live DB without closing the session. */
export async function refreshDatabaseVault(): Promise<boolean> {
  if (!isTauri()) return true;
  try {
    await invoke("database_refresh_vault");
    return true;
  } catch {
    return false;
  }
}
