import { cn } from "@/lib/utils";
import { SidebarContent } from "./sidebar-content";
import type { HTMLAttributes } from "react";

export type SidebarProps = HTMLAttributes<HTMLElement>;

export function Sidebar({ className, ...props }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden w-[260px] shrink-0 border-r border-border md:flex md:flex-col",
        className
      )}
      {...props}
    >
      <SidebarContent />
    </aside>
  );
}
