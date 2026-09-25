import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import type { FeedbackStateProps } from "@/types/components";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: FeedbackStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-border text-muted">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
