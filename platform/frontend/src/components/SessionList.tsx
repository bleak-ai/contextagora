import { useState } from "react";
import {
  createSession,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
} from "../api/sessions";
import { useSessionStore } from "../hooks/useSessionStore";
import { useChatStore } from "../hooks/useChatStore";

export function SessionList() {
  const { activeSessionId, setActiveSession, addSession, removeSession, renameSession: renameLocal } =
    useSessionStore();
  const deleteSessionMessages = useChatStore((s) => s.deleteSessionMessages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const session = await createSession();
      addSession({ id: session.id, name: session.name, createdAt: session.created_at });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteSessionMessages(id);
    removeSession(id);
    // Fire-and-forget backend cleanup
    apiDeleteSession(id).catch(() => {});
  };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const submitRename = () => {
    if (editingId && editName.trim()) {
      renameLocal(editingId, editName.trim());
      // Fire-and-forget backend sync
      apiRenameSession(editingId, editName.trim()).catch(() => {});
      setEditingId(null);
    }
  };

  return (
    <div className="px-3 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-secondary">Sessions</span>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + New
        </button>
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-[10px] text-text-muted px-2 py-1">
            No sessions yet. Click + New to start.
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              s.id === activeSessionId
                ? "bg-accent/10 text-accent"
                : "text-text hover:bg-bg-hover"
            }`}
          >
            {editingId === s.id ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                className="flex-1 text-sm bg-transparent border-b border-accent outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="flex-1 text-sm truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(s.id, s.name);
                }}
              >
                {s.name}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(s.id);
              }}
              className="hidden group-hover:block text-text-muted hover:text-danger text-xs"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
