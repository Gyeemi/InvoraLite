import { describe, expect, it } from "vitest";
import type { AuditEntry } from "./audit";
import { filterAuditEntries, getAuditPeriodBounds } from "./auditFilters";

const entry = (id: number, timestamp: string, username: string): AuditEntry => ({
  id,
  timestamp,
  username,
  action: "login",
  recordAffected: "user",
  status: "success",
  details: "",
});

describe("getAuditPeriodBounds", () => {
  it("returns null for till date", () => {
    expect(getAuditPeriodBounds("tillDate", "2026-07-06")).toBeNull();
  });
});

describe("filterAuditEntries", () => {
  it("filters by username", () => {
    const rows = [
      entry(1, "2026-07-06T10:00:00Z", "alice"),
      entry(2, "2026-07-06T11:00:00Z", "bob"),
    ];
    const filtered = filterAuditEntries(rows, "tillDate", "2026-07-06", "alice");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.username).toBe("alice");
  });
});
