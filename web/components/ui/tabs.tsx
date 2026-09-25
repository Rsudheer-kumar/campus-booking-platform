"use client";

import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (id: string) => void;
  className?: string;
}

/* ─── Component ─── */

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? "");
  const active = activeTab ?? internalActive;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Keep refs array in sync */
  useEffect(() => {
    tabRefs.current = tabRefs.current.slice(0, tabs.length);
  }, [tabs.length]);

  const handleSelect = (id: string) => {
    if (onChange) onChange(id);
    else setInternalActive(id);
  };

  /* Arrow-key navigation per ARIA tabs pattern */
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((t) => t.id === active);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
      while (tabs[nextIndex].disabled && nextIndex !== currentIndex) {
        nextIndex = (nextIndex + 1) % tabs.length;
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      while (tabs[nextIndex].disabled && nextIndex !== currentIndex) {
        nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = tabs.findIndex((t) => !t.disabled);
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = tabs.length - 1 - [...tabs].reverse().findIndex((t) => !t.disabled);
    }

    if (nextIndex !== currentIndex && !tabs[nextIndex].disabled) {
      handleSelect(tabs[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      className={cn("flex gap-1 rounded-[var(--radius-lg)] bg-surface p-1 border border-border", className)}
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => handleSelect(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium",
              "transition-all duration-[var(--transition-base)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              "disabled:pointer-events-none disabled:opacity-40",
              isActive
                ? "bg-surface-2 text-foreground shadow-sm"
                : "text-muted hover:text-foreground hover:bg-white/[0.04]",
            )}
          >
            {tab.icon && <span className="shrink-0" aria-hidden="true">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Tab Panel helper ─── */

export interface TabPanelProps {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ id, activeTab, children, className }: TabPanelProps) {
  if (id !== activeTab) return null;

  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={cn("animate-fade-in focus:outline-none", className)}
    >
      {children}
    </div>
  );
}
