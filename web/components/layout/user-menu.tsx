"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogOut, Globe, UserCheck, Shield, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout, switchRole } = useAuth();

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "CF";

  const primaryRole = user?.roles?.[0] || "STUDENT";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Open user menu"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 border border-border shadow-sm outline-none transition-all duration-[var(--transition-fast)]",
          "focus-visible:ring-2 focus-visible:ring-primary/50",
          isOpen ? "ring-2 ring-primary/50" : "hover:bg-white/[0.06]"
        )}
      >
        <span className="text-sm font-semibold text-primary-bright">{initials}</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-[var(--radius-lg)] border border-border bg-[#0B1224] py-1.5 shadow-2xl z-50 origin-top-right focus:outline-none"
          role="menu"
          aria-orientation="vertical"
          style={{ animation: "fade-in var(--transition-fast) ease-out forwards" }}
        >
          {/* User Info Header */}
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">{user?.name || "CampusFlow User"}</p>
            <p className="truncate text-xs text-muted">{user?.email || "student@campusflow.edu"}</p>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-bright uppercase tracking-wider">
              {primaryRole}
            </span>
          </div>

          {/* Role Switcher for seamless evaluation */}
          <div className="px-3 py-2 border-b border-border/50">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Switch Demo Identity
            </p>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  switchRole("STUDENT");
                  setIsOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center justify-center p-1.5 rounded text-xs transition-colors",
                  primaryRole === "STUDENT"
                    ? "bg-primary/20 text-primary-bright border border-primary/40"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <GraduationCap className="h-3.5 w-3.5 mb-0.5" />
                <span className="text-[10px]">Student</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  switchRole("FACULTY");
                  setIsOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center justify-center p-1.5 rounded text-xs transition-colors",
                  primaryRole === "FACULTY"
                    ? "bg-primary/20 text-primary-bright border border-primary/40"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <UserCheck className="h-3.5 w-3.5 mb-0.5" />
                <span className="text-[10px]">Faculty</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  switchRole("ADMIN");
                  setIsOpen(false);
                }}
                className={cn(
                  "flex flex-col items-center justify-center p-1.5 rounded text-xs transition-colors",
                  primaryRole === "ADMIN"
                    ? "bg-primary/20 text-primary-bright border border-primary/40"
                    : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                )}
              >
                <Shield className="h-3.5 w-3.5 mb-0.5" />
                <span className="text-[10px]">Admin</span>
              </button>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-1 space-y-0.5">
            <Link
              href="/"
              prefetch={true}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-muted outline-none transition-colors hover:bg-white/[0.04] hover:text-foreground focus:bg-white/[0.04] focus:text-foreground"
              role="menuitem"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              Landing Page
            </Link>
          </div>

          <div className="border-t border-border p-1">
            <button
              onClick={() => {
                logout();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-danger outline-none transition-colors hover:bg-danger/10 focus:bg-danger/10"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
