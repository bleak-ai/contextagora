import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { fetchModules } from "../api/modules";
import { fetchWorkspace, loadModules, refreshSecrets } from "../api/workspace";
import { SessionList } from "./SessionList";

export function Sidebar() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 border-r border-border bg-bg-raised flex flex-col items-center py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="text-text-muted hover:text-text p-1"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3L11 8L6 13" />
          </svg>
        </button>
        <span className="mt-3 text-[10px] text-accent font-mono">{loaded.length}</span>
      </div>
    );
  }

  return (
    <aside className="w-72 flex-shrink-0 border-r border-border flex flex-col h-full bg-bg-raised">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-accent font-semibold text-sm tracking-wide">CONTEXT LOADER</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-text-muted hover:text-text p-1"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8L10 13" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <SessionList />

      {/* Module list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary">
            {selected.size} / {modules.length} selected
          </span>
        </div>
        <div className="space-y-1">
          {modules.map((name) => (
            <label
              key={name}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-hover transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(name)}
                onChange={() => toggleModule(name)}
                className="accent-accent"
              />
              <span className={`text-sm ${selected.has(name) ? "text-accent" : "text-text"}`}>
                {name}
              </span>
            </label>
          ))}
        </div>

        {/* Load button */}
        <button
          onClick={handleLoad}
          disabled={loadMutation.isPending || selected.size === 0}
          className="mt-3 w-full py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-30 transition-opacity"
        >
          {loadMutation.isPending ? "Loading..." : "Load Selected"}
        </button>

        {/* Loaded modules with secrets */}
        {loaded.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary">Loaded</span>
              <button
                onClick={() => secretsMutation.mutate()}
                disabled={secretsMutation.isPending}
                className="text-[10px] text-text-muted hover:text-text-secondary"
              >
                {secretsMutation.isPending ? "Checking..." : "Refresh secrets"}
              </button>
            </div>
            {loaded.map((name) => (
              <div key={name} className="mb-2">
                <span className="text-xs text-accent">{name}</span>
                {secrets[name] && (
                  <div className="ml-2 mt-0.5">
                    {Object.entries(secrets[name]).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-1 text-[10px]">
                        <span className={val ? "text-success" : "text-danger"}>
                          {val ? "\u2713" : "\u2717"}
                        </span>
                        <span className="text-text-muted font-mono">{key}</span>
                        {val && <span className="text-text-muted">{val}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 flex items-center justify-between">
        <Link
          to="/modules"
          className={`text-xs py-1 ${location.pathname === "/modules" ? "text-accent" : "text-text-muted hover:text-text-secondary"}`}
        >
          Manage modules...
        </Link>
      </div>
    </aside>
  );
}
