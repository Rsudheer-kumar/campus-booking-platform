import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { FeedbackStateProps } from "@/types/components";

export function ErrorState({
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
      role="alert"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 border border-danger/20 text-danger">
        {icon ?? <AlertTriangle className="h-6 w-6" />}
      </div>

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
