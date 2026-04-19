import type { ReactNode } from "react";

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
    border: "border-accent/70",
    bg: "bg-accent/[0.10]",
    dot: "bg-text-muted",
  },
};

interface ModuleCardShellProps {
  tone: ModuleCardTone;
  headerMiddle: ReactNode;
  headerRight?: ReactNode;
  onEdit: () => void;
  children?: ReactNode;
}

export function ModuleCardShell({
  tone,
  headerMiddle,
  headerRight,
  onEdit,
  children,
}: ModuleCardShellProps) {
  const t = TONE[tone];
  // Matches original `isOn === false` dim styling in ModuleCard.tsx:210-212.
  // `task-off` = task with no loaded module; also dim.
  const editDim = tone === "idle" || tone === "task-off";
  const editTextClass = editDim
    ? "text-text-muted/50 hover:text-accent/70"
    : "text-text-muted hover:text-accent";

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border ${t.bg} ${t.border}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
        {headerMiddle}
        {headerRight}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className={`p-1 rounded hover:bg-accent/10 transition-colors ${editTextClass}`}
          title="Edit module"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
