import { useState } from "react";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./TaskCard";
import { ArchivedSection } from "./ArchivedSection";
import { CreateTaskModal } from "./CreateTaskModal";

interface Props {
  tasks: ModuleInfo[];              // active (non-archived) task ModuleInfos
  archivedTasks: ModuleInfo[];      // archived task ModuleInfos
  loaded: LoadedModule[];           // currently loaded modules (all kinds)
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onLoad: () => void;
  isLoading: boolean;
}

export function TaskZone({
  tasks,
  archivedTasks,
  loaded,
  selected,
  onToggleSelect,
  onLoad,
  isLoading,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const loadedMap = new Map(loaded.map((m) => [m.name, m]));

  // Check if any task's selection differs from its load state
  const taskNames = tasks.map((t) => t.name);
  const hasTaskChanges = taskNames.some((n) => {
    const isSelected = selected.has(n);
    const isLoaded = loadedMap.has(n);
    return isSelected !== isLoaded;
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">TASKS</span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded border border-border bg-bg-raised px-1.5 py-0.5 text-[9px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
        >
          + New Task
        </button>
      </div>

      {tasks.length === 0 && !showCreate && (
        <p className="px-1.5 py-2 text-[10px] italic text-text-muted">
          No active tasks. Click "+ New Task" to create one.
        </p>
      )}

      {tasks.map((t) => (
        <TaskCard
          key={t.name}
          name={t.name}
          summary={t.summary}
          loaded={loadedMap.get(t.name) ?? null}
          selected={selected.has(t.name)}
          onToggleSelect={() => onToggleSelect(t.name)}
        />
      ))}

      {tasks.length > 0 && hasTaskChanges && (
        <button
          type="button"
          onClick={onLoad}
          disabled={isLoading}
          className={`mt-1 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
            isLoading
              ? "animate-pulse bg-accent/20 text-accent"
              : "bg-accent text-accent-text hover:bg-accent-hover"
          } disabled:cursor-not-allowed disabled:opacity-30`}
        >
          {isLoading ? "Loading..." : "Apply Changes"}
        </button>
      )}

      <ArchivedSection tasks={archivedTasks} />
      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
