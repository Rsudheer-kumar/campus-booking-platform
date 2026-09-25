import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SceneFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center bg-surface-2 p-6 text-center shadow-inner",
        className
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-muted">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">3D View Unavailable</h3>
      <p className="mt-1.5 max-w-sm text-xs text-muted">
        Your device or browser may not support WebGL. Standard 2D booking lists remain fully functional.
      </p>
    </div>
  );
}
