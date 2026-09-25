"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/* ─── Variant maps ─── */

const variantStyles = {
  primary:
    "bg-primary text-white hover:bg-primary-bright active:brightness-90 shadow-[0_0_0_1px_rgba(79,140,255,0.15),0_4px_16px_rgba(79,140,255,0.18)]",
  secondary:
    "bg-surface-2 text-foreground border border-border hover:bg-[#162040] active:bg-surface",
  ghost:
    "bg-transparent text-foreground hover:bg-white/[0.06] active:bg-white/[0.03]",
  danger:
    "bg-danger text-white hover:brightness-110 active:brightness-90 shadow-[0_0_0_1px_rgba(240,68,56,0.15),0_4px_16px_rgba(240,68,56,0.12)]",
  outline:
    "bg-transparent text-foreground border border-border hover:border-primary/40 hover:bg-primary/[0.06] active:bg-primary/[0.03]",
} as const;

const sizeStyles = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-sm)] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[var(--radius-md)] gap-2",
  lg: "h-12 px-6 text-base rounded-[var(--radius-lg)] gap-2.5",
} as const;

/* ─── Types ─── */

export type ButtonVariant = keyof typeof variantStyles;
export type ButtonSize = keyof typeof sizeStyles;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

/* ─── Component ─── */

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium whitespace-nowrap",
          "transition-all duration-[var(--transition-base)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : icon ? (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
export { Button };
