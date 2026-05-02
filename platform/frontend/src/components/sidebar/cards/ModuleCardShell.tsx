import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { KindIcon } from "./KindIcon";

export type ModuleCardVariant = "active" | "idle";

interface ToneClasses {
  border: string;
  bg: string;
  leftBar: string;
}

const VARIANT: Record<ModuleCardVariant, ToneClasses> = {
  active: {
    border: "border-border",
    bg: "bg-bg-hover",
    leftBar: "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:bg-success",
  },
  idle: {
    border: "border-border/60",
    bg: "bg-bg-hover/40",
    leftBar: "",
  },
};

interface ModuleCardShellProps {
  variant: ModuleCardVariant;
  kind: "integration" | "task" | "workflow";
  hasGrowthAreas?: boolean;
  warn?: boolean;
  headerMiddle: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
}

export function ModuleCardShell({
  variant,
  kind,
  hasGrowthAreas,
  warn,
  headerMiddle,
  headerRight,
  children,
}: ModuleCardShellProps) {
  const v = VARIANT[variant];
  const warnRing = warn ? "ring-1 ring-red-500/40" : "";
  return (
    <div
      className={`relative mb-1 overflow-hidden rounded-md border ${v.bg} ${v.border} ${v.leftBar} ${warnRing}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <KindIcon kind={kind} active={variant === "active"} />
        {headerMiddle}
        {hasGrowthAreas && (
          <span title="Has declared growth areas" className="text-text-muted shrink-0">
            <MapPin className="w-3 h-3" />
          </span>
        )}
        {headerRight}
      </div>
      {children}
    </div>
  );
}
