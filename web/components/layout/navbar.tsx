import Link from "next/link";
import { Bell, Menu, MonitorDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import type { HTMLAttributes } from "react";

export interface NavbarProps extends HTMLAttributes<HTMLElement> {
  onOpenMobileMenu: () => void;
}

export function Navbar({ onOpenMobileMenu, className, ...props }: NavbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-[#050816]/80 px-4 backdrop-blur-md md:px-6",
        className
      )}
      {...props}
    >
      {/* Mobile Branding / Menu trigger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          aria-label="Open mobile navigation"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors outline-none md:hidden",
            "hover:bg-white/[0.06] hover:text-foreground active:scale-95",
            "focus-visible:ring-2 focus-visible:ring-primary/50"
          )}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Mobile Logo Only (Desktop has it in Sidebar) */}
        <Link
          href="/"
          prefetch={true}
          className="flex items-center gap-2 md:hidden outline-none rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label="Return to CampusFlow Home"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-white shadow-[0_0_12px_rgba(79,140,255,0.35)]">
            <MonitorDot className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">
            CampusFlow
          </span>
        </Link>
      </div>

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        {/* Notifications */}
        <button
          aria-label="View notifications"
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors outline-none",
            "hover:bg-white/[0.06] hover:text-foreground active:scale-95",
            "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:bg-white/[0.06]"
          )}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-danger ring-2 ring-[#050816]" />
        </button>

        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        {/* User Menu Context */}
        <UserMenu />
      </div>
    </header>
  );
}
