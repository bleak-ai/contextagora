import { useState } from "react";
import {
  Archive,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ModuleInfo } from "../../../api/modules";
import type { LoadedModule } from "../../../api/workspace";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";
import { FileTree } from "./FileTree";

interface TaskCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onToggle?: (enabled: boolean) => void;
  onArchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void;
}

export function TaskCard({
  info,
  loaded,
  onToggle,
  onArchive,
  onDelete,
  onEdit,
}: TaskCardProps) {
  const isOn = loaded !== null;
  const tone = isOn ? "task-on" : "task-off";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);
  const handleEdit = () => (onEdit ? onEdit() : openModuleEditor(info.name));

  const [expanded, setExpanded] = useState(isOn);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headerMiddle = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className="flex flex-1 items-center gap-1.5 text-left min-w-0"
    >
      <span
        className="text-xs font-semibold text-text truncate"
        title={info.name}
      >
        {info.name}
      </span>
    </button>
  );

  const headerRight = (
    <>
      {onToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!isOn);
          }}
          className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
            isOn ? "bg-accent" : "bg-text-muted/40"
          }`}
          title={isOn ? "Turn off" : "Turn on"}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
              isOn ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      )}
      <button
        type="button"
        aria-label={expanded ? "Collapse" : "Expand"}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((x) => !x);
        }}
        className="p-1 text-text-muted hover:text-text"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
    </>
  );

  return (
    <ModuleCardShell
      tone={tone}
      headerMiddle={headerMiddle}
      headerRight={headerRight}
    >
      {expanded && (
        <div className="border-t border-border/50 bg-bg-raised px-3 py-2.5">
          {info.summary && (
            <p className="text-[11px] text-text-muted mb-2">{info.summary}</p>
          )}
          {isOn && loaded.files.length > 0 && (
            <FileTree
              paths={loaded.files}
              onSelect={setPreviewFile}
              checkboxes={loaded.checkboxes}
            />
          )}
          {!isOn && (
            <p className="text-[10px] italic text-text-muted">
              Off. Turn on to load this task into the workspace.
            </p>
          )}

          <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleEdit}
              className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" /> Edit
            </button>
            {onArchive && (
              <button
                type="button"
                disabled={archiving}
                onClick={() => {
                  setArchiving(true);
                  Promise.resolve(onArchive()).finally(() =>
                    setArchiving(false),
                  );
                }}
                className="text-[10px] text-text-muted hover:text-text flex items-center gap-1 disabled:opacity-50"
              >
                <Archive className="w-3 h-3" /> Archive
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleting(true);
                  Promise.resolve(onDelete()).finally(() => setDeleting(false));
                }}
                className="text-[10px] text-text-muted hover:text-red-400 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        </div>
      )}
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
