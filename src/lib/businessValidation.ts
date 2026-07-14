import { normalizeFiscalYearStartMonth } from "./accounting";
import { normalizePhone } from "./constants";
import { isPasswordHash } from "./password";
import { passwordComplexityMessage, validatePasswordComplexity } from "./passwordPolicy";
import type { Business } from "../types";

export function getBusinessValidationError(
  data: Business,
  requirePassword = true,
): string | null {
  if (!data.businessName.trim()) return "Business name is required.";
  if (!data.licenseNo.trim()) return "License No. is required.";
  if (!data.tpnNo.trim()) return "TPN No. is required.";
  if (!data.address.trim()) return "Address is required.";
  if (normalizePhone(data.phone).length === 0) return "Phone number is required.";
  if (!data.email.trim()) return "Email is required.";
  if (!data.username.trim()) return "Business account username is missing. Contact support or re-run setup.";
  if (
    requirePassword &&
    !isPasswordHash(data.password) &&
    !validatePasswordComplexity(data.password)
  ) {
    return passwordComplexityMessage();
  }
  if (data.hasGst && !data.gstRegistrationNo.trim()) {
    return "Please enter your GST Registration No.";
  }
  return null;
}

export function validateBusiness(data: Business, requirePassword = true): boolean {
  return getBusinessValidationError(data, requirePassword) === null;
}

export function normalizeBusiness(data: Business): Business {
  return {
    ...data,
    businessName: data.businessName.trim(),
    licenseNo: data.licenseNo.trim(),
    tpnNo: data.tpnNo.trim(),
    address: data.address.trim(),
    phone: normalizePhone(data.phone),
    email: data.email.trim(),
    gstRegistrationNo: data.hasGst ? data.gstRegistrationNo.trim() : "",
    fiscalYearStartMonth: normalizeFiscalYearStartMonth(data.fiscalYearStartMonth),
  };
}
