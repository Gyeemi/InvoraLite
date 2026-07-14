import { describe, expect, it } from "vitest";
import {
  canDeleteRole,
  canManageBusinessRole,
  canManageCustomersRole,
  canManageOfficeRole,
  canManageProductsRole,
  canManageReportsRole,
  canManageSalesRole,
  canManageStaffRole,
  canViewAuditLogRole,
  canViewSuppliersRole,
  canWriteRole,
  isViewerRole,
} from "./permissions";

describe("permissions", () => {
  it("treats Viewer as read-only", () => {
    expect(isViewerRole("Viewer")).toBe(true);
    expect(canWriteRole("Viewer")).toBe(false);
    expect(canManageSalesRole("Viewer")).toBe(false);
    expect(canManageProductsRole("Viewer")).toBe(false);
    expect(canDeleteRole("Viewer")).toBe(false);
  });

  it("allows cashier sales and customers", () => {
    expect(canManageSalesRole("Cashier")).toBe(true);
    expect(canManageCustomersRole("Cashier")).toBe(true);
    expect(canManageProductsRole("Cashier")).toBe(false);
    expect(canDeleteRole("Cashier")).toBe(false);
  });

  it("allows admin full product access and delete", () => {
    expect(canManageProductsRole("Admin")).toBe(true);
    expect(canDeleteRole("Admin")).toBe(true);
  });

  it("limits supplier visibility by role", () => {
    expect(canViewSuppliersRole("Cashier")).toBe(false);
    expect(canViewSuppliersRole("Viewer")).toBe(true);
    expect(canViewSuppliersRole("Store Keeper")).toBe(true);
    expect(canViewSuppliersRole("Admin")).toBe(true);
    expect(canViewSuppliersRole("Manager")).toBe(true);
  });

  it("allows manager secondary admin access", () => {
    expect(canManageStaffRole("Manager")).toBe(true);
    expect(canManageOfficeRole("Manager")).toBe(true);
    expect(canViewAuditLogRole("Manager")).toBe(true);
    expect(canManageReportsRole("Manager")).toBe(false);
    expect(canManageBusinessRole("Manager")).toBe(false);
    expect(canManageProductsRole("Manager")).toBe(true);
    expect(canDeleteRole("Manager")).toBe(true);
  });
});
