import { useAuth } from "../contexts/AuthContext";
import {
  canDeleteRole,
  canManageBusinessRole,
  canManageCustomersRole,
  canManageOfficeRole,
  canManageProductsRole,
  canManagePurchasesRole,
  canManageReportsRole,
  canManageSalesRole,
  canManageStaffRole,
  canManageSuppliersRole,
  canViewAuditLogRole,
  canViewSuppliersRole,
  canWriteRole,
  isManagerRole,
  isSuperAdminRole,
  isViewerRole,
} from "../lib/permissions";
import type { UserRole } from "../types";

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? null) as UserRole | null;

  return {
    role,
    isAdmin: isSuperAdminRole(role),
    isManager: isManagerRole(role),
    isViewer: isViewerRole(role),
    isCashier: role === "Cashier",
    isStoreKeeper: role === "Store Keeper",
    canWrite: canWriteRole(role),
    canDelete: canDeleteRole(role),
    canManageProducts: canManageProductsRole(role),
    canManagePurchases: canManagePurchasesRole(role),
    canManageSales: canManageSalesRole(role),
    canManageCustomers: canManageCustomersRole(role),
    canManageSuppliers: canManageSuppliersRole(role),
    canManageBusiness: canManageBusinessRole(role),
    canManageReports: canManageReportsRole(role),
    canManageStaff: canManageStaffRole(role),
    canManageOffice: canManageOfficeRole(role),
    canViewAuditLog: canViewAuditLogRole(role),
    canViewSuppliers: canViewSuppliersRole(role),
  };
}
