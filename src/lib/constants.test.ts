import { describe, expect, it, vi, afterEach } from "vitest";
import { formatAuditTimestamp, isCreditSale, parseAuditTimestamp, resolveSaleCreditDetails } from "./constants";

describe("resolveSaleCreditDetails", () => {
  it("detects full credit sales", () => {
    const credit = resolveSaleCreditDetails({
      paymentMode: "Credit",
      total: 1000,
      amountPaid: 0,
      amountCredit: 1000,
    });
    expect(credit).toEqual({
      amountPaid: 0,
      amountCredit: 1000,
      partialPaymentMode: undefined,
      paymentReference: undefined,
    });
  });

  it("detects partial credit sales", () => {
    const credit = resolveSaleCreditDetails({
      paymentMode: "Credit + Cash",
      total: 28999.98,
      amountPaid: 20000,
      amountCredit: 8999.98,
      partialPaymentMode: "Cash",
    });
    expect(credit?.amountPaid).toBe(20000);
    expect(credit?.amountCredit).toBe(8999.98);
    expect(credit?.partialPaymentMode).toBe("Cash");
  });

  it("returns null for cash sales", () => {
    expect(
      resolveSaleCreditDetails({
        paymentMode: "Cash",
        total: 500,
        amountPaid: 500,
      }),
    ).toBeNull();
  });
});

describe("isCreditSale", () => {
  it("recognises credit payment modes", () => {
    expect(isCreditSale({ paymentMode: "Credit", amountCredit: 0 })).toBe(true);
    expect(isCreditSale({ paymentMode: "Credit + mBoB" })).toBe(true);
    expect(isCreditSale({ paymentMode: "Cash" })).toBe(false);
  });
});

describe("formatAuditTimestamp", () => {
  const expectedLocalAuditFormat = (date: Date) =>
    date.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats legacy UTC sqlite timestamps in local time", () => {
    vi.useFakeTimers();
    // Instant equivalent to 15:18 in UTC+6 — assert against runner-local wall clock.
    vi.setSystemTime(new Date("2026-07-04T15:18:00+06:00"));

    const utcInstant = new Date("2026-07-04T09:18:00Z");
    expect(formatAuditTimestamp("2026-07-04 09:18:00")).toBe(
      expectedLocalAuditFormat(utcInstant),
    );
  });

  it("handles brief local-stored sqlite timestamps without adding six hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T15:18:00+06:00"));

    const parsed = parseAuditTimestamp("2026-07-04 15:16:45");
    expect(parsed?.getHours()).toBe(15);
    expect(parsed?.getMinutes()).toBe(16);

    const formatted = formatAuditTimestamp("2026-07-04 15:16:45");
    expect(formatted).toMatch(/15:16:45/);
  });

  it("formats RFC3339 UTC timestamps in local time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T15:18:00+06:00"));

    const utcInstant = new Date("2026-07-04T09:18:00Z");
    expect(formatAuditTimestamp("2026-07-04T09:18:00Z")).toBe(
      expectedLocalAuditFormat(utcInstant),
    );
  });
});
