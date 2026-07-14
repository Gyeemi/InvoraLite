import type { ButtonHTMLAttributes } from "react";

type SaveButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  saving?: boolean;
  savingLabel?: string;
  label: string;
  variant?: "primary" | "green" | "blue";
};

const variantClass: Record<NonNullable<SaveButtonProps["variant"]>, string> = {
  primary: "bg-accent-blue hover:bg-accent-blue/90",
  green: "bg-accent-green hover:bg-accent-green/90",
  blue: "bg-accent-blue hover:bg-accent-blue/90",
};

export function SaveButton({
  saving = false,
  savingLabel = "Saving…",
  label,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: SaveButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || saving}
      className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${className}`}
      {...props}
    >
      {saving ? savingLabel : label}
    </button>
  );
}
