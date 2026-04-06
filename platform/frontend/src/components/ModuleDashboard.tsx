import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  fetchModules,
  fetchModule,
  fetchModuleFiles,
  createModule,
} from "../api/modules";

export function ModuleDashboard() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: modulesData, isLoading } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const modules = modulesData?.modules || [];

  // Fetch details and files for all modules in parallel
  const detailQueries = useQueries({
    queries: modules.map((name) => ({
      queryKey: ["module-detail", name],
      queryFn: () => fetchModule(name),
      staleTime: 30_000,
    })),
  });

  const fileQueries = useQueries({
    queries: modules.map((name) => ({
      queryKey: ["module-files", name],
      queryFn: () => fetchModuleFiles(name),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-sm font-semibold text-text">Modules</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover"
        >
          + New Module
        </button>
      </div>

      <div className="p-6">
        {/* Create form */}
        {creating && (
          <CreateModuleForm
            onCreated={(_name) => {
              queryClient.invalidateQueries({ queryKey: ["modules"] });
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        )}

        {/* Loading */}
        {isLoading && (
          <p className="text-sm text-text-muted">Loading modules...</p>
        )}

        {/* Empty state */}
        {!isLoading && modules.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-text-muted text-sm">No modules yet</span>
            <span className="text-text-muted text-xs">
              Click{" "}
              <span className="text-accent">+ New Module</span> to create one
            </span>
          </div>
        )}

        {/* Cards grid */}
        {modules.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map((name, i) => {
              const detail = detailQueries[i]?.data;
              const fileCount = fileQueries[i]?.data?.files?.length;
              return (
                <Link
                  key={name}
                  to="/modules/$name"
                  params={{ name }}
                  className="block bg-bg-raised border border-border rounded-lg p-4 hover:border-accent/40 hover:bg-bg-hover transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text">
                      {name}
                    </span>
                    <span className="text-[10px] text-text-muted bg-bg-input px-2 py-0.5 rounded-full">
                      {fileCount !== undefined
                        ? `${fileCount} file${fileCount !== 1 ? "s" : ""}`
                        : "..."}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                    {detail?.summary || "..."}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">
                      {detail
                        ? `${detail.secrets?.length || 0} secret${(detail.secrets?.length || 0) !== 1 ? "s" : ""}`
                        : ""}
                    </span>
                    <span className="text-xs text-accent">
                      Edit &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateModuleForm({
  onCreated,
  onCancel,
}: {
  onCreated: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  const mutation = useMutation({
    mutationFn: createModule,
    onSuccess: (data) => onCreated(data.name),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, content, summary, secrets: [] });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 p-4 bg-bg-raised border border-border rounded-lg space-y-3"
    >
      <h2 className="text-sm font-semibold text-text">New Module</h2>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. linear"
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono outline-none focus:border-accent/40"
        />
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Summary
        </label>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-line description"
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text outline-none focus:border-accent/40"
        />
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Content (info.md)
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="# Module Name&#10;&#10;Documentation..."
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono resize-y outline-none focus:border-accent/40"
        />
      </div>
      {mutation.isError && (
        <p className="text-xs text-danger">
          {(mutation.error as Error).message || "Failed to create"}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 bg-accent text-accent-text text-xs font-medium rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {mutation.isPending ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs text-text-muted hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
