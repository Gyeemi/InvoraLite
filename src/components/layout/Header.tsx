import { ChevronDown, Camera, Download, KeyRound, LogOut, Settings, Upload, UserCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "../AppIcon";
import { BackupPasswordDialog } from "../BackupPasswordDialog";
import { LicenseManageModal } from "../LicenseManageModal";
import { LicenseValidModal } from "../LicenseValidModal";
import { MyAccountModal } from "../MyAccountModal";
import { PasswordConfirmDialog } from "../PasswordConfirmDialog";
import { UserAvatar } from "../UserAvatar";
import { ThemeToggle } from "../ThemeToggle";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { usePermissions } from "../../hooks/usePermissions";
import { fileToAvatarDataUrl } from "../../lib/avatars";
import { exportDatabase, hasDatabaseBackupApi, restoreDatabase, restoreDatabaseFromSource } from "../../lib/backup";
import { formatDateGB } from "../../lib/constants";
import { getLicenseStatus, hasLicenseApi } from "../../lib/license";
import type { LicenseStatus } from "../../types";

export function Header() {
  const { business, user, logout, updateUserAvatar, verifyPassword } = useAuth();
  const { canWrite, isAdmin } = usePermissions();
  const { showSuccess, showError } = useToast();
  const { navigate } = useNavigation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseValidOpen, setLicenseValidOpen] = useState(false);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [dbMessage, setDbMessage] = useState("");
  const [dbError, setDbError] = useState("");
  const [dbBusy, setDbBusy] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [exportPasswordOpen, setExportPasswordOpen] = useState(false);
  const [restoreBackupPasswordOpen, setRestoreBackupPasswordOpen] = useState(false);
  const [pendingRestoreSource, setPendingRestoreSource] = useState<string | null>(null);
  const [myAccountOpen, setMyAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const isAdminUser = isAdmin;

  useEffect(() => {
    if (!hasLicenseApi()) {
      void getLicenseStatus().then(setLicense);
      return;
    }
    void getLicenseStatus().then(setLicense);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function refreshLicense() {
    if (!hasLicenseApi()) return;
    setLicense(await getLicenseStatus());
  }

  async function handleManageLicense() {
    setMenuOpen(false);
    const current = await getLicenseStatus();
    setLicense(current);

    if (current.licensed && current.trial !== true && current.expiresAt) {
      setLicenseValidOpen(true);
      return;
    }

    setLicenseModalOpen(true);
  }

  async function handleAvatarChange(file: File | null) {
    if (!file) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await updateUserAvatar(dataUrl);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Could not update profile photo.");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  }

  function handleExportDatabase() {
    if (!hasDatabaseBackupApi()) return;
    setDbError("");
    setDbMessage("");
    setMenuOpen(false);
    setExportPasswordOpen(true);
  }

  async function confirmExportDatabase(backupPassword: string): Promise<boolean> {
    setDbBusy(true);
    try {
      const result = await exportDatabase(business?.businessName, backupPassword);
      if (!result.success) {
        if (result.error !== "Export cancelled.") {
          setDbError(result.error ?? "Could not export database.");
          showError("Database export failed", result.error ?? undefined);
        }
        return false;
      }
      const path = result.path ?? "encrypted backup file";
      setDbMessage(`Encrypted database exported to ${path}.`);
      showSuccess("Encrypted backup exported", path);
      return true;
    } catch (error) {
      setDbError(error instanceof Error ? error.message : "Could not export database.");
      return false;
    } finally {
      setDbBusy(false);
    }
  }

  function handleRestoreDatabase() {
    if (!hasDatabaseBackupApi()) return;
    setMenuOpen(false);
    setDbError("");
    setDbMessage("");
    setRestoreConfirmOpen(true);
  }

  async function confirmRestoreDatabase(password: string): Promise<boolean> {
    const valid = await verifyPassword(password);
    if (!valid) return false;

    setDbBusy(true);
    try {
      const result = await restoreDatabase();
      if (result.error === "BACKUP_PASSWORD_REQUIRED" && result.source) {
        setPendingRestoreSource(result.source);
        setRestoreBackupPasswordOpen(true);
        return true;
      }
      if (!result.success) {
        if (result.error !== "Restore cancelled.") {
          setDbError(result.error ?? "Could not restore database.");
        }
        return true;
      }
      return true;
    } catch (error) {
      setDbError(error instanceof Error ? error.message : "Could not restore database.");
      return true;
    } finally {
      setDbBusy(false);
    }
  }

  async function confirmRestoreBackupPassword(backupPassword: string): Promise<boolean> {
    if (!pendingRestoreSource) return false;
    setDbBusy(true);
    try {
      const result = await restoreDatabaseFromSource(pendingRestoreSource, backupPassword);
      if (!result.success) {
        setDbError(result.error ?? "Could not restore database.");
        showError("Database restore failed", result.error ?? undefined);
        return false;
      }
      setPendingRestoreSource(null);
      return true;
    } catch (error) {
      setDbError(error instanceof Error ? error.message : "Could not restore database.");
      return false;
    } finally {
      setDbBusy(false);
    }
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between whitespace-nowrap border-b border-border bg-bg-main px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-card ring-1 ring-border/60">
              <AppIcon className="h-7 w-7" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-primary">
              {business?.businessName ?? "Invora"}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">
            Hello! <span className="font-normal text-text-secondary">{today}</span>
          </h1>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex items-center gap-3 rounded-xl bg-bg-card px-3 py-1.5 transition-colors hover:bg-bg-hover ${
                menuOpen ? "ring-1 ring-accent-blue/40" : ""
              }`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className="text-right">
                <p className="text-sm font-medium text-text-primary">{user.name}</p>
                <p className="text-xs text-text-muted">{user.role}</p>
              </div>
              <UserAvatar src={user.avatar} name={user.username} />
              <ChevronDown
                className={`hidden h-4 w-4 text-text-muted transition-transform sm:block ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl shadow-black/30">
                <div className="border-b border-border/60 px-4 py-4">
                  <div className="flex items-center gap-3">
                    {canWrite ? (
                      <button
                        type="button"
                        disabled={avatarUploading}
                        onClick={() => avatarInputRef.current?.click()}
                        className="group relative shrink-0 disabled:opacity-60"
                        title="Change profile photo"
                      >
                        <UserAvatar src={user.avatar} name={user.username} className="h-11 w-11" />
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                          <Camera className="h-4 w-4 text-white" />
                        </span>
                      </button>
                    ) : (
                      <UserAvatar src={user.avatar} name={user.username} className="h-11 w-11" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{user.name}</p>
                      <p className="text-xs text-accent-blue">{user.role}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-text-secondary">
                    <p>
                      <span className="text-text-muted">Username:</span> {user.username}
                    </p>
                    {user.email && (
                      <p className="truncate">
                        <span className="text-text-muted">Email:</span> {user.email}
                      </p>
                    )}
                    {business?.businessName && (
                      <p className="truncate">
                        <span className="text-text-muted">Business:</span> {business.businessName}
                      </p>
                    )}
                    {license?.licensed && license.expiresAt && (
                      <p className="truncate">
                        <span className="text-text-muted">Licence:</span>{" "}
                        {formatDateGB(license.expiresAt)}
                        {license.daysRemaining !== undefined && license.daysRemaining <= 30
                          ? ` (${license.daysRemaining} days left)`
                          : ""}
                      </p>
                    )}
                    {license?.trial && license.daysRemaining !== undefined && (
                      <p>
                        <span className="text-text-muted">Trial:</span> {license.daysRemaining} days
                        remaining
                      </p>
                    )}
                  </div>
                  {avatarError && (
                    <p className="mt-2 text-xs text-accent-red">{avatarError}</p>
                  )}
                  {avatarUploading && (
                    <p className="mt-2 text-xs text-text-muted">Updating photo…</p>
                  )}
                  {dbMessage && (
                    <p className="mt-2 text-xs text-accent-green">{dbMessage}</p>
                  )}
                  {dbError && (
                    <p className="mt-2 text-xs text-accent-red">{dbError}</p>
                  )}
                </div>

                {canWrite && (
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
                  />
                )}

                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setMyAccountOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
                  >
                    <UserCircle className="h-4 w-4 text-text-muted" />
                    My Account
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                    >
                      <Camera className="h-4 w-4 text-text-muted" />
                      Change profile photo
                    </button>
                  )}
                  {isAdminUser && hasDatabaseBackupApi() && (
                    <>
                      <button
                        type="button"
                        disabled={dbBusy}
                        onClick={() => void handleExportDatabase()}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                      >
                        <Download className="h-4 w-4 text-text-muted" />
                        Export Encrypted Backup
                      </button>
                      <button
                        type="button"
                        disabled={dbBusy}
                        onClick={handleRestoreDatabase}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                      >
                        <Upload className="h-4 w-4 text-text-muted" />
                        Restore Database
                      </button>
                    </>
                  )}
                  {isAdminUser && (
                    <button
                      type="button"
                      onClick={() => void handleManageLicense()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
                    >
                      <KeyRound className="h-4 w-4 text-text-muted" />
                      Manage Licence Key
                    </button>
                  )}
                  {isAdminUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("settings");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
                    >
                      <Settings className="h-4 w-4 text-text-muted" />
                      Manage
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-accent-red transition-colors hover:bg-accent-red/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </header>

      <LicenseValidModal
        open={licenseValidOpen}
        onClose={() => setLicenseValidOpen(false)}
        expiresAt={license?.expiresAt ?? ""}
        customerName={license?.customerName}
      />

      <LicenseManageModal
        open={licenseModalOpen}
        onClose={() => setLicenseModalOpen(false)}
        onUpdated={() => void refreshLicense()}
      />

      <PasswordConfirmDialog
        open={restoreConfirmOpen}
        title="Restore database?"
        description="This replaces all current data on this computer with the selected backup. Enter your login password to continue. Password-protected backups will ask for the backup password next. The app will restart after restore."
        confirmLabel="Continue"
        onClose={() => setRestoreConfirmOpen(false)}
        onConfirm={confirmRestoreDatabase}
      />

      <BackupPasswordDialog
        open={exportPasswordOpen}
        title="Encrypt database backup"
        description="Choose a backup password. You will need this password to restore this backup on any computer. Store it safely — it cannot be recovered if lost."
        confirmLabel="Export Backup"
        onClose={() => setExportPasswordOpen(false)}
        onConfirm={confirmExportDatabase}
      />

      <BackupPasswordDialog
        open={restoreBackupPasswordOpen}
        title="Enter backup password"
        description="This backup file is encrypted. Enter the backup password that was set when it was exported."
        confirmLabel="Restore Backup"
        requireConfirmation={false}
        onClose={() => {
          setRestoreBackupPasswordOpen(false);
          setPendingRestoreSource(null);
        }}
        onConfirm={confirmRestoreBackupPassword}
      />

      <MyAccountModal open={myAccountOpen} onClose={() => setMyAccountOpen(false)} />
    </>
  );
}
