import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./cards/TaskCard";
import { WorkflowCard } from "./cards/WorkflowCard";
import { ZONE_WRAPPER_CLASS } from "./zoneStyles";

interface ActiveWorkZoneProps {
  modules: ModuleInfo[];        // tasks + workflows, non-archived only, in display order
  loaded: LoadedModule[];
  onToggleModule: (name: string, enabled: boolean) => void;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "task" | "workflow") => void;
  onArchiveModule?: (name: string, archived: boolean) => void;
}

export function ActiveWorkZone({
  modules,
  loaded,
  onToggleModule,
  onEditModule,
  onDeleteModule,
  onArchiveModule,
}: ActiveWorkZoneProps) {
  if (modules.length === 0) {
    return (
      <div className={ZONE_WRAPPER_CLASS.active}>
        <SectionHeader count={0} />
        <p className="px-1 py-2 text-[11px] italic text-text-muted">
          No active tasks or workflows. Create one from Library below.
        </p>
      </div>
    );
  }

  return (
    <div className={ZONE_WRAPPER_CLASS.active}>
      <SectionHeader count={modules.length} />
      <div className="space-y-0">
        {modules.map((m) => {
          const loadedRecord = loaded.find((l) => l.name === m.name) ?? null;
          const common = {
            info: m,
            loaded: loadedRecord,
            onToggle: (enabled: boolean) => onToggleModule(m.name, enabled),
            onEdit: () => onEditModule(m.name),
            onDelete: () => onDeleteModule(m.name, m.kind as "task" | "workflow"),
          };
          if (m.kind === "task") {
            return (
              <TaskCard
                key={m.name}
                {...common}
                onArchiveToggle={
                  onArchiveModule
                    ? (archived) => onArchiveModule(m.name, archived)
                    : undefined
                }
              />
            );
          }
          return <WorkflowCard key={m.name} {...common} />;
        })}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text">
        Active work
      </span>
      <span className="text-[9px] text-text-muted">{count}</span>
    </div>
  );
}
