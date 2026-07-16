import { useEffect, useState } from "react";

const NEON_DURATION_MS = 4000;
const NEON_INTERVAL_MS = 30_000;

export function Footer() {
  const [neonActive, setNeonActive] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;

    const triggerNeon = () => {
      setNeonActive(false);
      window.requestAnimationFrame(() => {
        setNeonActive(true);
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => setNeonActive(false), NEON_DURATION_MS);
      });
    };

    triggerNeon();
    const intervalId = window.setInterval(triggerNeon, NEON_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <p className="pointer-events-none fixed bottom-4 left-0 right-0 z-50 text-center text-xs">
      <span className="relative inline-block">
        <span className="text-text-muted">
          InvoraLite v.1.0.3  | © Baraily Innovations, 2026 | +975 176 06 130
        </span>
        <span
          aria-hidden
          className={`footer-text-neon-overlay${
            neonActive ? " footer-text-neon-overlay--active" : ""
          }`}
        >
          InvoraLite v.1.0.3  | © Baraily Innovations, 2026 | +975 176 06 130
        </span>
      </span>
    </p>
  );
}