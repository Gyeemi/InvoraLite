interface UserAvatarProps {
  src?: string;
  name: string;
  className?: string;
}

export function UserAvatar({ src, name, className = "h-9 w-9" }: UserAvatarProps) {
  return (
    <img
      src={src}
      alt=""
      className={`rounded-full border border-border object-cover ${className}`}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.dataset.fallbackApplied === "true") return;
        img.dataset.fallbackApplied = "true";
        img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
      }}
    />
  );
}
