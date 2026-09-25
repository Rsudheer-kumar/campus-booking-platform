import type { ReactNode } from "react";

/* ─── Shared size scale ─── */
export type Size = "sm" | "md" | "lg";

/* ─── Common prop contracts ─── */

/** Props shared by feedback-state components (EmptyState, ErrorState). */
export interface FeedbackStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}
