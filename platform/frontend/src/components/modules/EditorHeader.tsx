import { Link } from "@tanstack/react-router";
import { useState } from "react";

interface EditorHeaderProps {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  canGenerate: boolean;
  onSave: () => void;
  onGenerate: () => void;
}

export function EditorHeader({
  name,
  isDirty,
  isSaving,
  isGenerating,
  canGenerate,
  onSave,
  onGenerate,
}: EditorHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex items-center px-4 py-3 border-b border-border bg-bg-raised">
      <Link
        to="/modules"
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        &larr; Back to Modules
      </Link>
      <span className="text-sm font-bold text-accent mx-auto">{name}</span>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="px-4 py-1.5 text-xs font-medium rounded border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-default"
          >
            {isGenerating ? "Generating..." : "Generate Summary"}
          </button>
          {showTooltip && !isGenerating && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-text bg-bg-raised border border-border rounded shadow-lg whitespace-nowrap z-50">
              Generates a 1-2 sentence summary from your info.md content.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
            </div>
          )}
        </div>
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
