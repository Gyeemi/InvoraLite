import { describe, expect, it } from "vitest";
import type { Business } from "../types";
import { getBusinessValidationError, normalizeBusiness } from "./businessValidation";

function business(overrides: Partial<Business> = {}): Business {
  return {
    businessName: "Invora Shop",
    licenseNo: "LIC-1",
    tpnNo: "TPN-1",
    address: "Thimphu",
    phoneCountryCode: "+975",
    phone: "17123456",
    hasGst: false,
    gstRegistrationNo: "",
    email: "shop@example.com",
    password: "$argon2id$v=19$m=19456,t=2,p=1$hash",
    username: "owner",
    ...overrides,
  };
}

describe("getBusinessValidationError", () => {
  it("requires GST registration when GST is enabled", () => {
    expect(
      getBusinessValidationError(business({ hasGst: true, gstRegistrationNo: "" }), false),
    ).toBe("Please enter your GST Registration No.");
  });

  it("accepts business with GST registration", () => {
    expect(
      getBusinessValidationError(
        business({ hasGst: true, gstRegistrationNo: "GST-12345" }),
        false,
      ),
    ).toBeNull();
  });
});

describe("normalizeBusiness", () => {
  it("clears GST registration when GST is disabled", () => {
    expect(
      normalizeBusiness(business({ hasGst: false, gstRegistrationNo: "GST-12345" })).gstRegistrationNo,
    ).toBe("");
  });

  it("keeps branding data URLs when present", () => {
    const normalized = normalizeBusiness(
      business({
        logoDataUrl: " data:image/png;base64,abc ",
        letterheadDataUrl: " data:image/jpeg;base64,xyz ",
      }),
    );
    expect(normalized.logoDataUrl).toBe("data:image/png;base64,abc");
    expect(normalized.letterheadDataUrl).toBe("data:image/jpeg;base64,xyz");
  });

  it("omits empty branding fields", () => {
    const normalized = normalizeBusiness(
      business({ logoDataUrl: "  ", letterheadDataUrl: undefined }),
    );
    expect(normalized.logoDataUrl).toBeUndefined();
    expect(normalized.letterheadDataUrl).toBeUndefined();
  });
});
