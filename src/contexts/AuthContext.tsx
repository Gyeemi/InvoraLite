import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Business, StaffMember, User } from "../types";
import {
  STORAGE_KEYS,
  sessionGet,
  sessionRemove,
  sessionSet,
  setStorageContext,
  storageGet,
  storageSet,
} from "../lib/storage";
import { clearLoginLockout, getLockoutStatus, recordAudit, recordFailedLogin } from "../lib/audit";
import { ensureDatabaseOpen, sealDatabaseAtRest } from "../lib/database";
import { isOwnerUser, resolveLoginUsername } from "../lib/authLogin";
import { getStaff, nextId, saveStaff } from "../lib/data";
import {
  hashPassword,
  isPasswordHash,
  resolveStoredPassword,
  verifyStoredPassword,
} from "../lib/password";
import {
  migrateStoredAvatar,
  resolveUserAvatar,
  setStoredAvatar,
} from "../lib/avatars";
import { validatePasswordComplexity } from "../lib/passwordPolicy";
import { normalizeBusiness, validateBusiness } from "../lib/businessValidation";

interface OwnAccountPatch {
  name: string;
  username: string;
  email: string;
  newPassword?: string;
}

interface OwnAccountResult {
  success: boolean;
  error?: string;
}

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  isAuthenticated: boolean;
  isSetupComplete: boolean;
  loading: boolean;
  completeSetup: (data: Business) => Promise<boolean>;
  updateBusiness: (data: Partial<Business>) => Promise<boolean>;
  updateUserName: (name: string) => Promise<void>;
  updateUserAvatar: (avatar: string) => Promise<void>;
  updateOwnAccount: (patch: OwnAccountPatch, currentPassword: string) => Promise<OwnAccountResult>;
  login: (identifier: string, password: string) => Promise<boolean>;
  getLoginLockoutStatus: (identifier: string) => Promise<Awaited<ReturnType<typeof getLockoutStatus>>>;
  verifyPassword: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        await ensureDatabaseOpen();
        const bizRaw = await storageGet(STORAGE_KEYS.business);
        const setup = await storageGet(STORAGE_KEYS.setupComplete);
        const authRaw = await sessionGet(STORAGE_KEYS.auth);

        if (bizRaw) {
          setBusiness(JSON.parse(bizRaw) as Business);
          const setupDone = setup === "true" || !!bizRaw;
          setIsSetupComplete(setupDone);
        }
        if (authRaw) {
          const parsed = JSON.parse(authRaw) as User;
          const avatar = await resolveUserAvatar(parsed.username);
          const nextUser = { ...parsed, avatar };
          setUser(nextUser);
          setStorageContext({ username: parsed.username, role: parsed.role });
        }
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void (async () => {
          await recordAudit(user.username, "logout", "session", "success", "session_timeout");
          setUser(null);
          setStorageContext(null);
          await sessionRemove(STORAGE_KEYS.auth);
          await sealDatabaseAtRest();
        })();
      }, SESSION_TIMEOUT_MS);
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [user]);

  const completeSetup = useCallback(async (data: Business) => {
    const normalized = normalizeBusiness(data);
    if (!validateBusiness(normalized)) return false;
    try {
      const passwordHash = await hashPassword(normalized.password);
      const secured = { ...normalized, password: passwordHash };
      await storageSet(STORAGE_KEYS.business, JSON.stringify(secured));
      await storageSet(STORAGE_KEYS.setupComplete, "true");
      setBusiness(secured);
      setIsSetupComplete(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const updateBusiness = useCallback(
    async (patch: Partial<Business>) => {
      const current = business;
      if (!current) return false;
      try {
        let password = current.password;
        if (patch.password !== undefined) {
          const incomingPassword = patch.password.trim();
          if (incomingPassword && !isPasswordHash(incomingPassword)) {
            password = await resolveStoredPassword(incomingPassword, current.password);
          } else if (incomingPassword) {
            password = incomingPassword;
          }
        }
        const merged = normalizeBusiness({
          ...current,
          ...patch,
          password,
        });
        if (!validateBusiness(merged, false)) return false;
        await storageSet(STORAGE_KEYS.business, JSON.stringify(merged));
        setBusiness(merged);
        if (user && (user.username === current.username || user.email === current.email)) {
          const nextUser: User = {
            name: user.name,
            role: "Admin",
            email: merged.email,
            username: merged.username,
            avatar: user.avatar,
          };
          setUser(nextUser);
          await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
        }
        return true;
      } catch {
        return false;
      }
    },
    [business, user],
  );

  const upgradeOwnerPasswordHash = useCallback(
    async (upgradedHash: string) => {
      if (!business) return;
      const secured = { ...business, password: upgradedHash };
      await storageSet(STORAGE_KEYS.business, JSON.stringify(secured));
      setBusiness(secured);

      const staffList = await getStaff();
      const nextStaff = staffList.map((member) => {
        const isOwner =
          member.username.trim().toLowerCase() === business.username.trim().toLowerCase() ||
          (!!member.email.trim() &&
            !!business.email.trim() &&
            member.email.trim().toLowerCase() === business.email.trim().toLowerCase());
        return isOwner ? { ...member, password: upgradedHash } : member;
      });
      await saveStaff(nextStaff);
    },
    [business],
  );

  const upgradeStaffPasswordHash = useCallback(async (memberId: string, upgradedHash: string) => {
    const staffList = await getStaff();
    const nextStaff = staffList.map((member) =>
      member.id === memberId ? { ...member, password: upgradedHash } : member,
    );
    await saveStaff(nextStaff);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      await ensureDatabaseOpen();
      const biz = business;
      if (!biz) return false;
      const id = identifier.trim().toLowerCase();
      const staff = await getStaff();
      const lockoutKey = resolveLoginUsername(identifier, biz, staff) ?? id;
      const lockout = await getLockoutStatus(lockoutKey);
      if (lockout?.locked) return false;

      const matchOwner =
        biz.email.trim().toLowerCase() === id || biz.username.trim().toLowerCase() === id;

      if (matchOwner) {
        const ownerResult = await verifyStoredPassword(biz.password, password);
        if (!ownerResult.valid) {
          await recordFailedLogin(lockoutKey);
          await recordAudit(lockoutKey, "login", "owner", "failure");
          return false;
        }
        if (ownerResult.upgradedHash) {
          await upgradeOwnerPasswordHash(ownerResult.upgradedHash);
        }

        const ownerStaff = staff.find(
          (member) =>
            member.username.trim().toLowerCase() === biz.username.trim().toLowerCase() ||
            (!!member.email.trim() &&
              !!biz.email.trim() &&
              member.email.trim().toLowerCase() === biz.email.trim().toLowerCase()),
        );
        const nextUser: User = {
          name: ownerStaff?.name ?? biz.username,
          role: "Admin",
          email: biz.email,
          username: biz.username,
          avatar: await resolveUserAvatar(biz.username),
        };
        setUser(nextUser);
        setStorageContext({ username: nextUser.username, role: nextUser.role });
        await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
        await clearLoginLockout(lockoutKey);
        await recordAudit(nextUser.username, "login", "owner", "success");
        return true;
      }

      const member = staff.find(
        (s: StaffMember) =>
          s.username.trim().toLowerCase() === id ||
          (s.email.trim() && s.email.trim().toLowerCase() === id),
      );
      if (!member) {
        await recordFailedLogin(lockoutKey);
        await recordAudit(lockoutKey, "login", "staff", "failure");
        return false;
      }

      const staffResult = await verifyStoredPassword(member.password, password);
      if (!staffResult.valid) {
        await recordFailedLogin(member.username);
        await recordAudit(member.username, "login", "staff", "failure");
        return false;
      }
      if (staffResult.upgradedHash) {
        await upgradeStaffPasswordHash(member.id, staffResult.upgradedHash);
      }

      const nextUser: User = {
        name: member.name,
        role: member.role,
        email: member.email,
        username: member.username,
        avatar: await resolveUserAvatar(member.username),
      };
      setUser(nextUser);
      setStorageContext({ username: nextUser.username, role: nextUser.role });
      await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
      await clearLoginLockout(member.username);
      await recordAudit(nextUser.username, "login", "staff", "success");
      return true;
    },
    [business, upgradeOwnerPasswordHash, upgradeStaffPasswordHash],
  );

  const getLoginLockoutStatus = useCallback(
    async (identifier: string) => {
      const biz = business;
      if (!biz) return null;
      const staff = await getStaff();
      const lockoutKey = resolveLoginUsername(identifier, biz, staff) ?? identifier.trim();
      if (!lockoutKey) return null;
      return getLockoutStatus(lockoutKey);
    },
    [business],
  );

  const verifyPassword = useCallback(
    async (password: string) => {
      if (!user || !business) return false;
      if (user.username === business.username || user.email === business.email) {
        const result = await verifyStoredPassword(business.password, password);
        if (result.valid && result.upgradedHash) {
          await upgradeOwnerPasswordHash(result.upgradedHash);
        }
        return result.valid;
      }
      const staff = await getStaff();
      const member = staff.find(
        (s: StaffMember) =>
          s.username === user.username ||
          (s.email.trim() && s.email.trim().toLowerCase() === user.email.trim().toLowerCase()),
      );
      if (!member) return false;
      const result = await verifyStoredPassword(member.password, password);
      if (result.valid && result.upgradedHash) {
        await upgradeStaffPasswordHash(member.id, result.upgradedHash);
      }
      return result.valid;
    },
    [user, business, upgradeOwnerPasswordHash, upgradeStaffPasswordHash],
  );

  const logout = useCallback(async () => {
    const username = user?.username ?? "";
    if (username) {
      await recordAudit(username, "logout", "session", "success");
    }
    setUser(null);
    setStorageContext(null);
    await sessionRemove(STORAGE_KEYS.auth);
    await sealDatabaseAtRest();
  }, [user]);

  const updateUserName = useCallback(async (name: string) => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextUser: User = { ...user, name: trimmed };
    setUser(nextUser);
    await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
  }, [user]);

  const updateUserAvatar = useCallback(async (avatar: string) => {
    if (!user) return;
    await setStoredAvatar(user.username, avatar);
    const nextUser: User = { ...user, avatar };
    setUser(nextUser);
    await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
  }, [user]);

  const updateOwnAccount = useCallback(
    async (patch: OwnAccountPatch, currentPassword: string): Promise<OwnAccountResult> => {
      if (!user || !business) {
        return { success: false, error: "You must be signed in to update your account." };
      }

      const name = patch.name.trim();
      const nextUsername = patch.username.trim();
      const nextEmail = patch.email.trim();

      if (!name || !nextUsername || !nextEmail) {
        return { success: false, error: "Name, username, and email are required." };
      }

      if (patch.newPassword && !validatePasswordComplexity(patch.newPassword)) {
        return { success: false, error: "New password does not meet complexity requirements." };
      }

      const passwordOk = await verifyPassword(currentPassword);
      if (!passwordOk) {
        return { success: false, error: "Current password is incorrect." };
      }

      const staffList = await getStaff();
      const usernameTaken = staffList.some(
        (member) =>
          member.username.trim().toLowerCase() === nextUsername.toLowerCase() &&
          member.username.trim().toLowerCase() !== user.username.trim().toLowerCase(),
      );
      const ownerUsernameTaken =
        business.username.trim().toLowerCase() === nextUsername.toLowerCase() &&
        !isOwnerUser(user, business);
      if (usernameTaken || ownerUsernameTaken) {
        return { success: false, error: "This username is already in use." };
      }

      const emailTaken = staffList.some(
        (member) =>
          member.email.trim() &&
          member.email.trim().toLowerCase() === nextEmail.toLowerCase() &&
          member.username.trim().toLowerCase() !== user.username.trim().toLowerCase(),
      );
      const ownerEmailTaken =
        business.email.trim().toLowerCase() === nextEmail.toLowerCase() && !isOwnerUser(user, business);
      if (emailTaken || ownerEmailTaken) {
        return { success: false, error: "This email is already in use." };
      }

      try {
        const previousUsername = user.username;
        let passwordHash: string | undefined;

        if (patch.newPassword) {
          passwordHash = await hashPassword(patch.newPassword);
        }

        if (isOwnerUser(user, business)) {
          await updateBusiness({
            username: nextUsername,
            email: nextEmail,
            ...(passwordHash ? { password: passwordHash } : {}),
          });

          const ownerInStaff = staffList.find(
            (member) =>
              member.username.trim().toLowerCase() === user.username.trim().toLowerCase() ||
              (!!member.email.trim() &&
                !!user.email.trim() &&
                member.email.trim().toLowerCase() === user.email.trim().toLowerCase()),
          );

          const nextStaff = ownerInStaff
            ? staffList.map((member) =>
                member.id === ownerInStaff.id
                  ? {
                      ...member,
                      name,
                      username: nextUsername,
                      email: nextEmail,
                      ...(passwordHash ? { password: passwordHash } : {}),
                    }
                  : member,
              )
            : [
                ...staffList,
                {
                  id: nextId("USR", staffList),
                  name,
                  username: nextUsername,
                  email: nextEmail,
                  role: "Admin" as const,
                  password: passwordHash ?? business.password,
                },
              ];

          await saveStaff(nextStaff);
        } else {
          const member = staffList.find(
            (entry) =>
              entry.username.trim().toLowerCase() === user.username.trim().toLowerCase() ||
              (!!entry.email.trim() &&
                !!user.email.trim() &&
                entry.email.trim().toLowerCase() === user.email.trim().toLowerCase()),
          );
          if (!member) {
            return { success: false, error: "Could not find your staff account." };
          }

          const nextStaff = staffList.map((entry) =>
            entry.id === member.id
              ? {
                  ...entry,
                  name,
                  username: nextUsername,
                  email: nextEmail,
                  ...(passwordHash ? { password: passwordHash } : {}),
                }
              : entry,
          );
          await saveStaff(nextStaff);
        }

        if (previousUsername.trim().toLowerCase() !== nextUsername.toLowerCase()) {
          await migrateStoredAvatar(previousUsername, nextUsername);
        }

        const avatar = await resolveUserAvatar(nextUsername);
        const nextUser: User = {
          ...user,
          name,
          username: nextUsername,
          email: nextEmail,
          avatar,
        };
        setUser(nextUser);
        setStorageContext({ username: nextUser.username, role: nextUser.role });
        await sessionSet(STORAGE_KEYS.auth, JSON.stringify(nextUser));
        await recordAudit(nextUser.username, "user_change", "self_account", "success");
        return { success: true };
      } catch {
        return { success: false, error: "Could not save account changes." };
      }
    },
    [user, business, verifyPassword, updateBusiness],
  );

  const value = useMemo(
    () => ({
      user,
      business,
      isAuthenticated: !!user,
      isSetupComplete,
      loading,
      completeSetup,
      updateBusiness,
      updateUserName,
      updateUserAvatar,
      updateOwnAccount,
      login,
      getLoginLockoutStatus,
      verifyPassword,
      logout,
    }),
    [
      user,
      business,
      isSetupComplete,
      loading,
      completeSetup,
      updateBusiness,
      updateUserName,
      updateUserAvatar,
      updateOwnAccount,
      login,
      getLoginLockoutStatus,
      verifyPassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

