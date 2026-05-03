import { useState } from "react";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import type { ModuleInfo } from "../../api/modules";
import { TaskCard } from "./cards/TaskCard";
import { WorkflowCard } from "./cards/WorkflowCard";

interface LibraryZoneProps {
  archivedModules: ModuleInfo[];
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "task" | "workflow") => void;
  onArchiveModule?: (name: string, archived: boolean) => void;
}

export function LibraryZone({
  archivedModules,
  onEditModule,
  onDeleteModule,
  onArchiveModule,
}: LibraryZoneProps) {
  const [open, setOpen] = useState(false);

  const archivedTasks = archivedModules.filter((m) => m.kind === "task");
  const archivedWorkflows = archivedModules.filter((m) => m.kind === "workflow");
  const total = archivedModules.length;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-border-light bg-bg-raised/40 px-3 py-2.5 text-left hover:border-accent hover:text-text"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
        )}
        <Archive className="w-3 h-3 text-text-muted shrink-0" />
        <span className="text-[11px] font-semibold text-text-secondary flex-1">
          Library
        </span>
        <span className="text-[10px] text-text-muted">{total}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-border bg-bg-raised p-2.5 space-y-2">
          {archivedTasks.length > 0 && (
            <SubGroup label={`Archived tasks (${archivedTasks.length})`}>
              {archivedTasks.map((m) => (
                <TaskCard
                  key={m.name}
                  info={m}
                  loaded={null}
                  onEdit={() => onEditModule(m.name)}
                  onDelete={() => onDeleteModule(m.name, "task")}
                  onArchiveToggle={
                    onArchiveModule
                      ? (archived) => onArchiveModule(m.name, archived)
                      : undefined
                  }
                />
              ))}
            </SubGroup>
          )}

          {archivedWorkflows.length > 0 && (
            <SubGroup label={`Archived workflows (${archivedWorkflows.length})`}>
              {archivedWorkflows.map((m) => (
                <WorkflowCard
                  key={m.name}
                  info={m}
                  loaded={null}
                  onEdit={() => onEditModule(m.name)}
                  onDelete={() => onDeleteModule(m.name, "workflow")}
                />
              ))}
            </SubGroup>
          )}

          {total === 0 && (
            <p className="px-1 py-1 text-[11px] italic text-text-muted">
              Nothing archived yet.
            </p>
          )}

        </div>
      )}
    </div>
  );
}

function SubGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1 px-1">
        {label}
      </p>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
