import { mainNavItems, bottomNavItems } from "@/lib/navigation";
import { NavItem } from "./nav-item";
import { MonitorDot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarContentProps {
  onItemClick?: () => void;
  className?: string;
}

export function SidebarContent({ onItemClick, className }: SidebarContentProps) {
  return (
    <div className={cn("flex h-full flex-col bg-[#0B1224]", className)}>
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-white shadow-[0_0_12px_rgba(79,140,255,0.35)]">
            <MonitorDot className="h-4 w-4" aria-hidden="true" />
          </div>
          CampusFlow
        </span>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Main Navigation">
        {mainNavItems.map((item) => (
          <NavItem key={item.label} item={item} onClick={onItemClick} />
        ))}
      </nav>

      {/* Bottom Nav */}
      <div className="shrink-0 border-t border-border p-3 space-y-1" aria-label="Secondary Navigation">
        {bottomNavItems.map((item) => (
          <NavItem key={item.label} item={item} onClick={onItemClick} />
        ))}
      </div>
    </div>
  );
}
