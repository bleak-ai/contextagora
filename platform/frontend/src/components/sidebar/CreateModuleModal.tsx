import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createModule } from "../../api/modules";
import { invalidateModuleQueries } from "../../lib/queryClient";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";
import { Modal } from "../Modal";

interface Props {
  onClose: () => void;
}

export function CreateModuleModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();
  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  const mutation = useMutation({
    mutationFn: () =>
      createModule({
        name,
        kind: "integration",
        content: content || undefined,
        summary: summary || undefined,
      }),
    onSuccess: (data) => {
      invalidateModuleQueries(queryClient);
      onClose();
      openModuleEditor(data.name);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  };

  return (
    <Modal onClose={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-bg-raised p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-text mb-3">
          New Integration
        </h3>

        <label className="block mb-3">
          <span className="text-[11px] text-text-muted mb-1 block">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. linear"
            autoFocus
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-3">
          <span className="text-[11px] text-text-muted mb-1 block">
            Summary
          </span>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line description"
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[11px] text-text-muted mb-1 block">
            Content (info.md){" "}
            <span className="text-text-muted/60">(optional)</span>
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Module Name&#10;&#10;Documentation..."
            rows={4}
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text font-mono placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
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
            Failed to create module. Try a different name.
          </p>
        )}
      </form>
    </Modal>
  );
}
