export function PanelLoadingFallback() {
  return (
    <div
      className="flex items-center justify-center py-16 text-sm text-text-muted"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
