import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  message: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, options?: { description?: string; variant?: ToastVariant }) => void;
  showSuccess: (message: string, description?: string) => void;
  showError: (message: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

const variantStyles: Record<ToastVariant, { container: string; icon: string }> = {
  success: {
    container: "border-accent-green/40 bg-bg-card",
    icon: "text-accent-green",
  },
  error: {
    container: "border-accent-red/40 bg-bg-card",
    icon: "text-accent-red",
  },
  info: {
    container: "border-accent-blue/40 bg-bg-card",
    icon: "text-accent-blue",
  },
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const className = `h-5 w-5 shrink-0 ${variantStyles[variant].icon}`;
  if (variant === "success") return <CheckCircle2 className={className} aria-hidden="true" />;
  if (variant === "error") return <AlertCircle className={className} aria-hidden="true" />;
  return <Info className={className} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: { description?: string; variant?: ToastVariant }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: ToastItem = {
        id,
        message,
        description: options?.description,
        variant: options?.variant ?? "info",
      };
      setToasts((current) => [...current, toast]);
      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      showSuccess: (message, description) => showToast(message, { description, variant: "success" }),
      showError: (message, description) => showToast(message, { description, variant: "error" }),
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg ${variantStyles[toast.variant].container}`}
          >
            <ToastIcon variant={toast.variant} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{toast.message}</p>
              {toast.description && (
                <p className="mt-1 text-xs text-text-secondary">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
