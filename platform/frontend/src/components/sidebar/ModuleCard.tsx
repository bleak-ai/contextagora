import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModule, fetchModuleFile, type ModuleInfo } from "../../api/modules";
import { installModuleDeps, type LoadedModule } from "../../api/workspace";
import { FilePreviewModal } from "./FilePreviewModal";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ModuleCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onToggle?: (enabled: boolean) => void;
  onArchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusOf(m: LoadedModule): "ok" | "warn" {
  const missingSecret = Object.values(m.secrets).some((v) => v === null);
  const failedPackage = m.packages.some((p) => !p.installed);
  return missingSecret || failedPackage ? "warn" : "ok";
}

function countMissing(m: LoadedModule): number {
  const missingSecrets = Object.values(m.secrets).filter(
    (v) => v === null,
  ).length;
  const failedPackages = m.packages.filter((p) => !p.installed).length;
  return missingSecrets + failedPackages;
}

/* ------------------------------------------------------------------ */
/*  ModuleCard                                                         */
/* ------------------------------------------------------------------ */

export function ModuleCard({
  info,
  loaded,
  onToggle,
  onArchive,
  onDelete,
  onEdit,
}: ModuleCardProps) {
  const isTask = info.kind === "task";
  const isOn = loaded !== null;
  const status = isOn ? statusOf(loaded) : null;

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  /* --- expand state (integrations only) --- */
  const [expanded, setExpanded] = useState(false);

  /* --- file preview state --- */
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  /* --- action guards (prevent double-click) --- */
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* --- lazy detail fetch for unloaded integrations --- */
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["module", info.name],
    queryFn: () => fetchModule(info.name),
    enabled: expanded && !isTask && !isOn,
    staleTime: 60_000,
  });

  /* --- install packages mutation (loaded integrations) --- */
  const queryClient = useQueryClient();
  const [installError, setInstallError] = useState<string | null>(null);

  const installMutation = useMutation({
    mutationFn: () => installModuleDeps(info.name),
    onSuccess: (data) => {
      if (!data.success) {
        setInstallError(data.error ?? "Unknown error");
      } else {
        setInstallError(null);
      }
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  /* --- styling --- */
  const borderClass = isTask
    ? "border-accent/70"
    : isOn
      ? status === "warn"
        ? "border-red-500/60"
        : "border-accent/50"
      : "border-border opacity-60";

  const cardBgClass = isTask
    ? "bg-accent/[0.10]"
    : isOn
      ? status === "warn"
        ? "bg-red-500/[0.08]"
        : "bg-accent/[0.10]"
      : "bg-bg-hover";

  const dotClass = isTask
    ? isOn
      ? "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]"
      : "bg-text-muted"
    : isOn
      ? status === "warn"
        ? "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
        : "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]"
      : "bg-text-muted";

  /* --- warning badge for collapsed integrations --- */
  const missingCount = isOn ? countMissing(loaded) : 0;

  /* --- secrets counts (for loaded integrations) --- */
  const okSecretCount = isOn
    ? Object.values(loaded.secrets).filter((v) => v !== null).length
    : 0;
  const totalSecretCount = isOn
    ? Object.keys(loaded.secrets).length
    : 0;
  const secretCountLabel =
    okSecretCount === totalSecretCount
      ? `${totalSecretCount}`
      : `${okSecretCount} / ${totalSecretCount}`;
  const secretCountWarn = okSecretCount !== totalSecretCount;

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      openModuleEditor(info.name);
    }
  };

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border ${cardBgClass} ${borderClass}`}
    >
      {/* ---- Header row ---- */}
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />

        {/* Name + optional summary (tasks) / expand toggle (integrations) */}
        {isTask ? (
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-text block truncate">
              {info.name}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex flex-1 items-center justify-between gap-2 text-left hover:opacity-80 min-w-0"
          >
            <span
              className={`text-xs font-semibold truncate ${isOn ? "text-text" : "text-text-secondary"}`}
            >
              {info.name}
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {/* Warning badge when collapsed */}
              {!expanded && missingCount > 0 && (
                <span className="text-[10px] font-semibold text-red-400">
                  {missingCount} missing
                </span>
              )}
              <span className="text-[10px] text-text-muted">
                {expanded ? "▾" : "▸"}
              </span>
            </span>
          </button>
        )}

        {/* Toggle switch (integrations only) */}
        {!isTask && onToggle && (
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

        {/* Edit button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleEdit();
          }}
          className={`p-1 rounded hover:bg-accent/10 transition-colors ${
            isOn ? "text-text-muted hover:text-accent" : "text-text-muted/50 hover:text-accent/70"
          }`}
          title="Edit module"
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
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* Task actions: Archive + Delete */}
        {isTask && onArchive && (
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
        {isTask && onDelete && (
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
      </div>

      {/* ---- Task body: summary + files (always visible) ---- */}
      {isTask && (
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
          {isTask && !isOn && (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-3 w-3/4 rounded bg-text-muted/20" />
              <div className="h-3 w-1/2 rounded bg-text-muted/20" />
            </div>
          )}
        </div>
      )}

      {/* ---- Integration body (collapsible) ---- */}
      {!isTask && expanded && (
        <div className="border-t border-border bg-bg-raised px-3 py-2.5">
          {/* --- Loaded integration: full detail --- */}
          {isOn && (
            <>
              <Section
                title="📄 FILES"
                count={`${loaded.files.length}`}
                defaultOpen={false}
              >
                {loaded.files.length === 0 ? (
                  <Empty>no files</Empty>
                ) : (
                  loaded.files.map((f) => (
                    <Item
                      key={f}
                      name={f}
                      bullet="text-accent/60"
                      onClick={() => setPreviewFile(f)}
                    />
                  ))
                )}
              </Section>

              <Section
                title="🔑 SECRETS"
                count={totalSecretCount === 0 ? "0" : secretCountLabel}
                warn={secretCountWarn}
                defaultOpen={secretCountWarn}
              >
                {totalSecretCount === 0 ? (
                  <Empty>none declared</Empty>
                ) : (
                  Object.entries(loaded.secrets).map(([key, val]) => (
                    <Item
                      key={key}
                      name={key}
                      bullet={
                        val === null ? "text-red-400/70" : "text-accent/60"
                      }
                      trailing={
                        val === null ? (
                          <Pill tone="bad">missing</Pill>
                        ) : (
                          <Pill tone="ok" mono>
                            {val}
                          </Pill>
                        )
                      }
                    />
                  ))
                )}
              </Section>

              <Section
                title="📦 PACKAGES"
                count={`${loaded.packages.length}`}
                warn={loaded.packages.some((p) => !p.installed)}
                defaultOpen={loaded.packages.some((p) => !p.installed)}
              >
                {loaded.packages.length === 0 ? (
                  <Empty>none declared</Empty>
                ) : (
                  <>
                    {loaded.packages.map((p) => (
                      <Item
                        key={p.name}
                        name={p.name}
                        bullet={
                          p.installed ? "text-accent/60" : "text-red-400/70"
                        }
                        trailing={
                          p.installed ? (
                            <Pill tone="ok" mono>
                              v{p.version}
                            </Pill>
                          ) : (
                            <Pill tone="bad">not installed</Pill>
                          )
                        }
                      />
                    ))}
                    {loaded.packages.some((p) => !p.installed) && (
                      <button
                        type="button"
                        disabled={installMutation.isPending}
                        onClick={() => {
                          setInstallError(null);
                          installMutation.mutate();
                        }}
                        className="mt-1.5 w-full rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                      >
                        {installMutation.isPending
                          ? "Installing…"
                          : "Install packages"}
                      </button>
                    )}
                    {installError && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[10px] font-semibold text-red-400">
                          Install failed — click for details
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-bg p-2 text-[9px] text-red-300">
                          {installError}
                        </pre>
                      </details>
                    )}
                  </>
                )}
              </Section>
            </>
          )}

          {/* --- Unloaded integration: schema-only preview --- */}
          {!isOn && (
            <>
              {detailLoading && (
                <p className="py-1 font-mono text-[10px] text-text-muted">
                  loading preview…
                </p>
              )}

              {!detailLoading && detail && (
                <>
                  <Section
                    title="🔑 SECRETS"
                    count={`${detail.secrets.length}`}
                    defaultOpen={false}
                  >
                    {detail.secrets.length === 0 ? (
                      <Empty>none declared</Empty>
                    ) : (
                      detail.secrets.map((key) => (
                        <Item key={key} name={key} bullet="text-text-muted" />
                      ))
                    )}
                  </Section>

                  <Section
                    title="📦 PACKAGES"
                    count={`${detail.requirements.length}`}
                    defaultOpen={false}
                  >
                    {detail.requirements.length === 0 ? (
                      <Empty>none declared</Empty>
                    ) : (
                      detail.requirements.map((p) => (
                        <Item key={p} name={p} bullet="text-text-muted" />
                      ))
                    )}
                  </Section>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- File preview modal ---- */}
      {previewFile && (
        <ModuleFilePreview
          moduleName={info.name}
          path={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ModuleFilePreview({
  moduleName,
  path,
  onClose,
}: {
  moduleName: string;
  path: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["module-file", moduleName, path],
    queryFn: () => fetchModuleFile(moduleName, path),
    staleTime: 30_000,
  });

  return (
    <FilePreviewModal
      title={
        <>
          <span className="text-text-muted">{moduleName}/</span>
          {path}
        </>
      }
      content={data?.content ?? null}
      isLoading={isLoading}
      error={!!error}
      onClose={onClose}
    />
  );
}

function Section({
  title,
  count,
  warn,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: string;
  warn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded border-l-2 border-accent py-1 pl-2 pr-1.5 text-[10px] font-bold uppercase tracking-wider text-text hover:bg-accent/5"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[9px] text-text-muted">
            {open ? "▾" : "▸"}
          </span>
          {title}
        </span>
        <span
          className={`font-mono rounded px-1.5 py-0.5 text-[10px] font-semibold ${warn ? "bg-amber-400/20 text-amber-300" : "bg-accent/20 text-accent"}`}
        >
          {count}
        </span>
      </button>
      {open && <div className="mt-1 space-y-px">{children}</div>}
    </div>
  );
}

function Item({
  name,
  trailing,
  bullet,
  onClick,
}: {
  name: string;
  trailing?: React.ReactNode;
  bullet?: string;
  onClick?: () => void;
}) {
  const className =
    "group flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] font-mono transition-colors hover:bg-accent/10";
  const inner = (
    <>
      <span className={`text-[9px] leading-none ${bullet ?? "text-accent"}`}>
        ●
      </span>
      <span className="flex-1 truncate text-text font-medium">{name}</span>
      {trailing}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1.5 py-1 text-[10px] italic text-text-muted">{children}</p>
  );
}

function Pill({
  children,
  tone,
  mono,
}: {
  children: React.ReactNode;
  tone: "ok" | "bad";
  mono?: boolean;
}) {
  const toneClass =
    tone === "bad"
      ? "border-red-500/50 bg-red-500/15 text-red-300"
      : "border-accent/50 bg-accent/15 text-accent";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${toneClass} ${mono ? "font-mono" : ""}`}
    >
      {children}
    </span>
  );
}
