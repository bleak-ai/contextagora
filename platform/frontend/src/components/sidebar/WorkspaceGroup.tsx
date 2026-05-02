import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, RotateCw, Archive } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchRootContext } from "../../api/rootContext";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { IntegrationCard } from "./cards/IntegrationCard";
import { TaskCard } from "./cards/TaskCard";
import { FilePreviewModal } from "./FilePreviewModal";
import { LegacyArchivedBanner } from "./LegacyArchivedBanner";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface WorkspaceGroupProps {
  modules: ModuleInfo[];
  loaded: LoadedModule[];
  onToggleModule: (name: string, enabled: boolean) => void;
  onRefreshSecrets: () => void;
  isRefreshingSecrets: boolean;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "task" | "integration" | "workflow") => void;
  onArchiveModule: (name: string, archived: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Health helper                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  WorkspaceGroup                                                     */
/* ------------------------------------------------------------------ */

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
  const [expanded, setExpanded] = useState(false);
  const [rootPreview, setRootPreview] = useState<
    "claude_md" | "llms_txt" | null
  >(null);

  /* --- root context query --- */
  const { data: rootData, isLoading: rootLoading } = useQuery({
    queryKey: ["root-context"],
    queryFn: fetchRootContext,
    staleTime: 30_000,
  });

  /* --- derived data --- */
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

  /* --- partition: active (sorted: loaded first) vs archived --- */
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

  /* --- health dot styling --- */
  const dotClass =
    health === "ok"
      ? "bg-success shadow-[0_0_6px_rgba(92,184,122,0.4)]"
      : health === "warn"
        ? "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
        : "bg-text-muted";

  /* --- root file labels --- */
  const ROOT_FILES = [
    { key: "claude_md" as const, label: "CLAUDE.md" },
    { key: "llms_txt" as const, label: "llms.txt" },
  ];

  return (
    <>
      {/* ---- Collapsed / Header card ---- */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex w-full items-center gap-2 border border-border bg-bg-hover px-2.5 py-2 cursor-pointer hover:border-border-light text-left ${expanded ? "rounded-t-md" : "rounded-md"}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="flex-1 text-xs font-semibold text-text">
          {loadedCount} Module{loadedCount !== 1 ? "s" : ""} Loaded
        </span>
        <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-semibold">
          {modules.length}
        </span>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-text-muted" />
          : <ChevronRight className="w-3 h-3 text-text-muted" />}
      </button>

      {/* ---- Expanded body ---- */}
      {expanded && (
        <div className="border border-t-0 border-border rounded-b-md px-2.5 pb-2.5 pt-2">
          {/* ---- Legacy archived banner ---- */}
          <LegacyArchivedBanner />

          {/* ---- Root Files sub-section ---- */}
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

          {/* ---- Modules sub-section ---- */}
          <div className="mb-1.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-text-muted">
              Modules
            </span>
          </div>

          {/* ---- Module cards ---- */}
          <div className="space-y-0">
            {activeModules.map((m) => {
              const loadedRecord = loaded.find((l) => l.name === m.name) ?? null;
              if (m.kind === "task") {
                return (
                  <TaskCard
                    key={m.name}
                    info={m}
                    loaded={loadedRecord}
                    onToggle={(enabled) => onToggleModule(m.name, enabled)}
                    onEdit={() => onEditModule(m.name)}
                    onDelete={() => onDeleteModule(m.name, m.kind)}
                    onArchiveToggle={(archived) =>
                      onArchiveModule(m.name, archived)
                    }
                  />
                );
              }
              return (
                <IntegrationCard
                  key={m.name}
                  info={m}
                  loaded={loadedRecord}
                  onToggle={(enabled) => onToggleModule(m.name, enabled)}
                  onEdit={() => onEditModule(m.name)}
                  onDelete={() => onDeleteModule(m.name, m.kind)}
                />
              );
            })}
          </div>

          {/* ---- Archived section ---- */}
          {archivedModules.length > 0 && (
            <ArchivedSection
              modules={archivedModules}
              onUnarchive={(name) => onArchiveModule(name, false)}
              onEditModule={onEditModule}
              onDeleteModule={onDeleteModule}
            />
          )}

          {/* ---- Footer row ---- */}
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
      )}

      {/* ---- Root file preview modal ---- */}
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

/* ------------------------------------------------------------------ */
/*  ArchivedSection (inline)                                           */
/* ------------------------------------------------------------------ */

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
    <div className="mt-2 pt-2 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-1 text-left text-text-muted hover:text-text"
      >
        <Archive className="w-3 h-3" />
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-1">
          Archived ({modules.length})
        </span>
        {open
          ? <ChevronDown className="w-3 h-3" />
          : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-0 opacity-80">
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
