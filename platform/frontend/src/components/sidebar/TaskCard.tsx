import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveModule, deleteModule } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";

interface Props {
  name: string;
  summary: string;
  loaded: LoadedModule | null;   // null = not loaded
  selected: boolean;
  onToggleSelect: () => void;
}

export function TaskCard({ name, summary, loaded, selected, onToggleSelect }: Props) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["modules"] });
    queryClient.invalidateQueries({ queryKey: ["workspace"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["root-context"] });
  };

  const archiveMutation = useMutation({
    mutationFn: () => archiveModule(name),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteModule(name),
    onSuccess: invalidate,
  });

  const isLoaded = loaded !== null;
  const borderClass = isLoaded
    ? "border-accent/70"
    : selected
      ? "border-accent/50"
      : "border-dashed border-border";
  const bgClass = isLoaded
    ? "bg-accent/[0.10]"
    : "bg-bg-hover";
  const dotClass = isLoaded
    ? "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]"
    : "bg-text-muted";

  return (
    <div className={`mb-1.5 overflow-hidden rounded-md border ${bgClass} ${borderClass}`}>
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 accent-accent"
        />
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-text block truncate">{name}</span>
          {summary && (
            <span className="text-[10px] text-text-muted block truncate">{summary}</span>
          )}
        </div>
        {/* Archive */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            archiveMutation.mutate();
          }}
          disabled={archiveMutation.isPending}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
          title="Archive task"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        </button>
        {/* Delete */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete task "${name}"? This cannot be undone.`)) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-bg-hover transition-colors"
          title="Delete task"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
