import { PlusCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { DashboardStats } from "../components/dashboard/DashboardStats";
import { NewSaleModal } from "../components/sales/NewSaleModal";
import { usePermissions } from "../hooks/usePermissions";
import { cardClass } from "../lib/constants";

export function DashboardPage() {
  const { user, business } = useAuth();
  const { canManageSales } = usePermissions();
  const [showSale, setShowSale] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <div className="space-y-5">
        <div
          className={`${cardClass} flex flex-col items-center justify-center p-8 text-center sm:p-10`}
        >
          <h2 className="text-xl font-semibold text-text-primary">
            Welcome back, {user?.name ?? "there"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            {business?.businessName
              ? `You're managing ${business.businessName}. Use the sidebar to navigate products, purchases, and more.`
              : "Use the sidebar to manage your inventory."}
          </p>
          {canManageSales && (
            <button
              type="button"
              onClick={() => setShowSale(true)}
              className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-blue/25 transition-colors hover:bg-accent-blue/90"
            >
              <PlusCircle className="h-4 w-4" />
              New Sales
            </button>
          )}
          <p className="mt-4 text-xs text-text-muted">
            View sales and earnings insights in <strong className="text-text-secondary">Sales Insights</strong>.
          </p>
        </div>

        <DashboardStats refreshKey={refreshKey} />
      </div>

      {showSale && (
        <NewSaleModal
          onClose={() => setShowSale(false)}
          onComplete={() => {
            setShowSale(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
