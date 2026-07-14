import { Eye, Shield } from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";

const ROLE_GUIDANCE: Record<string, string> = {
  Viewer:
    "You can browse dashboards, products, sales, invoices, and people records, but cannot add, edit, delete, or restore data.",
  Cashier:
    "You can record sales and manage customers. Product, purchase, supplier, and settings changes are restricted to other roles.",
  "Store Keeper":
    "You can manage inventory, purchases, and suppliers. Customer payments and admin settings remain restricted where shown.",
};

export function ReadOnlyBanner() {
  const { role, isViewer } = usePermissions();
  if (!role) return null;

  if (isViewer) {
    return (
      <div
        className="mb-5 flex items-center gap-3 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 py-3 text-sm text-text-primary"
        role="status"
      >
        <Eye className="h-4 w-4 shrink-0 text-accent-blue" aria-hidden="true" />
        <div>
          <p className="font-medium">Read-only mode ({role})</p>
          <p className="text-xs text-text-secondary">{ROLE_GUIDANCE.Viewer}</p>
        </div>
      </div>
    );
  }

  const guidance = ROLE_GUIDANCE[role];
  if (!guidance) return null;

  return (
    <div
      className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-primary"
      role="status"
    >
      <Shield className="h-4 w-4 shrink-0 text-accent-purple" aria-hidden="true" />
      <div>
        <p className="font-medium">Signed in as {role}</p>
        <p className="text-xs text-text-secondary">{guidance}</p>
      </div>
    </div>
  );
}
