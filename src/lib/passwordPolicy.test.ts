import { describe, expect, it } from "vitest";
import {
  canUsePassword,
  passwordComplexityMessage,
  validatePasswordComplexity,
} from "./passwordPolicy";

describe("passwordPolicy", () => {
  it("accepts passwords with letters and numbers", () => {
    expect(validatePasswordComplexity("InvoraLite1")).toBe(true);
  });

  it("rejects short passwords", () => {
    expect(validatePasswordComplexity("abc1")).toBe(false);
  });

  it("rejects passwords without digits", () => {
    expect(validatePasswordComplexity("abcdefgh")).toBe(false);
  });

  it("rejects passwords without letters", () => {
    expect(validatePasswordComplexity("12345678")).toBe(false);
  });

  it("allows existing hashes without re-validating complexity", () => {
    expect(canUsePassword("legacy", true)).toBe(true);
  });

  it("returns a helpful complexity message", () => {
    expect(passwordComplexityMessage()).toContain("8");
    expect(passwordComplexityMessage()).toContain("letter");
  });
});
