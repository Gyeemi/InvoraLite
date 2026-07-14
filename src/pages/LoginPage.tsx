import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login, business, getLoginLockoutStatus } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const lockout = await getLoginLockoutStatus(identifier);
    if (lockout?.locked) {
      const minutes = Math.max(1, Math.ceil((lockout.remainingSeconds ?? 0) / 60));
      setError(`Account locked after too many failed attempts. Try again in about ${minutes} minute(s).`);
      return;
    }
    const ok = await login(identifier, password);
    if (!ok) {
      const afterFailure = await getLoginLockoutStatus(identifier);
      if (afterFailure?.locked) {
        const minutes = Math.max(1, Math.ceil((afterFailure.remainingSeconds ?? 0) / 60));
        setError(`Account locked. Try again in about ${minutes} minute(s).`);
        return;
      }
      setError("Incorrect email, username, or password.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-main p-6">
      <ThemeToggle floating />
      <div className="w-full max-w-md flex-1 flex flex-col justify-center">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-bg-card ring-1 ring-border/60">
            <AppIcon className="h-11 w-11" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">InvoraLite</h1>
          {business?.businessName && (
            <p className="text-sm font-medium text-text-secondary">{business.businessName}</p>
          )}
          <p className="text-sm text-text-secondary">Sign in to your inventory dashboard</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-border bg-bg-card p-8 shadow-lg shadow-black/20"
        >
          {error && (
            <div className="mb-4 rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Email or Username
            </label>
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter email or username"
              required
              autoComplete="username"
              className="w-full rounded-xl border border-border bg-bg-main px-4 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-blue"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-bg-main px-4 py-2.5 pr-10 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-blue"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-blue/25 transition-colors hover:bg-accent-blue/90"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
