import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "../Modal";

interface ConfirmDeleteModalProps {
  title: string;
  name: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteModal({
  title,
  name,
  description,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div
        className="bg-bg-raised border border-border rounded-lg w-full max-w-sm overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-text">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-[12px] text-text">
            Delete <span className="font-mono font-semibold">{name}</span>?
          </p>
          <p className="text-[11px] text-text-muted mt-1">
            {description ?? "This cannot be undone."}
          </p>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[11px] text-text-muted hover:text-text px-2 py-1 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="text-[11px] text-red-400 hover:text-red-300 border border-red-400/40 hover:border-red-400/70 px-2.5 py-1 rounded disabled:opacity-50"
          >
            {pending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
