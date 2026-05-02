import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, RotateCw, Archive, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchRootContext } from "../../api/rootContext";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./cards/TaskCard";
import { ActiveContextList } from "./ActiveContextList";
import { AvailableModuleGroups } from "./AvailableModuleGroups";
import { FilePreviewModal } from "./FilePreviewModal";
import { LegacyArchivedBanner } from "./LegacyArchivedBanner";

interface WorkspaceGroupProps {
  modules: ModuleInfo[];
  loaded: LoadedModule[];
  onToggleModule: (name: string, enabled: boolean) => void;
  onRefreshSecrets: () => void;
  isRefreshingSecrets: boolean;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "task" | "integration" | "workflow") => void;
  onArchiveModule?: (name: string, archived: boolean) => void;
}

function computeHealth(
  loaded: LoadedModule[],
  moduleNames: Set<string>,
): "ok" | "warn" | "none" {
  const loadedModules = loaded.filter((m) =>
    moduleNames.has(m.name),
  );
  if (loadedModules.length === 0) return "none";
  const hasIssue = loadedModules.some((m) => {
    const missingSecret = Object.values(m.secrets).some((v) => v === null);
    const failedPackage = m.packages.some((p) => !p.installed);
    return missingSecret || failedPackage;
  });
  return hasIssue ? "warn" : "ok";
}

