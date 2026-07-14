import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cardClass } from "../lib/constants";

interface AccessRestrictedProps {
  title?: string;
  description: ReactNode;
  className?: string;
}

export function AccessRestricted({
  title = "Access Restricted",
  description,
  className = "",
}: AccessRestrictedProps) {
  return (
    <div
      className={`${cardClass} flex min-h-[400px] flex-col items-center justify-center p-12 text-center ${className}`}
    >
      <Lock className="mb-4 h-12 w-12 text-accent-orange" />
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-text-secondary">{description}</p>
    </div>
  );
}
