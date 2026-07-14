import { ErrorBoundary } from "../ErrorBoundary";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { ReadOnlyBanner } from "../ReadOnlyBanner";
import { NavigationProvider } from "../../contexts/NavigationContext";
import { PageRouter } from "../../pages/PageRouter";
import { appContentMinWidthClass } from "../../lib/constants";

export function MainLayout() {
  return (
    <NavigationProvider>
      <div className="flex h-screen overflow-hidden bg-bg-main">
        <div className="w-[92px] shrink-0" aria-hidden="true" />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
          <div className={`flex min-h-full w-full flex-1 flex-col ${appContentMinWidthClass}`}>
            <Header />
            <main className="min-h-0 flex-1 p-6 pb-12">
              <ReadOnlyBanner />
              <ErrorBoundary title="This page could not be loaded">
                <PageRouter />
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </div>
    </NavigationProvider>
  );
}
