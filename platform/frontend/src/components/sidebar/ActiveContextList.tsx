import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./cards/TaskCard";
import { IntegrationCard } from "./cards/IntegrationCard";
import { WorkflowCard } from "./cards/WorkflowCard";

interface ActiveContextListProps {
  modules: ModuleInfo[]; // loaded subset only, in display order
  loaded: LoadedModule[]; // full loaded array (for lookup)
  onToggleModule: (name: string, enabled: boolean) => void;
  onEditModule: (name: string) => void;
  onDeleteModule: (
    name: string,
    kind: "task" | "integration" | "workflow",
  ) => void;
  onArchiveModule?: (name: string, archived: boolean) => void;
}

export function ActiveContextList({
  modules,
  loaded,
  onToggleModule,
  onEditModule,
  onDeleteModule,
  onArchiveModule,
}: ActiveContextListProps) {
  if (modules.length === 0) {
    return (
      <div className="mb-3">
        <SectionHeader count={0} />
        <p className="px-2 py-3 text-[11px] italic text-text-muted">
          No modules loaded. Pick from Available below.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <SectionHeader count={modules.length} />
      <div className="space-y-0">
        {modules.map((m) => {
          const loadedRecord = loaded.find((l) => l.name === m.name) ?? null;
          const common = {
            key: m.name,
            info: m,
            loaded: loadedRecord,
            onToggle: (enabled: boolean) => onToggleModule(m.name, enabled),
            onEdit: () => onEditModule(m.name),
            onDelete: () => onDeleteModule(m.name, m.kind),
          };
          if (m.kind === "task") {
            return (
              <TaskCard
                {...common}
                onArchiveToggle={
                  onArchiveModule
                    ? (archived) => onArchiveModule(m.name, archived)
                    : undefined
                }
              />
            );
          }
          if (m.kind === "workflow") {
            return <WorkflowCard {...common} />;
          }
          return <IntegrationCard {...common} />;
        })}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-1.5 px-1">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_4px_rgba(92,184,122,0.5)]" />
        Loaded
      </span>
      <span className="text-[9px] text-text-muted">{count}</span>
    </div>
  );
}
