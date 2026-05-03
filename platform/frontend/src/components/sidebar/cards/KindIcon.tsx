import { Plug, ListTodo, Workflow } from "lucide-react";

type Kind = "integration" | "task" | "workflow";

const TINT_BY_KIND: Record<Kind, string> = {
  integration: "text-accent-secondary",  // cyan from --color-accent-secondary
  task: "text-accent",                   // mint from --color-accent
  workflow: "text-warning",              // gold from --color-warning
};

const SPEC: Record<Kind, { Icon: typeof Plug; label: string }> = {
  integration: { Icon: Plug, label: "Integration" },
  task: { Icon: ListTodo, label: "Task" },
  workflow: { Icon: Workflow, label: "Workflow" },
};

interface KindIconProps {
  kind: Kind;
  active?: boolean;
}

export function KindIcon({ kind, active = false }: KindIconProps) {
  const { Icon, label } = SPEC[kind];
  const tintClass = active ? TINT_BY_KIND[kind] : "text-text-muted";
  return (
    <Icon
      aria-label={label}
      className={`h-3.5 w-3.5 shrink-0 ${tintClass}`}
    />
  );
}
