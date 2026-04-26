import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { deleteModule, type ModuleInfo } from "../../api/modules";
import { invalidateModuleQueries } from "../../lib/queryClient";
import { Modal } from "../Modal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

interface ArchiveModalProps {
  archivedTasks: ModuleInfo[];
  onClose: () => void;
  onUnarchive: (name: string) => void | Promise<void>;
}

export function ArchiveModal({
  archivedTasks,
  onClose,
  onUnarchive,
}: ArchiveModalProps) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteModule,
    onSuccess: () => invalidateModuleQueries(queryClient),
  });

  return (
    <Modal onClose={onClose}>
      <div
        className="bg-bg-raised border border-border rounded-lg w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-text">
            Archived Tasks
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 overflow-y-auto flex-1">
          {archivedTasks.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-[11px]">
              No archived tasks yet
            </div>
          ) : (
            archivedTasks.map((task) => (
              <div
                key={task.name}
                className="border border-border rounded-md bg-bg p-3 mb-2 last:mb-0"
              >
                <div className="text-[11px] font-semibold text-text">
                  {task.name}
                </div>
                {task.summary && (
                  <div className="text-[10px] text-text-secondary mt-1">
                    {task.summary}
                  </div>
                )}
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await onUnarchive(task.name);
                      onClose();
                    }}
                    className="text-[9px] text-accent hover:text-accent-hover"
                  >
                    Unarchive
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(task.name)}
                    disabled={deleteMutation.isPending}
                    className="text-[9px] text-red-400/60 hover:text-red-400 disabled:opacity-50"
                  >
                    {deleteMutation.isPending && pendingDelete === task.name
                      ? "..."
                      : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDeleteModal
          title="Delete task"
          name={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(pendingDelete);
          }}
        />
      )}
    </Modal>
  );
}
