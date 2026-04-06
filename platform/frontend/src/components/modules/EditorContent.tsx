import { useState } from "react";

interface OpenFile {
  content: string;
  dirty: boolean;
}

interface EditorContentProps {
  mode: "files" | "secrets" | "requirements";
  moduleName: string;
  infoContent: string;
  openFiles: Map<string, OpenFile>;
  activeFile: string | null;
  secrets: string[];
  requirements: string[];
  onFileChange: (path: string, content: string) => void;
  onSelectFile: (path: string) => void;
  onSecretsChange: (secrets: string[]) => void;
  onRequirementsChange: (requirements: string[]) => void;
}

export function EditorContent({
  mode,
  moduleName,
  infoContent,
  openFiles,
  activeFile,
  secrets,
  requirements,
  onFileChange,
  onSelectFile,
  onSecretsChange,
  onRequirementsChange,
}: EditorContentProps) {
  if (mode === "secrets") {
    return (
      <SecretsPanel secrets={secrets} onChange={onSecretsChange} />
    );
  }

  if (mode === "requirements") {
    return (
      <RequirementsPanel
        requirements={requirements}
        moduleName={moduleName}
        infoContent={infoContent}
        onChange={onRequirementsChange}
      />
    );
  }

  const tabs = Array.from(openFiles.entries());

  if (tabs.length === 0 || !activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-text-muted">
          Select a file from the sidebar to start editing
        </span>
      </div>
    );
  }

  const currentFile = openFiles.get(activeFile);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border overflow-x-auto">
        {tabs.map(([path, file]) => (
          <button
            key={path}
            onClick={() => onSelectFile(path)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-mono whitespace-nowrap ${
              path === activeFile
                ? "bg-bg-hover text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {path}
            {file.dirty && (
              <span className="text-accent text-[8px]">&#9679;</span>
            )}
          </button>
        ))}
      </div>

      {/* Editor */}
      {currentFile && (
        <div className="flex-1 flex flex-col min-h-0">
          {activeFile === "info.md" && (
            <div className="px-4 py-2 text-xs text-text-muted border-b border-border/50 bg-bg-raised/30">
              Write or paste everything you know about this tool — setup details, API docs, account info, credentials.
              Then use <span className="text-accent font-medium">Generate Summary</span> to create a description.
            </div>
          )}
          <textarea
            value={currentFile.content}
            onChange={(e) => onFileChange(activeFile, e.target.value)}
            className="flex-1 w-full bg-bg-input p-4 text-sm text-text font-mono resize-none outline-none"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

function SecretsPanel({
  secrets,
  onChange,
}: {
  secrets: string[];
  onChange: (secrets: string[]) => void;
}) {
  const [newSecret, setNewSecret] = useState("");

  const handleAdd = () => {
    const name = newSecret.trim().toUpperCase();
    if (name && !secrets.includes(name)) {
      onChange([...secrets, name]);
      setNewSecret("");
    }
  };

  const handleRemove = (name: string) => {
    onChange(secrets.filter((s) => s !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h3 className="text-sm font-semibold text-accent mb-1">
        Required Secrets
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Environment variables this module needs to function.
      </p>

      <div className="space-y-1 mb-4">
        {secrets.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between bg-bg-raised px-3 py-2 rounded"
          >
            <span className="text-sm text-text font-mono">{name}</span>
            <button
              onClick={() => handleRemove(name)}
              className="text-xs text-danger/60 hover:text-danger"
            >
              &times; Remove
            </button>
          </div>
        ))}
        {secrets.length === 0 && (
          <p className="text-xs text-text-muted py-2">
            No secrets defined yet.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={newSecret}
          onChange={(e) => setNewSecret(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="NEW_SECRET_NAME"
          className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono outline-none focus:border-accent/40"
        />
        <button
          onClick={handleAdd}
          disabled={!newSecret.trim()}
          className="px-4 py-2 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function RequirementsPanel({
  requirements,
  moduleName,
  infoContent,
  onChange,
}: {
  requirements: string[];
  moduleName: string;
  infoContent: string;
  onChange: (requirements: string[]) => void;
}) {
  const [newPkg, setNewPkg] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);

  const handleAdd = () => {
    const name = newPkg.trim().toLowerCase();
    if (name && !requirements.includes(name)) {
      onChange([...requirements, name]);
      setNewPkg("");
    }
  };

  const handleRemove = (name: string) => {
    onChange(requirements.filter((r) => r !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDetect = async () => {
    if (!infoContent.trim() || isDetecting) return;
    setIsDetecting(true);
    try {
      const { detectPackages } = await import("../../api/modules");
      const result = await detectPackages(moduleName, infoContent);
      // Merge detected packages with existing (no duplicates)
      const merged = [...requirements];
      for (const pkg of result.packages) {
        if (!merged.includes(pkg)) {
          merged.push(pkg);
        }
      }
      onChange(merged);
    } catch (err) {
      console.error("Detect packages failed:", err);
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-accent">
          Python Packages
        </h3>
        <button
          onClick={handleDetect}
          disabled={!infoContent.trim() || isDetecting}
          className="px-3 py-1 text-[10px] font-medium rounded border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-default"
        >
          {isDetecting ? "Detecting..." : "Detect from info.md"}
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        Python packages this module needs for PTC scripts. Installed automatically when the module is loaded.
      </p>

      <div className="space-y-1 mb-4">
        {requirements.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between bg-bg-raised px-3 py-2 rounded"
          >
            <span className="text-sm text-text font-mono">{name}</span>
            <button
              onClick={() => handleRemove(name)}
              className="text-xs text-danger/60 hover:text-danger"
            >
              &times; Remove
            </button>
          </div>
        ))}
        {requirements.length === 0 && (
          <p className="text-xs text-text-muted py-2">
            No packages defined yet.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={newPkg}
          onChange={(e) => setNewPkg(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="package-name"
          className="flex-1 bg-bg-input border border-border rounded px-3 py-2 text-sm text-text font-mono outline-none focus:border-accent/40"
        />
        <button
          onClick={handleAdd}
          disabled={!newPkg.trim()}
          className="px-4 py-2 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
