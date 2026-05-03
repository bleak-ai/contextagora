import { useState } from "react";
import {
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Archive,
  ArchiveRestore,
  FileText,
} from "lucide-react";
import type { ModuleInfo } from "../../../api/modules";
import type { LoadedModule } from "../../../api/workspace";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";
import { FileTree } from "./FileTree";
import { ModuleSubSection } from "./ModuleSubSection";
import { OverflowMenu, type OverflowMenuItem } from "./OverflowMenu";

interface TaskCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void;
  onArchiveToggle?: (archived: boolean) => void | Promise<void>;
}

export function TaskCard({
  info,
  loaded,
  onToggle,
  onDelete,
  onEdit,
  onArchiveToggle,
}: TaskCardProps) {
  const isOn = loaded !== null;
  const isArchived = info.archived;
  const variant: "active" | "idle" | "archived" = isArchived
    ? "archived"
    : isOn
      ? "active"
      : "idle";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);
  const handleEdit = () => (onEdit ? onEdit() : openModuleEditor(info.name));

  const [expanded, setExpanded] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const headerMiddle = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className="flex flex-1 items-center gap-1.5 text-left min-w-0"
    >
      <span
        className={`text-xs font-semibold truncate ${
          isArchived
            ? "text-text-secondary italic"
            : isOn
              ? "text-text"
              : "text-text-secondary"
        }`}
        title={info.name}
      >
        {info.name}
      </span>
      {isArchived && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-text-secondary bg-bg px-1.5 py-0.5 rounded border border-border">
          archived
        </span>
      )}
      {!isArchived && !isOn && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border">
          off
        </span>
      )}
    </button>
  );

  const menuItems: OverflowMenuItem[] = [
    {
      label: "Edit",
      icon: <Edit2 className="w-3 h-3" />,
      onClick: handleEdit,
    },
    ...(onArchiveToggle
      ? [
          {
            label: isArchived ? "Unarchive" : "Archive",
            icon: isArchived ? (
              <ArchiveRestore className="w-3 h-3" />
            ) : (
              <Archive className="w-3 h-3" />
            ),
            onClick: () => onArchiveToggle(!isArchived),
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            label: "Delete",
            icon: <Trash2 className="w-3 h-3" />,
            onClick: () => onDelete(),
            destructive: true,
          },
        ]
      : []),
  ];

  const headerRight = (
    <>
      {onToggle && !isArchived && (
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
      <OverflowMenu items={menuItems} />
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
      variant={variant}
      kind="task"
      warn={false}
      headerMiddle={headerMiddle}
      headerRight={headerRight}
    >
      {expanded && (
        <div className="border-t border-border/50 bg-bg-raised px-3 py-2.5">
          {info.summary && (
            <p className="text-[11px] text-text-muted mb-2">{info.summary}</p>
          )}
          {isOn && loaded.files.length > 0 && (
            <ModuleSubSection
              title={
                <>
                  <FileText className="w-3.5 h-3.5 shrink-0" /> FILES
                </>
              }
              count={`${loaded.files.length}`}
              defaultOpen
            >
              <FileTree
                paths={loaded.files}
                onSelect={setPreviewFile}
                checkboxes={loaded.checkboxes}
              />
            </ModuleSubSection>
          )}
          {!isOn && !isArchived && (
            <p className="text-[10px] italic text-text-muted">
              Off. Turn on to load this task into the workspace.
            </p>
          )}
          {isArchived && (
            <p className="text-[10px] italic text-text-muted">
              Archived. Unarchive to load it again.
            </p>
          )}
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
