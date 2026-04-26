import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Play, Edit2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ModuleInfo } from "../../api/modules";
import { fetchWorkflows } from "../../api/workflows";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";
import { StartRunModal } from "./StartRunModal";

interface WorkflowsGroupProps {
  tasks: ModuleInfo[];
  loadedNames: Set<string>;
  renderRun?: (task: ModuleInfo) => ReactNode;
}

export function WorkflowsGroup({ tasks, loadedNames, renderRun }: WorkflowsGroupProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [startRunFor, setStartRunFor] = useState<string | null>(null);
  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: fetchWorkflows,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="text-[9px] italic text-text-muted px-2.5 py-2">
        loading workflows...
      </div>
    );
  }
  if (workflows.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted px-2.5">
        Workflows
      </div>
      {workflows.map((w) => {
        const runs = tasks.filter((t) => t.parent_workflow === w.name);
        const anyLoaded = runs.some((r) => loadedNames.has(r.name));
        const dotClass = anyLoaded
          ? "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]"
          : "bg-text-muted";
        const isOpen = expanded[w.name] ?? false;
        return (
          <div
            key={w.name}
            className="border border-border bg-bg-hover rounded-md"
          >
            <div className="flex w-full items-stretch">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [w.name]: !isOpen }))}
                className="flex flex-1 items-center gap-2 px-2.5 py-2 text-left min-w-0"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                <span className="flex-1 text-xs font-semibold text-text truncate" title={w.name}>
                  {w.name}
                </span>
                {w.in_flight_runs > 0 && (
                  <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                    {w.in_flight_runs} in flight
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStartRunFor(w.name);
                }}
                className="px-2 flex items-center gap-1 text-[10px] font-semibold text-accent hover:bg-accent/10"
                title="Start a new run"
              >
                <Play className="w-3 h-3" /> Start
              </button>
              <button
                type="button"
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={() => setExpanded((e) => ({ ...e, [w.name]: !isOpen }))}
                className="px-2 flex items-center text-text-muted hover:text-text"
              >
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-border/60 px-2.5 py-2 space-y-2">
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Steps
                  </div>
                  <ul className="space-y-px text-[11px] font-mono text-text-secondary">
                    {w.steps.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                {runs.length > 0 && (
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted mb-1">
                      Runs
                    </div>
                    <div className="space-y-1">
                      {renderRun
                        ? runs.map((r) => renderRun(r))
                        : runs.map((r) => (
                            <button
                              key={r.name}
                              type="button"
                              onClick={() => openModuleEditor(r.name)}
                              className="hover:text-accent text-left w-full truncate text-[11px] text-text-secondary"
                            >
                              {r.name}
                            </button>
                          ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end border-t border-border/50 pt-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => openModuleEditor(w.name)}
                    className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {startRunFor && (
        <StartRunModal
          workflow={startRunFor}
          onClose={() => setStartRunFor(null)}
        />
      )}
    </div>
  );
}
