import { useState } from "react";

interface ModuleFormProps {
  mode: "create" | "edit";
  initialName?: string;
  initialContent?: string;
  initialSecrets?: string[];
  onSubmit: (data: { name: string; content: string; secrets: string[] }) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function ModuleForm({
  mode,
  initialName = "",
  initialContent = "",
  initialSecrets = [],
  onSubmit,
  onCancel,
  isPending,
}: ModuleFormProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [secrets, setSecrets] = useState(initialSecrets.join("\n"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const secretsList = secrets
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({ name, content, secrets: secretsList });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "create" && (
        <div>
          <label className="block text-xs text-text-secondary mb-1">Module name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. linear"
            required
            className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40"
          />
        </div>
      )}
      {mode === "edit" && (
        <div className="text-xs text-text-secondary">
          Editing: <span className="text-accent">{initialName}/info.md</span>
        </div>
      )}
      <div>
        <label className="block text-xs text-text-secondary mb-1">Content (info.md)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={mode === "edit" ? 10 : 8}
          placeholder={"# Module Name\n\nDocumentation for this module..."}
          required
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40 font-mono resize-y"
        />
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Secrets (one per line, becomes .env.schema)
        </label>
        <textarea
          value={secrets}
          onChange={(e) => setSecrets(e.target.value)}
          rows={3}
          placeholder={"LINEAR_API_KEY\nSLACK_TOKEN"}
          className="w-full bg-bg-input border border-border rounded px-3 py-2 text-sm text-text placeholder-text-muted outline-none focus:border-accent/40 font-mono resize-y"
        />
        <p className="text-[10px] text-text-muted mt-1">
          Add values in Infisical at /{name || "<name>"}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Saving..." : mode === "create" ? "Create" : "Save"}
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
