import { useEffect, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { ThemeToggle } from "../components/ThemeToggle";

interface LoadingPageProps {
  ready: boolean;
  onComplete: () => void;
}

const MIN_DISPLAY_MS = 1800;

export function LoadingPage({ ready, onComplete }: LoadingPageProps) {
  const [progress, setProgress] = useState(0);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const start = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;

      if (!ready) {
        const elapsed = now - start;
        const eased = 90 * (1 - Math.exp(-elapsed / 1200));
        setProgress((prev) => Math.max(prev, Math.min(90, eased)));
      } else {
        setProgress((prev) => {
          if (prev >= 100) return 100;
          const next = prev + (100 - prev) * 0.14;
          return next >= 99.5 ? 100 : next;
        });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !minTimeElapsed || progress < 100) return;
    const timer = window.setTimeout(onComplete, 350);
    return () => window.clearTimeout(timer);
  }, [ready, minTimeElapsed, progress, onComplete]);

  const displayPercent = Math.round(progress);
  const ringRadius = 54;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-main px-6">
      <ThemeToggle floating />
      <div className="flex flex-col items-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-bg-card ring-1 ring-border/60">
          <AppIcon className="h-14 w-14" />
        </div>

        <h1 className="loading-page__title mb-10 text-3xl font-bold tracking-tight">InvoraLite</h1>

        <div className="relative mb-6 flex h-36 w-36 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
            <circle
              cx="64"
              cy="64"
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="6"
            />
            <circle
              cx="64"
              cy="64"
              r={ringRadius}
              fill="none"
              stroke="url(#loading-neon-gradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              className="loading-page__ring"
            />
            <defs>
              <linearGradient id="loading-neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00F5FF" />
                <stop offset="25%" stopColor="#4D7CFE" />
                <stop offset="50%" stopColor="#A855F7" />
                <stop offset="75%" stopColor="#FF2BD6" />
                <stop offset="100%" stopColor="#39FF14" />
              </linearGradient>
            </defs>
          </svg>

          <span className="loading-page__percent text-4xl font-bold tabular-nums">{displayPercent}%</span>
        </div>

        <div className="w-64">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="loading-page__bar h-full rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="mt-6 text-sm text-text-secondary">
          {progress < 100 ? "Preparing your workspace…" : "Welcome back"}
        </p>
      </div>
    </div>
  );
}
