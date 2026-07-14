import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./storage";

export type DatabaseTransferResult = {
  success: boolean;
  path?: string;
  error?: string;
  requiresBackupPassword?: boolean;
};

export type BackupInspectionResult = {
  success: boolean;
  inspection?: {
    version: number;
    encrypted: boolean;
    encryptionMode?: string | null;
    requiresPassword: boolean;
  };
  error?: string;
};

function sanitizeFilePart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "Invora";
}

function defaultBackupName(businessName?: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const label = sanitizeFilePart(businessName ?? "Invora");
  return `${label}_encrypted_backup_${stamp}.zip`;
}

export function hasDatabaseBackupApi(): boolean {
  return isTauri();
}

export async function inspectBackupFile(source: string): Promise<BackupInspectionResult> {
  if (!isTauri()) {
    return { success: false, error: "Backup inspection is only available in the desktop app." };
  }
  return invoke<BackupInspectionResult>("database_inspect_backup", { source });
}

export async function exportDatabase(
  businessName?: string,
  backupPassword?: string,
): Promise<DatabaseTransferResult> {
  if (!isTauri()) {
    return { success: false, error: "Database export is only available in the desktop app." };
  }
  if (!backupPassword?.trim()) {
    return { success: false, error: "A backup password is required for encrypted export." };
  }

  const destination = await save({
    defaultPath: defaultBackupName(businessName),
    filters: [{ name: "Invora Encrypted Backup", extensions: ["zip"] }],
  });

  if (!destination) {
    return { success: false, error: "Export cancelled." };
  }

  return invoke<DatabaseTransferResult>("database_export", {
    destination,
    password: backupPassword,
  });
}

export async function restoreDatabaseFromSource(
  source: string,
  backupPassword?: string,
): Promise<DatabaseTransferResult> {
  if (!isTauri()) {
    return { success: false, error: "Database restore is only available in the desktop app." };
  }

  const result = await invoke<DatabaseTransferResult>("database_restore", {
    source,
    backupPassword: backupPassword?.trim() || null,
  });

  return result;
}

export async function restoreDatabase(
  backupPassword?: string,
): Promise<DatabaseTransferResult & { source?: string }> {
  if (!isTauri()) {
    return { success: false, error: "Database restore is only available in the desktop app." };
  }

  const source = await open({
    multiple: false,
    filters: [{ name: "Invora Backup", extensions: ["zip"] }],
  });

  if (!source || Array.isArray(source)) {
    return { success: false, error: "Restore cancelled." };
  }

  const inspection = await inspectBackupFile(source);
  if (!inspection.success) {
    return { success: false, error: inspection.error ?? "Could not read backup file." };
  }

  if (inspection.inspection?.requiresPassword && !backupPassword?.trim()) {
    return {
      success: false,
      error: "BACKUP_PASSWORD_REQUIRED",
      requiresBackupPassword: true,
      source,
    };
  }

  const result = await restoreDatabaseFromSource(source, backupPassword);
  return { ...result, source };
}
