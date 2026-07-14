import { PURCHASE_ROLES } from "./constants";
import type { UserRole } from "../types";

export function isViewerRole(role: UserRole | null | undefined): boolean {
  return role === "Viewer";
}

export function isManagerRole(role: UserRole | null | undefined): boolean {
  return role === "Manager";
}

export function isSuperAdminRole(role: UserRole | null | undefined): boolean {
  return role === "Admin";
}

/** Secondary admin access to staff, office, and audit tools. */
export function canAccessManagerToolsRole(role: UserRole | null | undefined): boolean {
  return role === "Admin" || role === "Manager";
}

export function canWriteRole(role: UserRole | null | undefined): boolean {
  return role != null && role !== "Viewer";
}

export function canDeleteRole(role: UserRole | null | undefined): boolean {
  return role === "Admin" || role === "Manager";
}

export function canManageProductsRole(role: UserRole | null | undefined): boolean {
  return role === "Admin" || role === "Manager" || role === "Store Keeper";
}

export function canManagePurchasesRole(role: UserRole | null | undefined): boolean {
  return role != null && PURCHASE_ROLES.includes(role as (typeof PURCHASE_ROLES)[number]);
}

export function canManageSalesRole(role: UserRole | null | undefined): boolean {
  return role === "Admin" || role === "Manager" || role === "Store Keeper" || role === "Cashier";
}

export function canManageCustomersRole(role: UserRole | null | undefined): boolean {
  return canManageSalesRole(role);
}

export function canManageSuppliersRole(role: UserRole | null | undefined): boolean {
  return role === "Admin" || role === "Manager" || role === "Store Keeper";
}

export function canManageBusinessRole(role: UserRole | null | undefined): boolean {
  return role === "Admin";
}

export function canManageReportsRole(role: UserRole | null | undefined): boolean {
  return role === "Admin";
}

export function canManageStaffRole(role: UserRole | null | undefined): boolean {
  return canAccessManagerToolsRole(role);
}

export function canManageOfficeRole(role: UserRole | null | undefined): boolean {
  return canAccessManagerToolsRole(role);
}

export function canViewAuditLogRole(role: UserRole | null | undefined): boolean {
  return canAccessManagerToolsRole(role);
}

export function canViewSuppliersRole(role: UserRole | null | undefined): boolean {
  return canManageSuppliersRole(role) || isViewerRole(role);
}
