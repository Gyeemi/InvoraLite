import type { Business, StaffMember } from "../types";

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
