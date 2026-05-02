import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

export type ModuleCardTone = "ok" | "warn" | "idle" | "task-on" | "task-off";

interface ToneClasses {
  border: string;
  bg: string;
  dot: string;
}

const TONE: Record<ModuleCardTone, ToneClasses> = {
  ok: {
    border: "border-accent/50",
    bg: "bg-accent/[0.10]",
    dot: "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]",
  },
  warn: {
    border: "border-red-500/60",
    bg: "bg-red-500/[0.08]",
    dot: "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  },
  idle: {
    border: "border-border opacity-60",
    bg: "bg-bg-hover",
    dot: "bg-text-muted",
  },
  "task-on": {
    border: "border-accent/70",
    bg: "bg-accent/[0.10]",
    dot: "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]",
  },
  "task-off": {
    border: "border-border opacity-60",
    bg: "bg-bg-hover",
    dot: "bg-text-muted",
  },
};

interface ModuleCardShellProps {
  tone: ModuleCardTone;
  kind?: "integration" | "task" | "workflow";
  hasGrowthAreas?: boolean;
  headerMiddle: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
}

export function ModuleCardShell({
  tone,
  kind,
  hasGrowthAreas,
  headerMiddle,
  headerRight,
  children,
}: ModuleCardShellProps) {
  const t = TONE[tone];
  return (
    <div className={`mb-1.5 overflow-hidden rounded-md border ${t.bg} ${t.border}`}>
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
        {headerMiddle}
        {kind && (
          <span className="text-[10px] uppercase tracking-wide px-1 py-0.5 rounded bg-neutral-200 text-neutral-700 font-medium shrink-0">
            {kind}
          </span>
        )}
        {hasGrowthAreas && (
          <span title="Has declared growth areas" className="text-neutral-500 shrink-0">
            <MapPin className="w-3 h-3" />
          </span>
        )}
        {headerRight}
      </div>
      {children}
    </div>
  );
}
