import { useState } from "react";
import type { ModuleFile } from "../../api/modules";

interface EditorSidebarProps {
  files: ModuleFile[];
  secrets: string[];
  requirements: string[];
  activeFile: string | null;
  mode: "files" | "secrets" | "requirements";
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onAddFile: (path: string) => void;
  onSetMode: (mode: "files" | "secrets" | "requirements") => void;
}

export function EditorSidebar({
  files,
  secrets,
  requirements,
  activeFile,
  mode,
  onSelectFile,
  onDeleteFile,
  onAddFile,
  onSetMode,
}: EditorSidebarProps) {
  const [adding, setAdding] = useState(false);
  const [newFileName, setNewFileName] = useState("docs/");

  const handleAdd = () => {
    const name = newFileName.trim();
    if (name && name.endsWith(".md")) {
      onAddFile(name);
      setNewFileName("docs/");
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    } else if (e.key === "Escape") {
      setAdding(false);
      setNewFileName("docs/");
    }
  };

  return (
    <div className="w-72 flex-shrink-0 border-r border-border overflow-y-auto p-3">
      {/* Files section */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">
          Files
        </span>
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] text-accent hover:text-accent-hover"
        >
          + New File
        </button>
      </div>

      <div className="space-y-0.5">
        {files.map((file) => (
          <div
            key={file.path}
            className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer ${
              activeFile === file.path && mode === "files"
                ? "bg-bg-hover"
                : "hover:bg-bg-hover"
            }`}
            onClick={() => {
              onSelectFile(file.path);
              onSetMode("files");
            }}
          >
            <span
              className={`text-xs font-mono ${
                activeFile === file.path && mode === "files"
                  ? "text-accent"
                  : "text-text"
              }`}
            >
              {file.path}
            </span>
            {file.path !== "info.md" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete ${file.path}?`)) {
                    onDeleteFile(file.path);
                  }
                }}
                className="text-xs text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-2 space-y-1">
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="docs/filename.md"
            className="w-full bg-bg-input border border-accent/40 rounded px-2 py-1 text-xs text-text font-mono outline-none"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAdd}
              disabled={
                !newFileName.trim() || !newFileName.trim().endsWith(".md")
              }
              className="px-2 py-0.5 text-[10px] bg-accent text-accent-text rounded hover:bg-accent-hover disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewFileName("docs/");
              }}
              className="px-2 py-0.5 text-[10px] text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border my-3" />

      {/* Secrets section */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">
          Secrets
        </span>
        {mode === "secrets" ? (
          <button
            onClick={() => onSetMode("files")}
            className="text-[10px] text-accent hover:text-accent-hover"
          >
            &larr; Back
          </button>
        ) : (
          <button
            onClick={() => onSetMode("secrets")}
            className="text-[10px] text-accent hover:text-accent-hover"
          >
            Manage
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {secrets.map((secret) => (
          <div key={secret} className="px-2 py-1">
            <span className="text-xs text-text font-mono">{secret}</span>
          </div>
        ))}
        {secrets.length === 0 && (
          <p className="text-[10px] text-text-muted px-2">No secrets defined</p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border my-3" />

      {/* Requirements section */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">
          Packages
        </span>
        {mode === "requirements" ? (
          <button
            onClick={() => onSetMode("files")}
            className="text-[10px] text-accent hover:text-accent-hover"
          >
            &larr; Back
          </button>
        ) : (
          <button
            onClick={() => onSetMode("requirements")}
            className="text-[10px] text-accent hover:text-accent-hover"
          >
            Manage
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {requirements.map((req) => (
          <div key={req} className="px-2 py-1">
            <span className="text-xs text-text font-mono">{req}</span>
          </div>
        ))}
        {requirements.length === 0 && (
          <p className="text-[10px] text-text-muted px-2">No packages defined</p>
        )}
      </div>
    </div>
  );
}
