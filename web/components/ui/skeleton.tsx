import { cn } from "@/lib/utils";

/* ─── Types ─── */

export interface SkeletonProps {
  className?: string;
}

/* ─── Base ─── */

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-surface-2",
        "animate-shimmer",
        "bg-gradient-to-r from-surface-2 via-white/[0.06] to-surface-2",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/* ─── Preset shapes ─── */

export function SkeletonText({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function SkeletonAvatar({ className }: SkeletonProps) {
  return (
    <Skeleton className={cn("h-10 w-10 rounded-full", className)} />
  );
}

export function SkeletonButton({ className }: SkeletonProps) {
  return (
    <Skeleton className={cn("h-10 w-28 rounded-[var(--radius-md)]", className)} />
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface p-5 space-y-4",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText />
      <div className="flex gap-2">
        <SkeletonButton />
        <SkeletonButton className="w-20" />
      </div>
    </div>
  );
}
