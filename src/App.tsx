import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { checkDatabaseHealth, ensureDatabaseOpen } from "./lib/database";
import { getLicenseStatus, hasLicenseApi } from "./lib/license";
import type { LicenseStatus } from "./types";
import { LicenseGate } from "./pages/LicenseGate";
import { LoginPage } from "./pages/LoginPage";
import { LoadingPage } from "./pages/LoadingPage";
import { SetupPage } from "./pages/SetupPage";
import { MainLayout } from "./components/layout/MainLayout";
import { Footer } from "./components/layout/Footer";

function RootApp() {
  const { isAuthenticated, isSetupComplete, loading } = useAuth();
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(hasLicenseApi());
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    void (async () => {
      await ensureDatabaseOpen();
      const status = await getLicenseStatus();
      setLicense(status);
      setLicenseLoading(false);
      const report = await checkDatabaseHealth();
      if (report && !report.healthy) {
        console.warn("[InvoraLite] Database health check:", report.message ?? "unhealthy");
      }
    })();
  }, []);

  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  const dataReady = !loading && !licenseLoading && license !== null;
  const showSplash = !splashDone;

  if (showSplash) {
    return <LoadingPage ready={dataReady} onComplete={handleSplashComplete} />;
  }

  return (
    <>
      {hasLicenseApi() && !license!.licensed ? (
        <LicenseGate status={license!} onActivated={() => void getLicenseStatus().then(setLicense)} />
      ) : !isSetupComplete ? (
        <SetupPage />
      ) : !isAuthenticated ? (
        <LoginPage />
      ) : (
        <MainLayout />
      )}
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RootApp />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
