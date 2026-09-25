import type { ReactNode } from "react";

export interface NavItemConfig {
  label: string;
  href: string;
  icon: ReactNode;
  badge?: number | string;
  roles?: string[]; // Reserved for future RBAC
  children?: NavItemConfig[];
}
