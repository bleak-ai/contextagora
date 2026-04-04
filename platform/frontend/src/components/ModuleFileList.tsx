import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchModuleFiles,
  fetchModuleFile,
  saveModuleFile,
  deleteModuleFile,
} from "../api/modules";

interface ModuleFileListProps {
  moduleName: string;
}

export function ModuleFileList({ moduleName }: ModuleFileListProps) {
  const queryClient = useQueryClient();
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("docs/");
  const [newFileContent, setNewFileContent] = useState("");

  const { data } = useQuery({
    queryKey: ["module-files", moduleName],
    queryFn: () => fetchModuleFiles(moduleName),
  });

  const saveMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      saveModuleFile(moduleName, path, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-files", moduleName] });
      setEditingFile(null);
      setAddingFile(false);
      setNewFileName("docs/");
      setNewFileContent("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteModuleFile(moduleName, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-files", moduleName] });
    },
  });

  const handleEdit = async (path: string) => {
    const file = await fetchModuleFile(moduleName, path);
    setEditContent(file.content);
    setEditingFile(path);
  };

  const handleDelete = (path: string) => {
    if (confirm(`Delete ${path}?`)) {
      deleteMutation.mutate(path);
    }
  };

  const files = data?.files || [];

  // Editing a file
  if (editingFile) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-accent font-mono">{editingFile}</span>
          <button
            onClick={() => setEditingFile(null)}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
        <p className="text-[10px] text-text-muted mb-2">
          Edit the markdown content below. This is what the AI agent will read when navigating this module.
        </p>
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={12}
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono resize-y outline-none focus:border-accent/40"
        />
        <button
          onClick={() =>
            saveMutation.mutate({ path: editingFile, content: editContent })
          }
          disabled={saveMutation.isPending}
          className="mt-2 px-3 py-1.5 bg-accent text-accent-text text-xs font-medium rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    );
  }

  // Adding a new file
  if (addingFile) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary">Add documentation file</span>
          <button
            onClick={() => setAddingFile(false)}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">File path</label>
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="docs/api-reference.md"
            className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono outline-none focus:border-accent/40"
          />
          <p className="text-[10px] text-text-muted mt-1">
            Must be a .md file under docs/ (e.g. docs/webhooks.md, docs/api-reference.md)
          </p>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-text-secondary mb-1">Content</label>
          <textarea
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            rows={8}
            placeholder={"# API Reference\n\nDocument endpoints, parameters, and examples here.\nThe AI agent will use this as context when answering questions."}
            className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono resize-y outline-none focus:border-accent/40"
          />
        </div>
        <button
          onClick={() =>
            saveMutation.mutate({ path: newFileName, content: newFileContent })
          }
          disabled={saveMutation.isPending || !newFileName.trim() || !newFileName.endsWith(".md")}
          className="mt-2 px-3 py-1.5 bg-accent text-accent-text text-xs font-medium rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMutation.isPending ? "Creating..." : "Create file"}
        </button>
      </div>
    );
  }

  // File list view
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">Files</span>
        <button
          onClick={() => setAddingFile(true)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + Add file
        </button>
      </div>
      <p className="text-[10px] text-text-muted mb-2">
        Markdown files the AI agent reads as context. Click Edit to modify content, or add new docs/ files.
      </p>
      <div className="space-y-1">
        {files.map((file) => (
          <div
            key={file.path}
            className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-hover"
          >
            <span className="text-sm text-text font-mono">{file.path}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(file.path)}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Edit
              </button>
              {file.path !== "info.md" && (
                <button
                  onClick={() => handleDelete(file.path)}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-danger/60 hover:text-danger"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <p className="text-xs text-text-muted py-2">No files yet. Add documentation files for the agent to use as context.</p>
        )}
      </div>
    </div>
  );
}
