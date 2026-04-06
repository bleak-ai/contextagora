import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModules } from "../api/modules";
import { fetchWorkspace, loadModules, refreshSecrets } from "../api/workspace";
import {
  createSession,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
} from "../api/sessions";
import { useSessionStore } from "../hooks/useSessionStore";
import { useChatStore } from "../hooks/useChatStore";
import { DecisionTreePanel } from "./chat/DecisionTreePanel";

export function ContextPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Session state
  const {
    activeSessionId,
    setActiveSession,
    addSession,
    removeSession,
    renameSession: renameLocal,
    sessions,
  } = useSessionStore();
  const deleteSessionMessages = useChatStore((s) => s.deleteSessionMessages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);

  // Module + workspace queries
  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const loadMutation = useMutation({
    mutationFn: loadModules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const secretsMutation = useMutation({
    mutationFn: refreshSecrets,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const modules = modulesData?.modules || [];
  const loaded = workspace?.modules || [];
  const secrets = workspace?.secrets || {};

  // Sync selected state with loaded modules on first load
  if (selected.size === 0 && loaded.length > 0) {
    setSelected(new Set(loaded));
  }

  const toggleModule = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleLoad = () => {
    loadMutation.mutate([...selected]);
  };

  // Determine load button state
  const selectionMatchesLoaded =
    selected.size === loaded.length &&
    [...selected].every((m) => loaded.includes(m));
  const isLoading = loadMutation.isPending;

  // Session handlers
  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const session = await createSession();
      addSession({
        id: session.id,
        name: session.name,
        createdAt: session.created_at,
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSession = (id: string) => {
    deleteSessionMessages(id);
    removeSession(id);
    apiDeleteSession(id).catch(() => {});
  };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const submitRename = () => {
    if (editingId && editName.trim()) {
      renameLocal(editingId, editName.trim());
      apiRenameSession(editingId, editName.trim()).catch(() => {});
      setEditingId(null);
    }
  };

  return (
    <aside className="w-[320px] flex-shrink-0 border-l border-border bg-bg-raised flex flex-col h-full">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border flex items-center justify-between">
        <span className="text-accent text-[11px] font-semibold tracking-wider">
          CONTEXT
        </span>
        {loaded.length > 0 && (
          <span className="bg-accent-dim text-accent text-[10px] px-2 py-0.5 rounded-full">
            {loaded.length} loaded
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2.5">
        {/* Sessions */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] text-text-muted tracking-wider">
              SESSIONS
            </span>
            <button
              onClick={handleCreateSession}
              disabled={creating}
              className="text-[10px] text-accent hover:text-accent-hover"
            >
              + New
            </button>
          </div>
          <div className="space-y-0.5 max-h-[150px] overflow-y-auto">
            {sessions.length === 0 && (
              <p className="text-[10px] text-text-muted px-1.5 py-1">
                No sessions yet
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className={`group flex items-center gap-1 px-1.5 py-1.5 rounded cursor-pointer transition-colors ${
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
                    className="flex-1 text-xs bg-transparent border-b border-accent outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
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
                    handleDeleteSession(s.id);
                  }}
                  className="hidden group-hover:block text-text-muted hover:text-danger text-xs"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="mb-3">
          <div className="px-1 mb-1.5">
            <span className="text-[10px] text-text-muted tracking-wider">
              MODULES
            </span>
          </div>
          <div className="space-y-0.5">
            {modules.map((name) => {
              const isSelected = selected.has(name);
              const isLoaded = loaded.includes(name);
              return (
                <label
                  key={name}
                  className={`flex items-center gap-2 px-1.5 py-1.5 rounded cursor-pointer transition-colors ${
                    isSelected ? "bg-accent/10" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleModule(name)}
                    className="accent-accent w-3.5 h-3.5"
                  />
                  <span
                    className={`flex-1 text-xs ${
                      isSelected
                        ? "text-accent font-medium"
                        : "text-text-secondary"
                    }`}
                  >
                    {name}
                  </span>
                  {isLoaded && (
                    <span className="text-success text-[10px]" title="Loaded">
                      &#10003;
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Load button */}
          <button
            onClick={handleLoad}
            disabled={isLoading || selected.size === 0}
            className={`mt-2 w-full py-1.5 text-xs font-medium rounded-md transition-all ${
              isLoading
                ? "bg-accent/20 text-accent animate-pulse"
                : selectionMatchesLoaded && loaded.length > 0
                  ? "bg-accent/10 text-accent/70 border border-accent/20 cursor-default"
                  : "bg-accent text-accent-text hover:bg-accent-hover"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {isLoading
              ? "Loading..."
              : selectionMatchesLoaded && loaded.length > 0
                ? `${loaded.length} Module${loaded.length !== 1 ? "s" : ""} Loaded`
                : "Load Selected"}
          </button>
        </div>

        {/* Secrets */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] text-text-muted tracking-wider">
              SECRETS
            </span>
            <button
              onClick={() => secretsMutation.mutate()}
              disabled={secretsMutation.isPending}
              className="flex items-center gap-1 text-[10px] text-text-secondary bg-border border border-border-light px-1.5 py-0.5 rounded hover:text-text"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
              {secretsMutation.isPending ? "..." : "Refresh"}
            </button>
          </div>

          {loaded.length === 0 ? (
            <p className="text-[11px] text-text-muted text-center py-3">
              Load modules to see secrets
            </p>
          ) : (
            loaded.map((name) => (
              <div key={name} className="mb-2.5">
                <div className="text-[11px] text-accent font-medium mb-1 px-1">
                  {name}
                </div>
                {secrets[name] &&
                  Object.entries(secrets[name]).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 text-[10px] px-1.5 mb-0.5"
                    >
                      <span className={val ? "text-success" : "text-danger"}>
                        {val ? "\u2713" : "\u2717"}
                      </span>
                      <span className="text-text-secondary font-mono">
                        {key}
                      </span>
                      {val ? (
                        <span className="ml-auto text-text-muted font-mono">
                          {val}
                        </span>
                      ) : (
                        <span className="ml-auto bg-danger/10 text-danger text-[9px] px-1.5 py-0.5 rounded">
                          missing
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>

        {/* Decision Tree */}
        <div className="pt-3 border-t border-border">
          <div className="text-[10px] text-text-muted tracking-wider mb-2 px-1">
            DECISION TREE
          </div>
          <DecisionTreePanel />
        </div>
      </div>
    </aside>
  );
}
