import type { LucideIcon } from "lucide-react";

interface SidebarButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  color: { icon: string; bg: string; bgMuted: string };
  onClick: () => void;
}

export function SidebarButton({
  icon: Icon,
  label,
  active,
  color,
  onClick,
}: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
          active ? `${color.bg} shadow-lg` : color.bgMuted
        }`}
      >
        <Icon
          className={`h-4 w-4 transition-transform duration-200 group-hover:scale-125 ${
            active ? "text-white" : color.icon
          }`}
        />
      </div>
      <span
        className={`max-w-full whitespace-nowrap px-0.5 text-center text-[10px] font-medium leading-tight ${
          active ? color.icon : "text-text-muted"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
