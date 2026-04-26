import { useState } from "react";
import { ChevronDown, ChevronRight, Play, Edit2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ModuleInfo } from "../../api/modules";
import { fetchWorkflows } from "../../api/workflows";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";
import { StartRunModal } from "./StartRunModal";

interface WorkflowsGroupProps {
  /** All task modules — used to surface in-flight runs nested under each workflow. */
  tasks: ModuleInfo[];
}

export function WorkflowsGroup({ tasks }: WorkflowsGroupProps) {
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
        const isOpen = expanded[w.name] ?? false;
        return (
          <div
            key={w.name}
            className="border border-border bg-bg-hover rounded-md"
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((e) => ({ ...e, [w.name]: !isOpen }))
              }
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            >
              {isOpen
                ? <ChevronDown className="w-3 h-3 text-text-muted" />
                : <ChevronRight className="w-3 h-3 text-text-muted" />}
              <span className="flex-1 text-xs font-semibold text-text">
                {w.name}
              </span>
              <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-semibold">
                {w.in_flight_runs} in flight
              </span>
            </button>
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
                    <ul className="space-y-px text-[11px] text-text-secondary">
                      {runs.map((r) => (
                        <li key={r.name}>
                          <button
                            type="button"
                            onClick={() => openModuleEditor(r.name)}
                            className="hover:text-accent text-left w-full truncate"
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/50 pt-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setStartRunFor(w.name)}
                    className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Start run
                  </button>
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
