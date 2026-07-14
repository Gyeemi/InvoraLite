import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./storage";

export type PasswordVerifyResult = {
  valid: boolean;
  upgradedHash?: string;
};

export function isPasswordHash(value: string): boolean {
  return value.startsWith("$argon2");
}

export async function hashPassword(plaintext: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("Password hashing is only available in the desktop app.");
  }
  return invoke<string>("password_hash", { password: plaintext });
}

export async function verifyStoredPassword(
  stored: string,
  plaintext: string,
): Promise<PasswordVerifyResult> {
  if (!isTauri()) {
    if (isPasswordHash(stored)) {
      return { valid: false };
    }
    return { valid: stored === plaintext };
  }

  const result = await invoke<{ valid: boolean; upgradedHash?: string | null }>("password_verify", {
    password: plaintext,
    stored,
  });

  return {
    valid: result.valid,
    upgradedHash: result.upgradedHash ?? undefined,
  };
}

export async function resolveStoredPassword(
  incoming: string,
  current = "",
): Promise<string> {
  const trimmed = incoming.trim();
  if (!trimmed) return current;
  if (isPasswordHash(trimmed)) return trimmed;
  return hashPassword(trimmed);
}
