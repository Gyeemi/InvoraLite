import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  BarChart3,
  Box,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { PageId } from "../../types";

export const navColors = {
  blue: { icon: "text-accent-blue", bg: "bg-accent-blue", bgMuted: "bg-accent-blue/15" },
  green: { icon: "text-accent-green", bg: "bg-accent-green", bgMuted: "bg-accent-green/15" },
  orange: { icon: "text-accent-orange", bg: "bg-accent-orange", bgMuted: "bg-accent-orange/15" },
  purple: { icon: "text-accent-purple", bg: "bg-accent-purple", bgMuted: "bg-accent-purple/15" },
  sky: { icon: "text-sky-400", bg: "bg-sky-400", bgMuted: "bg-sky-400/15" },
  amber: { icon: "text-amber-400", bg: "bg-amber-400", bgMuted: "bg-amber-400/15" },
  slate: { icon: "text-text-secondary", bg: "bg-text-secondary", bgMuted: "bg-bg-hover" },
  red: { icon: "text-accent-red", bg: "bg-accent-red", bgMuted: "bg-accent-red/15" },
} as const;

type NavColor = keyof typeof navColors;

export interface NavItem {
  icon: LucideIcon;
  label: string;
  page?: PageId;
  action?: "logout";
  color: (typeof navColors)[NavColor];
  requiresPurchaseAccess?: boolean;
}

export const mainNav: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", page: "dashboard", color: navColors.blue },
  { icon: Box, label: "Products", page: "products", color: navColors.green },
  { icon: ShoppingCart, label: "Purchase", page: "purchase", color: navColors.orange, requiresPurchaseAccess: true },
  { icon: Users, label: "Customers", page: "people", color: navColors.purple },
  { icon: BarChart3, label: "Sales Insights", page: "analytics", color: navColors.sky },
  { icon: FileText, label: "Invoice", page: "invoice", color: navColors.amber },
];

export const bottomNav: NavItem[] = [
  { icon: BadgePercent, label: "Pricing", page: "rate-master", color: navColors.purple },
  { icon: Settings, label: "Manage", page: "settings", color: navColors.slate },
  { icon: LogOut, label: "Logout", action: "logout", color: navColors.red },
];
