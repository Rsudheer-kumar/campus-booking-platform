"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItemConfig } from "@/types/navigation";

export interface NavItemProps {
  item: NavItemConfig;
  onClick?: () => void;
  className?: string;
}

export function NavItem({ item, onClick, className }: NavItemProps) {
  const pathname = usePathname();

  // Highlight logic: Exact match for root, or startsWith for nested paths to prevent bleeding
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)));

  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--transition-fast)] outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:bg-surface-2", // Accessible focus
        isActive
          ? "bg-primary/10 text-primary-bright font-medium"
          : "text-muted hover:bg-white/[0.04] hover:text-foreground",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Absolute left active indicator */}
        {isActive && (
          <div
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-md bg-primary"
            aria-hidden="true"
          />
        )}
        <span className="shrink-0" aria-hidden="true">
          {item.icon}
        </span>
        {item.label}
      </div>

      {item.badge && (
        <span
          className={cn(
            "flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-semibold",
            isActive
              ? "bg-primary/20 text-primary-bright"
              : "bg-surface-2 text-muted border border-border"
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
