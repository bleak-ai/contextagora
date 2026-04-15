import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unarchiveModule, deleteModule, type ModuleInfo } from "../../api/modules";

interface Props {
  tasks: ModuleInfo[];
}

export function ArchivedSection({ tasks }: Props) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] text-text-muted hover:text-text transition-colors"
      >
        <span>{open ? "\u25BE" : "\u25B8"}</span>
        <span className="tracking-wider">ARCHIVED</span>
        <span className="ml-auto font-mono text-[9px]">{tasks.length}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {tasks.map((t) => (
            <ArchivedTaskRow key={t.name} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivedTaskRow({ task }: { task: ModuleInfo }) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["modules"] });
    queryClient.invalidateQueries({ queryKey: ["workspace"] });
  };

  const unarchiveMutation = useMutation({
    mutationFn: () => unarchiveModule(task.name),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteModule(task.name),
    onSuccess: invalidate,
  });

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover">
      <span className="flex-1 truncate">{task.name}</span>
      <button
        type="button"
        onClick={() => unarchiveMutation.mutate()}
        disabled={unarchiveMutation.isPending}
        className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50"
      >
        {unarchiveMutation.isPending ? "..." : "unarchive"}
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete task "${task.name}"? This cannot be undone.`)) {
            deleteMutation.mutate();
          }
        }}
        disabled={deleteMutation.isPending}
        className="text-[10px] text-red-400/60 hover:text-red-400 disabled:opacity-50"
      >
        {deleteMutation.isPending ? "..." : "delete"}
      </button>
    </div>
  );
}
