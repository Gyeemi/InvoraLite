import { describe, expect, it } from "vitest";
import { resolveLoginUsername } from "./authLogin";
import type { Business, StaffMember } from "../types";

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
