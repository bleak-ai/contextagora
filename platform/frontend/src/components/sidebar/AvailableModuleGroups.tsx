import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./cards/TaskCard";
import { IntegrationCard } from "./cards/IntegrationCard";
import { WorkflowCard } from "./cards/WorkflowCard";

type Kind = "integration" | "task" | "workflow";

const KIND_ORDER: Kind[] = ["integration", "task", "workflow"];
const KIND_LABEL: Record<Kind, string> = {
  integration: "Integrations",
  task: "Tasks",
  workflow: "Workflows",
};

interface AvailableModuleGroupsProps {
  modules: ModuleInfo[];                        // idle subset
  loaded: LoadedModule[];                       // full loaded array (for card lookups; usually unused for idle)
  onToggleModule: (name: string, enabled: boolean) => void;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: Kind) => void;
  onArchiveModule?: (name: string, archived: boolean) => void;
  onAddModule?: (kind: Kind) => void;           // optional: opens a create flow
}

export function AvailableModuleGroups(props: AvailableModuleGroupsProps) {
  const total = props.modules.length;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text">
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted/60" />
          Unloaded
        </span>
        <span className="text-[9px] text-text-secondary">{total}</span>
      </div>
      <div className="space-y-1">
        {KIND_ORDER.map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            items={props.modules.filter((m) => m.kind === kind)}
            {...props}
          />
        ))}
      </div>
    </div>
  );
}

function KindSection({
  kind,
  items,
  loaded,
  onToggleModule,
  onEditModule,
  onDeleteModule,
  onArchiveModule,
  onAddModule,
}: {
  kind: Kind;
  items: ModuleInfo[];
} & Omit<AvailableModuleGroupsProps, "modules">) {
  // Default open if there are items, closed if empty (CTA still visible inline).
  const [open, setOpen] = useState(items.length > 0);
  const empty = items.length === 0;

  return (
    <div className="border border-border/40 rounded">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-bg-hover/50"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary flex-1">
          {KIND_LABEL[kind]}
        </span>
        <span className="text-[9px] text-text-muted">
          {empty ? "0" : items.length}
        </span>
      </button>

      {open && (
        <div className="px-2 pb-2 pt-0.5">
          {empty ? (
            onAddModule ? (
              <button
                type="button"
                onClick={() => onAddModule(kind)}
                className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover py-1"
              >
                <Plus className="w-3 h-3" /> Add {KIND_LABEL[kind].toLowerCase().replace(/s$/, "")}
              </button>
            ) : (
              <p className="text-[10px] italic text-text-muted py-1">
                None available.
              </p>
            )
          ) : (
            <div className="space-y-0">
              {items.map((m) => {
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
          )}
        </div>
      )}
    </div>
  );
}
