import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { cardClass } from "../lib/constants";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary caught:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.props.title ?? "Something went wrong";
    const message = this.state.error?.message || "An unexpected error occurred while loading this page.";

    return (
      <div className={`${cardClass} mx-auto max-w-xl p-8 text-center`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-red/15 text-accent-red">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-2 text-sm text-text-secondary">{message}</p>
        <p className="mt-1 text-xs text-text-muted">
          Your data is stored locally. Try again or reload the app if the problem continues.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover"
          >
            <RefreshCw className="h-4 w-4" />
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
