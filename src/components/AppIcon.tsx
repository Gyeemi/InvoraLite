interface AppIconProps {
  className?: string;
}

export function AppIcon({ className = "h-5 w-5" }: AppIconProps) {
  return <img src="/icon.svg" alt="" className={className} aria-hidden="true" />;
}
