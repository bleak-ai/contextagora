import { useState } from "react";
import { Modal } from "../Modal";
import { useChatStore } from "../../hooks/useChatStore";
import { useNavigateToSession } from "../../hooks/useActiveSession";

interface StartRunModalProps {
  workflow: string;
  onClose: () => void;
}

export function StartRunModal({ workflow, onClose }: StartRunModalProps) {
  const [title, setTitle] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const navigateToSession = useNavigateToSession();

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const seed = [
      `Begin a new run of the ${workflow} workflow.`,
      `Title: "${trimmed}"`,
      `Read the entry step from the ${workflow} workflow folder and follow it exactly.`,
      `The step's prose will tell you to call POST /api/workflows/${workflow}/runs with this title to create the run task.`,
    ].join("\n");
    navigateToSession(null);
    sendMessage(null, seed);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-4 space-y-3 min-w-[360px]">
        <h2 className="text-sm font-semibold text-text">
          Start run — {workflow}
        </h2>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
            What's this run about?
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="e.g. SUP-42 refund subscription"
            className="w-full px-2 py-1.5 text-sm bg-bg border border-border rounded focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-3 py-1 text-xs bg-accent text-white rounded disabled:opacity-50"
          >
            Start
          </button>
        </div>
      </div>
    </Modal>
  );
}
