import { lazy, Suspense } from "react";
import { useNavigation } from "../contexts/NavigationContext";
import { PanelLoadingFallback } from "../components/PanelLoadingFallback";
import { DashboardPage } from "./DashboardPage";
import { InvoicePage } from "./InvoicePage";
import { PeoplePage } from "./PeoplePage";
import { ProductsPage } from "./ProductsPage";
import { PurchasePage } from "./PurchasePage";
import { RateMasterPage } from "./RateMasterPage";
import { SettingsPage } from "./SettingsPage";

const AnalyticsPage = lazy(() =>
  import("./AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })),
);

export function PageRouter() {
  const { currentPage } = useNavigation();

  switch (currentPage) {
    case "dashboard":
      return <DashboardPage />;
    case "products":
      return <ProductsPage />;
    case "purchase":
      return <PurchasePage />;
    case "people":
      return <PeoplePage />;
    case "analytics":
      return (
        <Suspense fallback={<PanelLoadingFallback />}>
          <AnalyticsPage />
        </Suspense>
      );
    case "invoice":
      return <InvoicePage />;
    case "rate-master":
      return <RateMasterPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}
