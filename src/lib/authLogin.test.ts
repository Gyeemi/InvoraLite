import { describe, expect, it } from "vitest";
import {
  formatLoginFailureMessage,
  formatLoginLockoutMessage,
  LOGIN_MAX_FAILED_ATTEMPTS,
  resolveLoginUsername,
} from "./authLogin";
import type { Business, StaffMember } from "../types";
import type { LockoutStatus } from "./audit";

const business: Business = {
  businessName: "Test Shop",
  licenseNo: "L1",
  tpnNo: "T1",
  address: "Addr",
  phoneCountryCode: "+975",
  phone: "17123456",
  hasGst: false,
  gstRegistrationNo: "",
  email: "owner@shop.com",
  password: "hash",
  username: "owner",
};

const staff: StaffMember[] = [
  {
    id: "USR-1",
    name: "Cashier One",
    username: "cashier1",
    email: "cashier@shop.com",
    role: "Cashier",
    password: "hash",
  },
];

describe("resolveLoginUsername", () => {
  it("resolves owner by username or email", () => {
    expect(resolveLoginUsername("owner", business, staff)).toBe("owner");
    expect(resolveLoginUsername("owner@shop.com", business, staff)).toBe("owner");
  });

  it("resolves staff by username or email", () => {
    expect(resolveLoginUsername("cashier1", business, staff)).toBe("cashier1");
    expect(resolveLoginUsername("cashier@shop.com", business, staff)).toBe("cashier1");
  });

  it("returns null for unknown identifier", () => {
    expect(resolveLoginUsername("unknown", business, staff)).toBeNull();
  });
});

describe("formatLoginFailureMessage", () => {
  it("shows a clear wrong-credentials message by default", () => {
    expect(formatLoginFailureMessage(null)).toContain("Wrong credentials");
  });

  it("warns when few attempts remain", () => {
    const lockout: LockoutStatus = {
      locked: false,
      failedAttempts: LOGIN_MAX_FAILED_ATTEMPTS - 1,
    };
    expect(formatLoginFailureMessage(lockout)).toContain("1 attempt");
  });

  it("shows lockout message when account is locked", () => {
    const lockout: LockoutStatus = {
      locked: true,
      failedAttempts: LOGIN_MAX_FAILED_ATTEMPTS,
      remainingSeconds: 120,
    };
    expect(formatLoginFailureMessage(lockout)).toBe(formatLoginLockoutMessage(lockout));
    expect(formatLoginFailureMessage(lockout)).toContain("Account locked");
  });
});
