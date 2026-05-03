import type { ReactNode } from "react";
import { KindIcon } from "./KindIcon";

export type ModuleCardVariant = "active" | "idle" | "archived";

interface ToneClasses {
  border: string;
  bg: string;
  opacity: string;
}

const VARIANT: Record<ModuleCardVariant, ToneClasses> = {
  active: {
    border: "border-border",
    bg: "bg-bg-hover",
    opacity: "",
  },
  idle: {
    border: "border-border",
    bg: "bg-bg-hover",
    opacity: "",
  },
  archived: {
    border: "border-dashed border-border",
    bg: "bg-bg",
    opacity: "",
  },
};

interface ModuleCardShellProps {
  variant: ModuleCardVariant;
  kind: "integration" | "task" | "workflow";
  warn?: boolean;
  headerMiddle: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
}

export function ModuleCardShell({
  variant,
  kind,
  warn,
  headerMiddle,
  headerRight,
  children,
}: ModuleCardShellProps) {
  const v = VARIANT[variant];
  const warnRing = warn ? "ring-1 ring-danger/40" : "";
  return (
    <div
      className={`relative mb-1 overflow-hidden rounded-md border transition-opacity ${v.bg} ${v.border} ${v.opacity} ${warnRing}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <KindIcon kind={kind} active={variant === "active"} />
        {headerMiddle}
        {headerRight}
      </div>
      {children}
    </div>
  );
}
