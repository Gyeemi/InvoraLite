import type { ReactNode } from "react";

interface RequirePermissionProps {
  allowed: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ allowed, children, fallback = null }: RequirePermissionProps) {
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

interface ReadOnlyHintProps {
  className?: string;
}

export function ReadOnlyHint({ className = "" }: ReadOnlyHintProps) {
  return <span className={`text-xs text-text-muted ${className}`.trim()}>Read-only access</span>;
}
