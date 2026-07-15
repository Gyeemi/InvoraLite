import { Building2, BarChart3, Key, Pencil, Receipt, ScrollText, Shield, Trash2, Users, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { ManageOfficePanel } from "../components/ManageOfficePanel";
import { PanelLoadingFallback } from "../components/PanelLoadingFallback";
import { PasswordConfirmDialog } from "../components/PasswordConfirmDialog";
import { PasswordInput } from "../components/PasswordInput";
import { SoftwareUpdatesCard } from "../components/SoftwareUpdatesCard";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { SaveButton } from "../components/SaveButton";
import { getStaff, nextId, saveStaff, ensureStaffSeed } from "../lib/data";
import { hashPassword } from "../lib/password";
import { getBusinessValidationError, normalizeBusiness } from "../lib/businessValidation";
import {
  fiscalStartMonthInputValue,
  monthFromMonthInputValue,
  normalizeFiscalYearStartMonth,
} from "../lib/accounting";
import { passwordComplexityMessage, validatePasswordComplexity } from "../lib/passwordPolicy";
import { ALL_ROLES, cardClass, inputClass, labelClass } from "../lib/constants";
import type { Business, StaffMember, UserRole } from "../types";

const ReportsAnalyticsPanel = lazy(() =>
  import("../components/ReportsAnalyticsPanel").then((module) => ({
    default: module.ReportsAnalyticsPanel,
  })),
);

const AuditLogPanel = lazy(() =>
  import("../components/AuditLogPanel").then((module) => ({ default: module.AuditLogPanel })),
);

const ASSIGNABLE_ROLES = ALL_ROLES.filter((role) => role !== "Admin");

type ManageTab = "roles" | "business" | "office" | "reports" | "audit";

const MANAGER_TOOL_TABS: ManageTab[] = ["roles", "office", "audit"];

function roleBadgeClass(owner: boolean, role: UserRole) {
  if (owner) return "bg-accent-blue text-white";
  if (role === "Admin") return "bg-accent-blue/15 text-accent-blue";
  if (role === "Manager") return "bg-accent-purple/15 text-accent-purple";
  return "bg-bg-hover text-text-secondary";
}

function ManageTabButton({
  active,
  onClick,
  icon,
  label,
  tabId,
  panelId,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "text-accent-blue" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingsModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function matchesOwnerAccount(member: StaffMember, business: Business) {
  return (
    member.username.trim().toLowerCase() === business.username.trim().toLowerCase() ||
    (!!member.email.trim() &&
      !!business.email.trim() &&
      member.email.trim().toLowerCase() === business.email.trim().toLowerCase())
  );
}

function superAdminFromBusiness(business: Business, staff: StaffMember[]): StaffMember {
  const existing = staff.find((member) => matchesOwnerAccount(member, business));
  return (
    existing ?? {
      id: "__super_admin__",
      name: business.username,
      username: business.username,
      email: business.email,
      role: "Admin",
      password: business.password,
    }
  );
}

export function SettingsPage() {
  const { business, user, updateBusiness, updateUserName, verifyPassword } = useAuth();
  const { canManageBusiness, canManageStaff, canManageOffice, canViewAuditLog, canManageReports } =
    usePermissions();
  const [tab, setTab] = useState<ManageTab>("business");
  const [savingBusiness, setSavingBusiness] = useState(false);

  const [form, setForm] = useState({
    businessName: business?.businessName ?? "",
    licenseNo: business?.licenseNo ?? "",
    tpnNo: business?.tpnNo ?? "",
    address: business?.address ?? "",
    phone: business?.phone ?? "",
    email: business?.email ?? "",
    hasGst: business?.hasGst ?? false,
    gstRegistrationNo: business?.gstRegistrationNo ?? "",
    fiscalYearStartMonth: normalizeFiscalYearStartMonth(business?.fiscalYearStartMonth),
    password: "",
  });
  const [message, setMessage] = useState("");
  const [businessError, setBusinessError] = useState("");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [userMessage, setUserMessage] = useState("");
  const [userError, setUserError] = useState("");

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addStaffPasswordOpen, setAddStaffPasswordOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);

  const [userForm, setUserForm] = useState({
    name: "",
    username: "",
    email: "",
    role: "Cashier" as UserRole,
    password: "",
  });
  const [editName, setEditName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNameSave, setConfirmNameSave] = useState(false);
  const [confirmPasswordSave, setConfirmPasswordSave] = useState(false);
  const [businessUnlocked, setBusinessUnlocked] = useState(false);
  const [businessPasswordOpen, setBusinessPasswordOpen] = useState(false);

  useEffect(() => {
    if (!canManageStaff || !business) return;
    void (async () => {
      await ensureStaffSeed(business);
      setStaff(await getStaff());
    })();
  }, [canManageStaff, business]);

  useEffect(() => {
    if (!canManageStaff && MANAGER_TOOL_TABS.includes(tab)) {
      setTab("business");
    }
    if (!canManageReports && tab === "reports") {
      setTab("business");
    }
  }, [canManageStaff, canManageReports, tab]);

  useEffect(() => {
    if (canManageStaff) setTab("roles");
  }, [canManageStaff]);

  useEffect(() => {
    if (tab !== "business") {
      setBusinessUnlocked(false);
      setBusinessPasswordOpen(false);
    } else if (!businessUnlocked) {
      setBusinessPasswordOpen(true);
    }
  }, [tab, businessUnlocked]);

  function isOwnerAccount(member: StaffMember): boolean {
    if (!business) return false;
    return matchesOwnerAccount(member, business);
  }

  const displayStaff = useMemo(() => {
    if (!business) return staff;
    const superAdmin = superAdminFromBusiness(business, staff);
    const others = staff.filter((member) => !matchesOwnerAccount(member, business));
    return [superAdmin, ...others];
  }, [business, staff]);

  async function persistStaff(next: StaffMember[]) {
    await saveStaff(next);
    setStaff(next);
  }

  useEffect(() => {
    if (!business) return;
    setForm({
      businessName: business.businessName,
      licenseNo: business.licenseNo,
      tpnNo: business.tpnNo,
      address: business.address,
      phone: business.phone,
      email: business.email,
      hasGst: business.hasGst,
      gstRegistrationNo: business.gstRegistrationNo,
      fiscalYearStartMonth: normalizeFiscalYearStartMonth(business.fiscalYearStartMonth),
      password: "",
    });
  }, [business]);

  async function handleBusinessPasswordConfirm(password: string): Promise<boolean> {
    const ok = await verifyPassword(password);
    if (ok) {
      setBusinessUnlocked(true);
      setBusinessPasswordOpen(false);
    }
    return ok;
  }

  async function handleAddStaffPasswordConfirm(password: string): Promise<boolean> {
    const ok = await verifyPassword(password);
    if (ok) {
      setAddStaffPasswordOpen(false);
      setShowAddStaff(true);
    }
    return ok;
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageBusiness || !business) return;
    setSavingBusiness(true);
    setMessage("");
    setBusinessError("");
    try {
      if (form.password.trim() && !validatePasswordComplexity(form.password)) {
        setBusinessError(passwordComplexityMessage());
        return;
      }

      const patch: Partial<Business> = {
        businessName: form.businessName,
        licenseNo: form.licenseNo,
        tpnNo: form.tpnNo,
        address: form.address,
        phone: form.phone,
        email: form.email,
        hasGst: form.hasGst,
        gstRegistrationNo: form.gstRegistrationNo,
        fiscalYearStartMonth: form.fiscalYearStartMonth,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      };

      const merged = normalizeBusiness({
        ...business,
        ...patch,
        password: patch.password ?? business.password,
      });
      const validationError = getBusinessValidationError(merged, false);
      if (validationError) {
        setBusinessError(validationError);
        return;
      }

      const ok = await updateBusiness(patch);
      if (ok) {
        setMessage("Business details saved successfully.");
        setForm((current) => ({ ...current, password: "" }));
      } else {
        setBusinessError("Could not save business details. Please try again.");
      }
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setUserError("");
    setUserMessage("");

    const name = userForm.name.trim();
    const username = userForm.username.trim();
    const email = userForm.email.trim();
    const password = userForm.password;

    if (!name || !username || !email) {
      setUserError("Name, username, and email are required.");
      return;
    }
    if (!validatePasswordComplexity(password)) {
      setUserError(passwordComplexityMessage());
      return;
    }
    if (
      staff.some((member) => member.username.trim().toLowerCase() === username.toLowerCase()) ||
      business?.username.trim().toLowerCase() === username.toLowerCase()
    ) {
      setUserError("This username is already in use.");
      return;
    }

    try {
      const member: StaffMember = {
        id: nextId("USR", staff),
        name,
        username,
        email,
        role: userForm.role,
        password: await hashPassword(password),
      };
      await persistStaff([...staff, member]);
      setUserForm({ name: "", username: "", email: "", role: "Cashier", password: "" });
      setShowAddStaff(false);
      setUserMessage(`${name} was added successfully.`);
    } catch {
      setUserError("Could not secure the password. Use the desktop app to add users.");
    }
  }

  async function handleRemoveUser(member: StaffMember) {
    if (isOwnerAccount(member)) return;
    await persistStaff(staff.filter((s) => s.id !== member.id));
    setUserMessage(`${member.name} was removed.`);
    setUserError("");
  }

  async function applyNameSave() {
    if (!editingMember || !business) return;
    const name = editName.trim();
    if (!name) return;

    if (isOwnerAccount(editingMember)) {
      const ownerInStaff = staff.find((member) => isOwnerAccount(member));
      if (ownerInStaff) {
        await persistStaff(
          staff.map((member) => (member.id === ownerInStaff.id ? { ...member, name } : member)),
        );
      } else {
        const member: StaffMember = {
          id: nextId("USR", staff),
          name,
          username: business.username,
          email: business.email,
          role: "Admin",
          password: business.password,
        };
        await persistStaff([...staff, member]);
      }
      if (
        user &&
        (user.username === business.username || user.email === business.email)
      ) {
        await updateUserName(name);
      }
    } else {
      const next = staff.map((s) => (s.id === editingMember.id ? { ...s, name } : s));
      await persistStaff(next);
      if (user?.username === editingMember.username) {
        await updateUserName(name);
      }
    }

    setEditingMember(null);
    setConfirmNameSave(false);
    setUserMessage("Name updated successfully.");
  }

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMember || !business) return;
    if (!editName.trim()) return;
    setConfirmNameSave(true);
  }

  async function handleConfirmNameSave(password: string) {
    const ok = await verifyPassword(password);
    if (!ok) return false;
    await applyNameSave();
    return true;
  }

  function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordMember || !business) return;
    if (newPassword.length < 4) {
      setUserError("Password must be at least 4 characters.");
      return;
    }
    setUserError("");
    setConfirmPasswordSave(true);
  }

  async function applyPasswordSave() {
    if (!passwordMember || !business) return;

    try {
      if (isOwnerAccount(passwordMember)) {
        const passwordHash = await hashPassword(newPassword);
        await updateBusiness({ password: passwordHash });
        const ownerInStaff = staff.find((member) => isOwnerAccount(member));
        if (ownerInStaff) {
          await persistStaff(
            staff.map((member) =>
              member.id === ownerInStaff.id ? { ...member, password: passwordHash } : member,
            ),
          );
        }
      } else {
        const passwordHash = await hashPassword(newPassword);
        await persistStaff(
          staff.map((member) =>
            member.id === passwordMember.id ? { ...member, password: passwordHash } : member,
          ),
        );
      }

      setPasswordMember(null);
      setNewPassword("");
      setUserMessage("Password updated successfully.");
      setUserError("");
    } catch {
      setUserError("Could not secure the password. Use the desktop app to change passwords.");
    }
  }

  async function handleConfirmPasswordSave(password: string) {
    const ok = await verifyPassword(password);
    if (!ok) return false;
    await applyPasswordSave();
    return true;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Manage</h2>
      </div>

      <div
        className="flex flex-wrap items-center border-b border-border"
        role="tablist"
        aria-label="Manage sections"
      >
        {canManageStaff && (
          <>
            <ManageTabButton
              tabId="manage-roles-tab"
              panelId="manage-roles-panel"
              active={tab === "roles"}
              onClick={() => setTab("roles")}
              icon={<Users className="h-4 w-4" />}
              label="Manage Roles"
            />
            <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
          </>
        )}
        <ManageTabButton
          tabId="manage-business-tab"
          panelId="manage-business-panel"
          active={tab === "business"}
          onClick={() => setTab("business")}
          icon={<Building2 className="h-4 w-4" />}
          label="Manage Business"
        />
        {(canManageOffice || canManageReports || canViewAuditLog) && (
          <>
            {canManageOffice && (
              <>
                <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <ManageTabButton
                  tabId="manage-office-tab"
                  panelId="manage-office-panel"
                  active={tab === "office"}
                  onClick={() => setTab("office")}
                  icon={<Receipt className="h-4 w-4" />}
                  label="Manage Office"
                />
              </>
            )}
            {canManageReports && (
              <>
                <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <ManageTabButton
                  tabId="manage-reports-tab"
                  panelId="manage-reports-panel"
                  active={tab === "reports"}
                  onClick={() => setTab("reports")}
                  icon={<BarChart3 className="h-4 w-4" />}
                  label="Accounting & Tax Reports"
                />
              </>
            )}
            {canViewAuditLog && (
              <>
                <div className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <ManageTabButton
                  tabId="manage-audit-tab"
                  panelId="manage-audit-panel"
                  active={tab === "audit"}
                  onClick={() => setTab("audit")}
                  icon={<ScrollText className="h-4 w-4" />}
                  label="Audit Log"
                />
              </>
            )}
          </>
        )}
      </div>

      {tab === "business" && (
        <div role="tabpanel" id="manage-business-panel" aria-labelledby="manage-business-tab">
          <PasswordConfirmDialog
            open={businessPasswordOpen && !businessUnlocked}
            title="Manage business"
            description="Enter your password to view and update business details."
            confirmLabel="Continue"
            onClose={() => setBusinessPasswordOpen(false)}
            onConfirm={handleBusinessPasswordConfirm}
          />

          {!businessUnlocked ? (
            <div className={`${cardClass} flex flex-col items-center gap-4 p-10 text-center`}>
              <div className="rounded-2xl bg-accent-blue/10 p-4 text-accent-blue">
                <Shield className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Business details are protected</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Confirm your password to view or change business information used on invoices and receipts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBusinessPasswordOpen(true)}
                className="rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90"
              >
                Enter password
              </button>
            </div>
          ) : (
            <>
          <p className="text-sm text-text-secondary">
            {canManageBusiness
              ? "Update business details used on invoices and receipts."
              : "View business details used on invoices and receipts."}
          </p>
          <form onSubmit={(e) => void handleSaveBusiness(e)} className={`${cardClass} space-y-4 p-6`}>
            <fieldset disabled={!canManageBusiness} className="space-y-4 disabled:opacity-80">
            {businessError && (
              <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {businessError}
              </div>
            )}
            {message && (
              <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
                {message}
              </div>
            )}

            <div>
              <label className={labelClass}>Business Name</label>
              <input
                value={form.businessName}
                onChange={(e) => {
                  setBusinessError("");
                  setMessage("");
                  setForm({ ...form, businessName: e.target.value });
                }}
                className={inputClass}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>License No.</label>
                <input
                  value={form.licenseNo}
                  onChange={(e) => setForm({ ...form, licenseNo: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>TPN No.</label>
                <input
                  value={form.tpnNo}
                  onChange={(e) => setForm({ ...form, tpnNo: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-bg-main px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">Enable GST</p>
                <p className="text-xs text-text-muted">Turn on if your business is registered for GST</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.hasGst}
                aria-label="Enable GST"
                onClick={() => {
                  setBusinessError("");
                  setMessage("");
                  setForm((current) => ({
                    ...current,
                    hasGst: !current.hasGst,
                    gstRegistrationNo: !current.hasGst ? current.gstRegistrationNo : "",
                  }));
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                  form.hasGst ? "bg-accent-blue" : "bg-border"
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    form.hasGst ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <div>
              <label
                htmlFor="settingsGstRegistrationNo"
                className={`${labelClass} ${form.hasGst ? "" : "text-text-muted"}`}
              >
                GST Registration No.
              </label>
              <input
                id="settingsGstRegistrationNo"
                value={form.gstRegistrationNo}
                onChange={(e) => setForm({ ...form, gstRegistrationNo: e.target.value })}
                placeholder={
                  form.hasGst
                    ? "Enter GST registration number"
                    : "Enable GST to enter registration number"
                }
                disabled={!form.hasGst}
                required={form.hasGst}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settingsFiscalYearStart" className={labelClass}>
                  Fiscal year starts
                </label>
                <input
                  id="settingsFiscalYearStart"
                  type="month"
                  value={fiscalStartMonthInputValue(form.fiscalYearStartMonth)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fiscalYearStartMonth: monthFromMonthInputValue(e.target.value),
                    })
                  }
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-text-muted">
                  Pick the first month of your fiscal year (e.g. July for Jul–Jun).
                </p>
              </div>
              <div>
                <label htmlFor="settingsFiscalYearCalendar" className={labelClass}>
                  Year option
                </label>
                <select
                  id="settingsFiscalYearCalendar"
                  value={form.fiscalYearStartMonth === 1 ? "calendar" : "custom"}
                  onChange={(e) => {
                    if (e.target.value === "calendar") {
                      setForm({ ...form, fiscalYearStartMonth: 1 });
                    }
                  }}
                  className={inputClass}
                >
                  <option value="calendar">Calendar year (January–December)</option>
                  <option value="custom">Custom fiscal year (use month picker)</option>
                </select>
                <p className="mt-1 text-xs text-text-muted">
                  Calendar year uses January; otherwise choose the start month above.
                </p>
              </div>
            </div>
            {canManageBusiness && (
              <div>
                <label className={labelClass}>New Password (optional)</label>
                <PasswordInput
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                  placeholder="Leave blank to keep current password"
                />
              </div>
            )}
            {canManageBusiness && (
            <SaveButton
              label="Save Business Details"
              saving={savingBusiness}
              className="px-5 py-2.5"
              variant="blue"
            />
            )}
            </fieldset>
          </form>
            </>
          )}
        </div>
      )}

      {tab === "roles" && canManageStaff && (
        <div
          role="tabpanel"
          id="manage-roles-panel"
          aria-labelledby="manage-roles-tab"
          className="space-y-6"
        >
          <p className="text-sm text-text-secondary">
            Add and remove staff with Manager, Store Keeper, Cashier, or Viewer roles.{" "}
            <span className="text-text-primary">{business?.email}</span> remains the super admin.
          </p>

          {userMessage && (
            <div className="rounded-xl bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
              {userMessage}
            </div>
          )}
          {userError && (
            <div className="rounded-xl bg-accent-red/10 px-4 py-3 text-sm text-accent-red">{userError}</div>
          )}

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-text-primary">Staff</h3>
              <button
                type="button"
                onClick={() => {
                  setUserError("");
                  setAddStaffPasswordOpen(true);
                }}
                className="rounded-xl border border-border bg-bg-hover px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-card"
              >
                Add Staff
              </button>
            </div>

            <div className="space-y-4">
            {displayStaff.length === 0 ? (
              <div className={`${cardClass} p-6 text-sm text-text-muted`}>No staff users added yet</div>
            ) : (
              displayStaff.map((member) => {
                const owner = isOwnerAccount(member);
                return (
                  <div
                    key={member.id}
                    className={`${cardClass} flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between`}
                  >
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-text-primary">{member.name}</p>
                      <p className="mt-0.5 text-sm text-text-muted">{member.email}</p>
                      <span
                        className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeClass(owner, member.role)}`}
                      >
                        {owner ? "Super Admin" : member.role}
                      </span>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      {owner ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditName(member.name);
                              setEditingMember(member);
                              setUserError("");
                            }}
                            className="flex items-center gap-2 text-sm text-text-primary transition-colors hover:text-accent-blue"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit Name
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPassword("");
                              setPasswordMember(member);
                              setUserError("");
                            }}
                            className="flex items-center gap-2 text-sm text-accent-blue transition-colors hover:text-accent-blue/80"
                          >
                            <Key className="h-4 w-4" />
                            Change Password
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditName(member.name);
                              setEditingMember(member);
                              setUserError("");
                            }}
                            className="flex items-center gap-2 text-sm text-text-primary transition-colors hover:text-accent-blue"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit Name
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewPassword("");
                              setPasswordMember(member);
                              setUserError("");
                            }}
                            className="flex items-center gap-2 text-sm text-accent-blue transition-colors hover:text-accent-blue/80"
                          >
                            <Key className="h-4 w-4" />
                            Change Password
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveUser(member)}
                            className="flex items-center gap-2 text-sm text-accent-red transition-colors hover:text-accent-red/80"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </section>
        </div>
      )}

      {tab === "office" && canManageOffice && (
        <div role="tabpanel" id="manage-office-panel" aria-labelledby="manage-office-tab">
          <ManageOfficePanel />
        </div>
      )}

      {tab === "reports" && canManageReports && (
        <div role="tabpanel" id="manage-reports-panel" aria-labelledby="manage-reports-tab">
          <Suspense fallback={<PanelLoadingFallback />}>
            <ReportsAnalyticsPanel />
          </Suspense>
        </div>
      )}

      {tab === "audit" && canViewAuditLog && (
        <div role="tabpanel" id="manage-audit-panel" aria-labelledby="manage-audit-tab">
          <Suspense fallback={<PanelLoadingFallback />}>
            <AuditLogPanel />
          </Suspense>
        </div>
      )}

      <SoftwareUpdatesCard />

      <PasswordConfirmDialog
        open={addStaffPasswordOpen}
        title="Add staff"
        description="Enter your password to add a new staff member."
        confirmLabel="Continue"
        onClose={() => setAddStaffPasswordOpen(false)}
        onConfirm={handleAddStaffPasswordConfirm}
      />

      {showAddStaff && (
        <SettingsModal title="Add Staff" onClose={() => setShowAddStaff(false)}>
          <form onSubmit={(e) => void handleAddUser(e)} className="space-y-4">
            <div>
              <label className={labelClass}>Full name</label>
              <input
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Username</label>
              <input
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                className={inputClass}
              >
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <PasswordInput
                value={userForm.password}
                onChange={(password) => setUserForm({ ...userForm, password })}
                minLength={4}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white"
            >
              Add Staff
            </button>
          </form>
        </SettingsModal>
      )}

      {editingMember && (
        <SettingsModal title="Edit Name" onClose={() => setEditingMember(null)}>
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className={labelClass}>Full name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white"
            >
              Save
            </button>
          </form>
        </SettingsModal>
      )}

      <PasswordConfirmDialog
        open={confirmNameSave}
        title="Save name"
        description={`Enter your password to save changes for ${editingMember?.name ?? "this user"}.`}
        confirmLabel="Save"
        onClose={() => setConfirmNameSave(false)}
        onConfirm={handleConfirmNameSave}
      />

      <PasswordConfirmDialog
        open={confirmPasswordSave}
        title="Update password"
        description={`Enter your current password to update the password for ${passwordMember?.name ?? "this user"}.`}
        confirmLabel="Update"
        onClose={() => setConfirmPasswordSave(false)}
        onConfirm={handleConfirmPasswordSave}
      />

      {passwordMember && (
        <SettingsModal title="Change Password" onClose={() => setPasswordMember(null)}>
          <form onSubmit={(e) => void handleSavePassword(e)} className="space-y-4">
            <p className="text-sm text-text-secondary">
              Set a new password for <span className="text-text-primary">{passwordMember.name}</span>.
            </p>
            <div>
              <label className={labelClass}>New password</label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                minLength={4}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-accent-blue py-2.5 text-sm font-semibold text-white"
            >
              Update Password
            </button>
          </form>
        </SettingsModal>
      )}
    </div>
  );
}
