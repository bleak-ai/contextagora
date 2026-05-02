import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
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

  /* --- sort: loaded first, then idle --- */
  const sortedModules = useMemo(() => {
    const loadedSet = new Set(loaded.map((l) => l.name));
    return [...modules].sort((a, b) => {
      const aLoaded = loadedSet.has(a.name) ? 0 : 1;
      const bLoaded = loadedSet.has(b.name) ? 0 : 1;
      return aLoaded - bLoaded;
    });
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
            {sortedModules.map((m) => {
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
