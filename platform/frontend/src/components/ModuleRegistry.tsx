import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchModules,
  fetchModule,
  createModule,
  updateModule,
  deleteModule,
} from "../api/modules";
import { fetchWorkspace } from "../api/workspace";
import { ModuleFileList } from "./ModuleFileList";
import { ModuleSecrets } from "./ModuleSecrets";

type ViewState =
  | { view: "none" }
  | { view: "create" }
  | { view: "detail"; name: string };

export function ModuleRegistry() {
  const queryClient = useQueryClient();
  const [viewState, setViewState] = useState<ViewState>({ view: "none" });

  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const modules = modulesData?.modules || [];
  const secretsStatus = workspace?.secrets || {};

  return (
    <div className="flex h-full">
      {/* Left panel — module list */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs text-text-secondary">
            Modules ({modules.length})
          </span>
          <button
            onClick={() => setViewState({ view: "create" })}
            className="text-xs text-accent hover:text-accent-hover"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {modules.map((name) => (
            <button
              key={name}
              onClick={() => setViewState({ view: "detail", name })}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors ${
                viewState.view === "detail" && viewState.name === name
                  ? "bg-bg-hover"
                  : ""
              }`}
            >
              <span className="text-sm text-text block">{name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {viewState.view === "none" && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-text-muted text-sm">Select a module to view its files and secrets</span>
            <span className="text-text-muted text-xs">or click <span className="text-accent">+ New</span> to create one</span>
          </div>
        )}
        {viewState.view === "create" && (
          <CreateModulePanel
            onCreated={(name) => {
              queryClient.invalidateQueries({ queryKey: ["modules"] });
              setViewState({ view: "detail", name });
            }}
            onCancel={() => setViewState({ view: "none" })}
          />
        )}
        {viewState.view === "detail" && (
          <ModuleDetailPanel
            key={viewState.name}
            name={viewState.name}
            secretsStatus={secretsStatus[viewState.name] || {}}
            onDeleted={() => {
              queryClient.invalidateQueries({ queryKey: ["modules"] });
              setViewState({ view: "none" });
            }}
          />
        )}
      </div>
    </div>
  );
}

// --- Create Module Panel ---

function CreateModulePanel({
  onCreated,
  onCancel,
}: {
  onCreated: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  const createMutation = useMutation({
    mutationFn: createModule,
    onSuccess: (data) => onCreated(data.name),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, content, summary, secrets: [] });
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 max-w-2xl space-y-4">
      <h2 className="text-sm font-semibold text-text">New Module</h2>
      <p className="text-xs text-text-muted">
        A module is a package of context the AI agent can access. Start with a name, summary, and main content file. You can add more files and secrets after creating.
      </p>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. linear"
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono outline-none focus:border-accent/40"
        />
        <p className="text-[10px] text-text-muted mt-1">
          Lowercase identifier, no spaces. Used as the folder name.
        </p>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Summary</label>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. Access Linear issues, projects, and teams via the GraphQL API"
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent/40"
        />
        <p className="text-[10px] text-text-muted mt-1">
          One-line description. The agent sees this when deciding which module to read.
        </p>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Content (info.md)
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={"# Module Name\n\nDocumentation for this module..."}
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono resize-y outline-none focus:border-accent/40"
        />
        <p className="text-[10px] text-text-muted mt-1">
          The main documentation file in markdown. This is the first thing the agent reads in this module.
        </p>
      </div>
      {createMutation.isError && (
        <p className="text-xs text-danger">
          {(createMutation.error as Error).message || "Failed to create module"}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- Module Detail Panel ---

function ModuleDetailPanel({
  name,
  secretsStatus,
  onDeleted,
}: {
  name: string;
  secretsStatus: Record<string, string | null>;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["module-detail", name],
    queryFn: () => fetchModule(name),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { content: string; summary: string; secrets: string[] }) =>
      updateModule(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-detail", name] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteModule(name),
    onSuccess: onDeleted,
  });

  const handleSecretsChange = (secrets: string[]) => {
    if (!detail) return;
    updateMutation.mutate({
      content: detail.content,
      summary: detail.summary,
      secrets,
    });
  };

  const handleDelete = () => {
    if (confirm(`Delete module "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  if (isLoading || !detail) {
    return (
      <div className="p-5 text-text-muted text-sm">Loading...</div>
    );
  }

  return (
    <div className="p-5 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-text">{name}</h2>
        <InlineSummary
          name={name}
          initialSummary={detail.summary}
          content={detail.content}
          secrets={detail.secrets}
        />
      </div>

      {/* Files */}
      <ModuleFileList moduleName={name} />

      {/* Secrets */}
      <ModuleSecrets
        moduleName={name}
        secrets={detail.secrets}
        secretsStatus={secretsStatus}
        onChange={handleSecretsChange}
        isPending={updateMutation.isPending}
      />

      {/* Danger zone */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="text-xs text-danger/60 hover:text-danger"
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete module"}
        </button>
      </div>
    </div>
  );
}

// --- Inline Summary ---

function InlineSummary({
  name,
  initialSummary,
  content,
  secrets,
}: {
  name: string;
  initialSummary: string;
  content: string;
  secrets: string[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialSummary);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialSummary);
  }, [initialSummary]);

  const saveMutation = useMutation({
    mutationFn: () => updateModule(name, { content, summary: value, secrets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-detail", name] });
      setEditing(false);
    },
  });

  const handleBlur = () => {
    if (value !== initialSummary) {
      saveMutation.mutate();
    } else {
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setValue(initialSummary);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1 text-sm text-text-secondary outline-none focus:border-accent/40"
      />
    );
  }

  return (
    <p
      onClick={() => setEditing(true)}
      className="mt-1 text-sm text-text-muted cursor-pointer hover:text-text-secondary"
      title="Click to edit"
    >
      {value || "Click to add a summary..."}
    </p>
  );
}
