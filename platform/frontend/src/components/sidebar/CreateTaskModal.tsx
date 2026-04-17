import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createModule } from "../../api/modules";
import { invalidateModuleQueries } from "../../lib/queryClient";

interface Props {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createModule({ name, kind: "task", description: description || undefined }),
    onSuccess: () => {
      invalidateModuleQueries(queryClient);
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-bg-raised p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-text mb-3">New Task</h3>

        <label className="block mb-3">
          <span className="text-[11px] text-text-muted mb-1 block">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tax Correction"
            autoFocus
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[11px] text-text-muted mb-1 block">
            Description <span className="text-text-muted/60">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this task about?"
            rows={2}
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || mutation.isPending}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>

        {mutation.isError && (
          <p className="mt-2 text-[10px] text-red-400">
            Failed to create task. Try a different name.
          </p>
        )}
      </form>
    </div>
  );
}
