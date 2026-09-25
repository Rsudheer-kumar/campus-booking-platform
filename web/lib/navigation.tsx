import type { NavItemConfig } from "@/types/navigation";
import {
  BarChart3,
  Boxes,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Database,
  LayoutDashboard,
  Settings,
  User,
  Wrench,
} from "lucide-react";

export const mainNavItems: NavItemConfig[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "Resources",
    href: "/dashboard/resources",
    icon: <Database className="h-4 w-4" />,
  },
  {
    label: "My Bookings",
    href: "/dashboard/bookings",
    icon: <CalendarCheck className="h-4 w-4" />,
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: <Calendar className="h-4 w-4" />,
  },
  {
    label: "Approvals",
    href: "/dashboard/approvals",
    icon: <ClipboardList className="h-4 w-4" />,
    badge: 3,
  },
  {
    label: "Maintenance",
    href: "/dashboard/maintenance",
    icon: <Wrench className="h-4 w-4" />,
  },
  {
    label: "Inventory",
    href: "/dashboard/inventory",
    icon: <Boxes className="h-4 w-4" />,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <BarChart3 className="h-4 w-4" />,
  },
];

export const bottomNavItems: NavItemConfig[] = [
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <Settings className="h-4 w-4" />,
  },
  {
    label: "Profile",
    href: "/dashboard/profile",
    icon: <User className="h-4 w-4" />,
  },
];
