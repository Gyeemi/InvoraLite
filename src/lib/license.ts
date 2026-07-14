import { invoke, isTauri } from "@tauri-apps/api/core";
import { LICENSE_TRIAL_DAYS } from "./constants";
import type { LicenseStatus } from "../types";

const DEVICE_ID_STORAGE_KEY = "invora_device_id";

export type LicenseActivateResult = {
  success: boolean;
  error?: string;
  expiresAt?: string;
  customerName?: string;
  daysRemaining?: number;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function getDeviceId(): Promise<string> {
  if (isTauri()) {
    return invoke<string>("license_device_id");
  }
  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (isTauri()) {
    return invoke<LicenseStatus>("license_status");
  }
  const deviceId = await getDeviceId();
  return { licensed: true, deviceId };
}

export async function activateLicense(licenseKey: string): Promise<LicenseActivateResult> {
  if (isTauri()) {
    return invoke<LicenseActivateResult>("license_activate", { licenseKey });
  }
  return { success: true, expiresAt: "", customerName: "", daysRemaining: 365 };
}

export async function activateLicenseFromZip(file: File): Promise<LicenseActivateResult> {
  if (!isTauri()) {
    return { success: true, expiresAt: "", customerName: "", daysRemaining: 365 };
  }
  const zipBase64 = await fileToBase64(file);
  return invoke<LicenseActivateResult>("license_activate_from_zip", { zipBase64 });
}

export async function startTrial() {
  if (isTauri()) {
    return invoke<{
      success: boolean;
      error?: string;
      alreadyStarted?: boolean;
      daysRemaining?: number;
      trialEndsAt?: string;
    }>("license_start_trial");
  }
  return { success: true, alreadyStarted: false, daysRemaining: LICENSE_TRIAL_DAYS };
}

export function hasLicenseApi(): boolean {
  return isTauri();
}
