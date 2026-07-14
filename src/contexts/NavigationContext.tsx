import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PageId, Sale } from "../types";

interface NavigationContextValue {
  currentPage: PageId;
  invoicePreview: Sale | null;
  navigate: (page: PageId) => void;
  openInvoicePreview: (sale: Sale) => void;
  clearInvoicePreview: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<PageId>("dashboard");
  const [invoicePreview, setInvoicePreview] = useState<Sale | null>(null);

  const navigate = useCallback((page: PageId) => {
    setCurrentPage(page);
    if (page !== "invoice") setInvoicePreview(null);
  }, []);

  const openInvoicePreview = useCallback((sale: Sale) => {
    setInvoicePreview(sale);
    setCurrentPage("invoice");
  }, []);

  const clearInvoicePreview = useCallback(() => setInvoicePreview(null), []);

  const value = useMemo(
    () => ({
      currentPage,
      invoicePreview,
      navigate,
      openInvoicePreview,
      clearInvoicePreview,
    }),
    [currentPage, invoicePreview, navigate, openInvoicePreview, clearInvoicePreview],
  );

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
