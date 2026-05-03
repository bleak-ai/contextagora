import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ModuleSubSectionProps {
  title: ReactNode;        // typically <Icon /> + label
  count: string;           // e.g. "3" or "0/1"
  warn?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ModuleSubSection({
  title,
  count,
  warn,
  defaultOpen = false,
  children,
}: ModuleSubSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded  border-b border-border py-1 pl-2 pr-1.5 text-[10px] font-bold uppercase tracking-wider text-text hover:bg-accent/5"
      >
        <span className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
          )}
          {title}
        </span>
        <span
          className={`font-mono rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            warn
              ? "bg-accent/20 text-warning"
              : "bg-accent/20 text-accent"
          }`}
        >
          {count}
        </span>
      </button>
      {open && <div className="mt-1 space-y-px">{children}</div>}
    </div>
  );
}

interface SubItemProps {
  name: string;
  trailing?: ReactNode;
  bullet?: string;       // tailwind text-color class for the leading bullet
  onClick?: () => void;
}

export function SubItem({ name, trailing, bullet, onClick }: SubItemProps) {
  const className =
    "group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] font-mono transition-colors hover:bg-accent/10";
  const inner = (
    <>
      <span className={`text-[9px] leading-none ${bullet ?? "text-accent"}`}>●</span>
      <span className="flex-1 truncate text-text font-medium">{name}</span>
      {trailing}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function SubEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-1.5 py-1 text-[10px] italic text-text-muted">{children}</p>
  );
}

interface SubPillProps {
  children: ReactNode;
  tone: "ok" | "bad";
  mono?: boolean;
}

export function SubPill({ children, tone, mono }: SubPillProps) {
  const toneClass =
    tone === "bad"
      ? "border-danger/50 bg-danger/15 text-danger"
      : "border-accent/50 bg-accent/15 text-accent";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${toneClass} ${
        mono ? "font-mono" : ""
      }`}
    >
      {children}
    </span>
  );
}
