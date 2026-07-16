import type { LockoutStatus } from "./audit";
import type { Business, StaffMember } from "../types";

/** Must match `MAX_FAILED_ATTEMPTS` in `src-tauri/src/db/auth_security.rs`. */
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;

export function resolveLoginUsername(
  identifier: string,
  business: Business | null,
  staff: StaffMember[],
): string | null {
  if (!business) return null;
  const id = identifier.trim().toLowerCase();
  if (!id) return null;

  if (
    business.email.trim().toLowerCase() === id ||
    business.username.trim().toLowerCase() === id
  ) {
    return business.username.trim();
  }

  const member = staff.find(
    (entry) =>
      entry.username.trim().toLowerCase() === id ||
      (entry.email.trim() && entry.email.trim().toLowerCase() === id),
  );

  return member ? member.username.trim() : null;
}

export function formatLoginLockoutMessage(lockout: LockoutStatus): string {
  const minutes = Math.max(1, Math.ceil((lockout.remainingSeconds ?? 0) / 60));
  return `Account locked after too many failed attempts. Try again in about ${minutes} minute(s).`;
}

export function formatLoginFailureMessage(lockout: LockoutStatus | null): string {
  if (lockout?.locked) {
    return formatLoginLockoutMessage(lockout);
  }

  const attempts = lockout?.failedAttempts ?? 0;
  const remaining = Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - attempts);
  if (remaining > 0 && remaining <= 2) {
    return `Wrong credentials. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before your account is locked.`;
  }

  return "Wrong credentials. Please check your email/username and password.";
}

export function isOwnerUser(
  user: { username: string; email: string },
  business: Business,
): boolean {
  return (
    user.username.trim().toLowerCase() === business.username.trim().toLowerCase() ||
    (!!user.email.trim() &&
      !!business.email.trim() &&
      user.email.trim().toLowerCase() === business.email.trim().toLowerCase())
  );
}
