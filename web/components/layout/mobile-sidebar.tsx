"use client";

import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./sidebar-content";

export interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden"; // Prevent background scroll

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  // Trap focus roughly on mount
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
        style={{ animation: "overlay-show var(--transition-fast) ease-out forwards" }}
      />

      {/* Drawer Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed bottom-0 left-0 top-0 flex w-[280px] max-w-[85vw] flex-col overflow-hidden bg-[#0B1224] shadow-2xl",
          "focus:outline-none"
        )}
        style={{
          animation: "slide-right var(--transition-base) ease-out forwards",
        }}
      >
        <SidebarContent onItemClick={onClose} />

        {/* Close Button placed floating corner if desired, or inside */}
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-muted outline-none transition-colors hover:bg-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Basic Keyfames injected for the mobile menu */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slide-right {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}} />
    </div>
  );
}
