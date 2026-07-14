import { UserCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PasswordInput } from "./PasswordInput";
import { SaveButton } from "./SaveButton";
import { useAuth } from "../contexts/AuthContext";
import { inputClass, labelClass } from "../lib/constants";

interface MyAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function MyAccountModal({ open, onClose }: MyAccountModalProps) {
  const { user, updateOwnAccount } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name);
    setUsername(user.username);
    setEmail(user.email);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  }, [open, user]);

  if (!open || !user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword.trim()) {
      setError("Enter your current password to save changes.");
      return;
    }

    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match.");
        return;
      }
    }

    setSaving(true);
    try {
      const result = await updateOwnAccount(
        {
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          newPassword: newPassword.trim() || undefined,
        },
        currentPassword,
      );

      if (!result.success) {
        setError(result.error ?? "Could not update your account.");
        return;
      }

      setMessage("Your account was updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-accent-blue" />
            <h3 className="text-lg font-semibold text-text-primary">My Account</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-text-secondary">
          Update your display name, username, email, or password. Your role ({user.role}) can only
          be changed by an administrator.
        </p>

        {message && (
          <div className="mb-4 rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="myAccountName">
              Display name
            </label>
            <input
              id="myAccountName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="myAccountUsername">
              Username
            </label>
            <input
              id="myAccountUsername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="myAccountEmail">
              Email
            </label>
            <input
              id="myAccountEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
              required
            />
          </div>

          <div className="rounded-xl border border-border bg-bg-main/60 p-4">
            <p className="mb-3 text-sm font-medium text-text-primary">Change password (optional)</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="myAccountNewPassword">
                  New password
                </label>
                <PasswordInput
                  id="myAccountNewPassword"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="myAccountConfirmPassword">
                  Confirm new password
                </label>
                <PasswordInput
                  id="myAccountConfirmPassword"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="myAccountCurrentPassword">
              Current password
            </label>
            <PasswordInput
              id="myAccountCurrentPassword"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />
            <p className="mt-1 text-xs text-text-muted">
              Required to confirm any profile or password changes.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <SaveButton saving={saving} label="Save Changes" className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
