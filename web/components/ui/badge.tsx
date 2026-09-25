import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/* ─── Status variants ─── */

const variants = {
  available:   "bg-[#32d583]/12 text-[#32d583] border-[#32d583]/20",
  occupied:    "bg-[#f04438]/12 text-[#f04438] border-[#f04438]/20",
  pending:     "bg-[#f79009]/12 text-[#f79009] border-[#f79009]/20",
  approved:    "bg-[#32d583]/12 text-[#32d583] border-[#32d583]/20",
  rejected:    "bg-[#f04438]/12 text-[#f04438] border-[#f04438]/20",
  maintenance: "bg-[#f79009]/12 text-[#f79009] border-[#f79009]/20",
  cancelled:   "bg-[#94a3b8]/12 text-[#94a3b8] border-[#94a3b8]/20",
  success:     "bg-[#32d583]/12 text-[#32d583] border-[#32d583]/20",
  warning:     "bg-[#f79009]/12 text-[#f79009] border-[#f79009]/20",
  danger:      "bg-[#f04438]/12 text-[#f04438] border-[#f04438]/20",
  neutral:     "bg-white/[0.06] text-[#94a3b8] border-white/10",
} as const;

const dotColors = {
  available:   "bg-[#32d583]",
  occupied:    "bg-[#f04438]",
  pending:     "bg-[#f79009]",
  approved:    "bg-[#32d583]",
  rejected:    "bg-[#f04438]",
  maintenance: "bg-[#f79009]",
  cancelled:   "bg-[#94a3b8]",
  success:     "bg-[#32d583]",
  warning:     "bg-[#f79009]",
  danger:      "bg-[#f04438]",
  neutral:     "bg-[#94a3b8]",
} as const;

/* ─── Types ─── */

export type BadgeVariant = keyof typeof variants;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

/* ─── Component ─── */

export function Badge({
  className,
  variant = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        "transition-colors duration-[var(--transition-fast)]",
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
