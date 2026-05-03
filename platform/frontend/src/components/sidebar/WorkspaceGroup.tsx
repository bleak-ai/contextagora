import { useState, useMemo } from "react";
import { RotateCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchRootContext } from "../../api/rootContext";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { ActiveWorkZone } from "./ActiveWorkZone";
import { ConnectorsZone } from "./ConnectorsZone";
import { LibraryZone } from "./LibraryZone";
import { FilePreviewModal } from "./FilePreviewModal";

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

function computeWarnCount(loaded: LoadedModule[]): number {
  return loaded.filter((m) => {
    const missingSecret = Object.values(m.secrets).some((v) => v === null);
    const failedPackage = m.packages.some((p) => !p.installed);
    return missingSecret || failedPackage;
  }).length;
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
  const [rootPreview, setRootPreview] = useState<"claude_md" | "llms_txt" | null>(null);

  const { data: rootData, isLoading: rootLoading } = useQuery({
    queryKey: ["root-context"],
    queryFn: fetchRootContext,
    staleTime: 30_000,
  });

  const activeWorkModules = useMemo(
    () =>
      modules.filter(
        (m) => (m.kind === "task" || m.kind === "workflow") && !m.archived,
      ),
    [modules],
  );
  const connectorModules = useMemo(
    () => modules.filter((m) => m.kind === "integration"),
    [modules],
  );
  const archivedModules = useMemo(
    () => modules.filter((m) => m.archived),
    [modules],
  );

  const warnCount = useMemo(() => computeWarnCount(loaded), [loaded]);

  const inContextCount = loaded.length;
  const dotClass =
    warnCount > 0
      ? "bg-accent shadow-[0_0_6px_var(--color-warning)]"
      : "bg-accent shadow-[0_0_6px_var(--color-accent)]";

  const ROOT_FILES = [
    { key: "claude_md" as const, label: "CLAUDE.md" },
    { key: "llms_txt" as const, label: "llms.txt" },
  ];

  return (
    <>
      <div className="flex items-center gap-2 border border-border bg-bg-hover rounded-t-md px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="flex-1 text-xs font-semibold text-text">
          {inContextCount} in context
          {warnCount > 0 && (
            <span className="text-warning"> · {warnCount} warning{warnCount > 1 ? "s" : ""}</span>
          )}
        </span>
      </div>

      <div className="border border-t-0 border-border rounded-b-md px-2.5 pb-2.5 pt-2">
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
                      exists ? "cursor-pointer hover:text-accent" : "cursor-default opacity-60"
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

        <ActiveWorkZone
          modules={activeWorkModules}
          loaded={loaded}
          onToggleModule={onToggleModule}
          onEditModule={onEditModule}
          onDeleteModule={(name, kind) => onDeleteModule(name, kind)}
          onArchiveModule={onArchiveModule}
        />

        <ConnectorsZone
          modules={connectorModules}
          loaded={loaded}
          onToggleModule={onToggleModule}
          onEditModule={onEditModule}
          onDeleteModule={(name) => onDeleteModule(name, "integration")}
        />

        <LibraryZone
          archivedModules={archivedModules}
          onEditModule={onEditModule}
          onDeleteModule={(name, kind) => onDeleteModule(name, kind)}
          onArchiveModule={onArchiveModule}
        />

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
          title={rootPreview === "claude_md" ? "claude.md" : "llms.txt"}
          content={rootData[rootPreview].content}
          onClose={() => setRootPreview(null)}
        />
      )}
    </>
  );
}
