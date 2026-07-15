import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateCheckResult =
  | { status: "unavailable" }
  | { status: "upToDate"; currentVersion: string }
  | { status: "available"; currentVersion: string; update: Update }
  | { status: "error"; message: string };

function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getAppVersion(): Promise<string> {
  if (!isDesktopRuntime()) return "web";
  try {
    return await getVersion();
  } catch {
    return "unknown";
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!isDesktopRuntime()) {
    return { status: "unavailable" };
  }

  try {
    const currentVersion = await getVersion();
    const update = await check();
    if (!update) {
      return { status: "upToDate", currentVersion };
    }
    return { status: "available", currentVersion, update };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
}

export async function downloadInstallAndRelaunch(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
