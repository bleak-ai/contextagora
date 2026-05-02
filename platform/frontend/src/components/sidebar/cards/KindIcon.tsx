import { Plug, ListTodo, Workflow } from "lucide-react";

type Kind = "integration" | "task" | "workflow";

const SPEC: Record<Kind, { Icon: typeof Plug; label: string; tint: string }> = {
  integration: { Icon: Plug, label: "Integration", tint: "text-cyan-400" },
  task: { Icon: ListTodo, label: "Task", tint: "text-amber-400" },
  workflow: { Icon: Workflow, label: "Workflow", tint: "text-violet-400" },
};

interface KindIconProps {
  kind: Kind;
  active?: boolean;
}

export function KindIcon({ kind, active = false }: KindIconProps) {
  const { Icon, label, tint } = SPEC[kind];
  return (
    <Icon
      aria-label={label}
      className={`h-3.5 w-3.5 shrink-0 ${active ? tint : "text-text-muted"}`}
    />
  );
}