export function WorkspaceGroup({
  modules,
  loaded,
  onToggleModule,
  onRefreshSecrets,
  isRefreshingSecrets,
  onEditModule,
  onDeleteModule,
  onArchiveModule,
}: WorkspaceGroupProps) {
  const [rootPreview, setRootPreview] = useState<
    "claude_md" | "llms_txt" | null
  >(null);

  const { data: rootData, isLoading: rootLoading } = useQuery({
    queryKey: ["root-context"],
    queryFn: fetchRootContext,
    staleTime: 30_000,
  });

  const moduleNames = useMemo(
    () => new Set(modules.map((m) => m.name)),
    [modules],
  );

  const loadedCount = useMemo(
    () => loaded.filter((m) => moduleNames.has(m.name)).length,
    [loaded, moduleNames],
  );

  const health = useMemo(
    () => computeHealth(loaded, moduleNames),
    [loaded, moduleNames],
  );

  const { activeModules, archivedModules } = useMemo(() => {
    const loadedSet = new Set(loaded.map((l) => l.name));
    const active: ModuleInfo[] = [];
    const archived: ModuleInfo[] = [];
    for (const m of modules) {
      (m.archived ? archived : active).push(m);
    }
    active.sort((a, b) => {
      const aLoaded = loadedSet.has(a.name) ? 0 : 1;
      const bLoaded = loadedSet.has(b.name) ? 0 : 1;
      return aLoaded - bLoaded;
    });
    return { activeModules: active, archivedModules: archived };
  }, [modules, loaded]);

  const loadedNames = useMemo(
    () => new Set(loaded.map((l) => l.name)),
    [loaded],
  );
  const loadedModules = useMemo(
    () => activeModules.filter((m) => loadedNames.has(m.name)),
    [activeModules, loadedNames],
  );
  const idleModules = useMemo(
    () => activeModules.filter((m) => !loadedNames.has(m.name)),
    [activeModules, loadedNames],
  );

  const dotClass =
    health === "ok"
      ? "bg-success shadow-[0_0_6px_rgba(92,184,122,0.4)]"
      : health === "warn"
        ? "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
        : "bg-text-muted";

  const ROOT_FILES = [
    { key: "claude_md" as const, label: "CLAUDE.md" },
    { key: "llms_txt" as const, label: "llms.txt" },
  ];

  return (
    <>
      <div className="flex items-center gap-2 border border-border bg-bg-hover rounded-t-md px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="flex-1 text-xs font-semibold text-text">
          {loadedCount} of {modules.length} loaded
        </span>
        {idleModules.length > 0 && (
          <span
            className="flex items-center gap-1 text-[9px] text-text-muted"
            title={`${idleModules.length} unloaded`}
          >
            <EyeOff className="w-2.5 h-2.5" />
            {idleModules.length}
          </span>
        )}
        {archivedModules.length > 0 && (
          <span
            className="flex items-center gap-1 text-[9px] text-text-muted"
            title={`${archivedModules.length} archived`}
          >
            <Archive className="w-2.5 h-2.5" />
            {archivedModules.length}
          </span>
        )}
      </div>

      <div className="border border-t-0 border-border rounded-b-md px-2.5 pb-2.5 pt-2">
        <LegacyArchivedBanner />

        <div className="pb-2 mb-2 border-b border-border/60">
          <span className="text-[8px] font-bold uppercase tracking-wider text-text-muted mb-1.5 block">
            Root Files
          </span>
          {rootLoading ? (
            <p className="text-[9px] italic text-text-muted">loading...</p>
          ) : (
            <div className="flex items-center gap-3">
              {ROOT_FILES.map(({ key, label }) => {
                const file = rootData?.[key];
                const exists = file?.exists ?? false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => exists && setRootPreview(key)}
                    className={`text-[9px] font-mono text-text-secondary flex items-center gap-1 ${
                      exists
                        ? "cursor-pointer hover:text-accent"
                        : "cursor-default opacity-60"
                    }`}
                  >
                    <span
                      className={`text-[9px] leading-none ${exists ? "text-accent" : "text-text-muted"}`}
                    >
                      {exists ? "●" : "○"}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ActiveContextList
          modules={loadedModules}
          loaded={loaded}
          onToggleModule={onToggleModule}
          onEditModule={onEditModule}
          onDeleteModule={onDeleteModule}
          onArchiveModule={onArchiveModule}
        />

        <AvailableModuleGroups
          modules={idleModules}
          loaded={loaded}
          onToggleModule={onToggleModule}
          onEditModule={onEditModule}
          onDeleteModule={onDeleteModule}
          onArchiveModule={onArchiveModule}
        />

        {archivedModules.length > 0 && onArchiveModule && (
          <ArchivedSection
            modules={archivedModules}
            onUnarchive={(name) => onArchiveModule(name, false)}
            onEditModule={onEditModule}
            onDeleteModule={onDeleteModule}
          />
        )}

        <div className="flex items-center justify-end border-t border-border/50 pt-1.5 mt-1.5">
          <button
            type="button"
            onClick={onRefreshSecrets}
            disabled={isRefreshingSecrets}
            className="text-[9px] text-text-muted hover:text-accent disabled:opacity-50 flex items-center gap-0.5"
          >
            Re-check{" "}
            <RotateCw className={`w-3 h-3 inline-block ${isRefreshingSecrets ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {rootPreview && rootData && (
        <FilePreviewModal
          title={
            rootPreview === "claude_md" ? "claude.md" : "llms.txt"
          }
          content={rootData[rootPreview].content}
          onClose={() => setRootPreview(null)}
        />
      )}
    </>
  );
}

interface ArchivedSectionProps {
  modules: ModuleInfo[];
  onUnarchive: (name: string) => void;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "task" | "integration" | "workflow") => void;
}

function ArchivedSection({
  modules,
  onUnarchive,
  onEditModule,
  onDeleteModule,
}: ArchivedSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 pt-2 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-1 py-1 rounded text-left text-text-secondary hover:text-text hover:bg-bg-hover"
      >
        <Archive className="w-3 h-3" />
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-1">
          Archived
        </span>
        <span className="text-[9px] font-mono bg-bg border border-border text-text-secondary px-1.5 py-0.5 rounded">
          {modules.length}
        </span>
        {open
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-0">
          {modules.map((m) => (
            <TaskCard
              key={m.name}
              info={m}
              loaded={null}
              onEdit={() => onEditModule(m.name)}
              onDelete={() => onDeleteModule(m.name, m.kind === "task" || m.kind === "workflow" ? m.kind : "integration")}
              onArchiveToggle={() => onUnarchive(m.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
