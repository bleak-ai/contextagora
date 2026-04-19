import { useState } from "react";
import type { ModuleInfo } from "../../../api/modules";
import type { LoadedModule } from "../../../api/workspace";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";

interface TaskCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onArchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void;
}

export function TaskCard({
  info,
  loaded,
  onArchive,
  onDelete,
  onEdit,
}: TaskCardProps) {
  const isOn = loaded !== null;
  const tone = isOn ? "task-on" : "task-off";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);
  const handleEdit = () => (onEdit ? onEdit() : openModuleEditor(info.name));

  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headerMiddle = (
    <div className="flex-1 min-w-0">
      <span className="text-xs font-semibold text-text block truncate">
        {info.name}
      </span>
    </div>
  );

  const headerRight = (
    <>
      {onArchive && (
        <button
          type="button"
          disabled={archiving}
          onClick={(e) => {
            e.stopPropagation();
            setArchiving(true);
            Promise.resolve(onArchive()).finally(() => setArchiving(false));
          }}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-hover transition-colors disabled:opacity-50"
          title="Archive task"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(true);
            Promise.resolve(onDelete()).finally(() => setDeleting(false));
          }}
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-bg-hover transition-colors disabled:opacity-50"
          title="Delete task"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      )}
    </>
  );

  return (
    <ModuleCardShell
      tone={tone}
      headerMiddle={headerMiddle}
      headerRight={headerRight}
      onEdit={handleEdit}
    >
      <div className="border-t border-border/50 bg-bg-raised px-3 py-2.5">
        {info.summary && (
          <p className="text-[11px] text-text-muted mb-2">{info.summary}</p>
        )}
        {isOn && loaded.files.length > 0 && (
          <div className="space-y-px">
            {loaded.files.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setPreviewFile(f)}
                className="group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
              >
                <span className="text-[10px] leading-none shrink-0">📄</span>
                <span className="flex-1 truncate text-text font-medium">
                  {f}
                </span>
              </button>
            ))}
          </div>
        )}
        {!isOn && (
          <div className="space-y-1.5 animate-pulse">
            <div className="h-3 w-3/4 rounded bg-text-muted/20" />
            <div className="h-3 w-1/2 rounded bg-text-muted/20" />
          </div>
        )}
      </div>
      {previewFile && (
        <ModuleFilePreview
          moduleName={info.name}
          path={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </ModuleCardShell>
  );
}
