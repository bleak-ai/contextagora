import { Link } from "@tanstack/react-router";

interface EditorHeaderProps {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
}

export function EditorHeader({
  name,
  isDirty,
  isSaving,
  onSave,
}: EditorHeaderProps) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-border bg-bg-raised">
      <Link
        to="/modules"
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        &larr; Back to Modules
      </Link>
      <span className="text-sm font-bold text-accent mx-auto">{name}</span>
      <button
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className={`px-4 py-1.5 text-xs font-medium rounded ${
          isDirty
            ? "bg-accent text-accent-text hover:bg-accent-hover"
            : "bg-bg-input text-text-muted cursor-default"
        } disabled:opacity-50`}
      >
        {isSaving ? "Saving..." : isDirty ? "Save" : "Nothing to save"}
      </button>
    </div>
  );
}
