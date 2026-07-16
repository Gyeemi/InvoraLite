import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { usePermissions } from "../../hooks/usePermissions";
import { ConfirmDialog } from "../ConfirmDialog";
import { bottomNav, mainNav } from "./navConfig";
import { SidebarButton } from "./SidebarButton";

export function Sidebar() {
  const { logout, user } = useAuth();
  const { canManagePurchases } = usePermissions();
  const { currentPage, navigate } = useNavigation();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const items = mainNav.filter(
    (item) => !item.requiresPurchaseAccess || (user && canManagePurchases),
  );

  function handleClick(page?: string, action?: string) {
    if (action === "logout") {
      setLogoutConfirmOpen(true);
      return;
    }
    if (page) navigate(page as never);
  }

  async function confirmLogout() {
    setLogoutBusy(true);
    try {
      await logout();
      setLogoutConfirmOpen(false);
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[92px] flex-col border-r border-border bg-bg-sidebar px-2 py-5">
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <SidebarButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            color={item.color}
            active={currentPage === item.page}
            onClick={() => handleClick(item.page, item.action)}
          />
        ))}
        <div className="my-2 border-t border-border/60" />
        {bottomNav.map((item) => (
          <SidebarButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            color={item.color}
            active={item.page ? currentPage === item.page : false}
            onClick={() => handleClick(item.page, item.action)}
          />
        ))}
        </nav>
      </aside>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Sign out?"
        description="You will need to sign in again to access your dashboard."
        confirmLabel="Sign Out"
        confirmTone="danger"
        loading={logoutBusy}
        loadingLabel="Signing out…"
        onClose={() => {
          if (!logoutBusy) setLogoutConfirmOpen(false);
        }}
        onConfirm={confirmLogout}
      />
    </>
  );
}
