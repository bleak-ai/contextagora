import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModules } from "../api/modules";
import {
  fetchWorkspace,
  loadModules,
  refreshSecrets,
  type LoadError,
} from "../api/workspace";
import { fetchSessions } from "../api/sessions";
import { useSessionStore } from "../hooks/useSessionStore";
import { DecisionTreePanel } from "./chat/DecisionTreePanel";
import { SyncControls } from "./SyncControls";
import { ModuleList } from "./sidebar/ModuleList";

export function ContextPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Session state
  const activeClaudeSessionId = useSessionStore(
    (s) => s.activeClaudeSessionId,
  );
  const setActiveClaudeSessionId = useSessionStore(
    (s) => s.setActiveClaudeSessionId,
  );
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
  });
  const sessions = sessionsData?.sessions ?? [];
  const [collapsed, setCollapsed] = useState(false);
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([]);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  // Resizable width
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 640;
  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem("context-panel-width"));
    return Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH
      ? stored
      : 320;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, window.innerWidth - e.clientX),
      );
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("context-panel-width", String(width));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      setLoadErrors(data.errors ?? []);
    },
  });

  const secretsMutation = useMutation({
    mutationFn: refreshSecrets,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const modules = modulesData?.modules || [];           // string[] — all available
  const loaded = workspace?.modules || [];              // LoadedModule[] — currently loaded
  const loadedNames = loaded.map((m) => m.name);

  // Sync selected state with loaded modules on first load
  if (selected.size === 0 && loadedNames.length > 0) {
    setSelected(new Set(loadedNames));
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
    selected.size === loadedNames.length &&
    loadedNames.every((n) => selected.has(n));

  if (collapsed) {
    return (
      <aside className="w-10 flex-shrink-0 border-l border-border bg-bg-raised flex flex-col items-center h-full">
        <button
          onClick={toggleCollapsed}
          className="mt-3 p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text transition-colors"
          title="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {loaded.length > 0 && (
          <span className="mt-2 text-accent text-[9px] font-medium">{loaded.length}</span>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-[320px] flex-shrink-0 border-l border-border bg-bg-raised flex flex-col h-full">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border flex items-center justify-between">
        <span className="text-accent text-[11px] font-semibold tracking-wider">
          CONTEXT
        </span>
        <div className="flex items-center gap-2">
          <SyncControls />
          {loaded.length > 0 && (
            <span className="bg-accent-dim text-accent text-[10px] px-2 py-0.5 rounded-full">
              {loaded.length} loaded
            </span>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text transition-colors"
            title="Collapse sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2.5">
        {/* Sessions */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] text-text-muted tracking-wider">
              SESSIONS
            </span>
            <button
              onClick={() => setActiveClaudeSessionId(null)}
              className="text-[10px] text-accent hover:text-accent-hover"
            >
              + New chat
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
                onClick={() => setActiveClaudeSessionId(s.id)}
                className={`group flex items-center gap-1 px-1.5 py-1.5 rounded cursor-pointer transition-colors ${
                  s.id === activeClaudeSessionId
                    ? "bg-accent/10 text-accent"
                    : "text-text hover:bg-bg-hover"
                }`}
              >
                <span className="flex-1 text-xs truncate">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modules + Secrets */}
        <div className="mb-3">
          <ModuleList
            loaded={loaded}
            available={modules}
            selected={selected}
            onToggleSelect={toggleModule}
            onLoad={handleLoad}
            isLoading={loadMutation.isPending}
            selectionMatchesLoaded={selectionMatchesLoaded}
            onRefreshSecrets={() => secretsMutation.mutate()}
            isRefreshingSecrets={secretsMutation.isPending}
          />

          {loadErrors.length > 0 && (
            <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">Failed to load:</span>
                <button
                  type="button"
                  onClick={() => setLoadErrors([])}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <ul className="mt-1 space-y-1">
                {loadErrors.map((e) => (
                  <li key={e.module}>
                    <span className="font-mono">{e.module}</span>
                    {e.reason === "missing_secrets" ? (
                      <>
                        {" — missing "}
                        {e.missing?.length ? (
                          <span className="font-mono">{e.missing.join(", ")}</span>
                        ) : (
                          "secrets"
                        )}
                      </>
                    ) : (
                      <> — {e.reason}</>
                    )}
                  </li>
                ))}
              </ul>
            </div>
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
