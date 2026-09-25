import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ─── Variant maps ─── */

const variantStyles = {
  default: "surface rounded-[var(--radius-lg)]",
  elevated: "surface-elevated rounded-[var(--radius-lg)]",
  interactive: [
    "surface rounded-[var(--radius-lg)]",
    "transition-all duration-[var(--transition-base)]",
    "hover:border-primary/25 hover:shadow-[0_0_0_1px_rgba(79,140,255,0.08),0_8px_32px_rgba(79,140,255,0.06)]",
    "hover:-translate-y-0.5",
    "cursor-pointer",
  ].join(" "),
} as const;

/* ─── Types ─── */

export type CardVariant = keyof typeof variantStyles;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  noPadding?: boolean;
}

/* ─── Component ─── */

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", noPadding = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          variantStyles[variant],
          !noPadding && "p-5",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

/* ─── Sub-components ─── */

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("mt-1 text-sm text-muted", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn(className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mt-4 flex items-center gap-3", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
