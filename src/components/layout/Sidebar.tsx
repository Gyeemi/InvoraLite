import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { usePermissions } from "../../hooks/usePermissions";
import { bottomNav, mainNav } from "./navConfig";
import { SidebarButton } from "./SidebarButton";

export function Sidebar() {
  const { logout, user } = useAuth();
  const { canManagePurchases } = usePermissions();
  const { currentPage, navigate } = useNavigation();

  const items = mainNav.filter(
    (item) => !item.requiresPurchaseAccess || (user && canManagePurchases),
  );

  function handleClick(page?: string, action?: string) {
    if (action === "logout") {
      void logout();
      return;
    }
    if (page) navigate(page as never);
  }

  return (
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
  );
}
