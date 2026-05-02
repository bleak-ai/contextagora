interface EditorHeaderProps {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function EditorHeader({
  name,
  isDirty,
  isSaving,
  onSave,
  onClose,
}: EditorHeaderProps) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-border bg-bg-raised">
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        &larr; Close
      </button>
      <span className="text-sm font-bold text-accent mx-auto">{name}</span>
      <div className="flex items-center gap-2">
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
    </div>
  );
}
