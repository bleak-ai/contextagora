import { useState } from "react";
import { FileText, Zap, Key, Package, Clock, ChevronDown, ChevronRight, Edit2, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModule, type ModuleInfo } from "../../../api/modules";
import { installModuleDeps, type LoadedModule } from "../../../api/workspace";
import { fetchJobs, triggerJob, type Job } from "../../../api/jobs";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";
import { JobRunsModal } from "../JobRunsModal";

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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface IntegrationCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onToggle?: (enabled: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function IntegrationCard({
  info,
  loaded,
  onToggle,
  onEdit,
  onDelete,
}: IntegrationCardProps) {
  const isOn = loaded !== null;
  const status = isOn ? statusOf(loaded) : null;
  const tone = isOn ? (status === "warn" ? "warn" : "ok") : "idle";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  const [expanded, setExpanded] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["module", info.name],
    queryFn: () => fetchModule(info.name),
    enabled: expanded && !isOn,
    staleTime: 60_000,
  });

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

  // Jobs for this module. One global query, filtered client-side; TanStack
  // Query dedupes the request across all loaded module cards. No polling —
  // refetch on expand and after a manual Run.
  const { data: allJobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
    enabled: expanded && isOn,
    staleTime: 30_000,
  });
  const jobs = allJobs.filter((j) => j.module === info.name);

  const triggerMutation = useMutation({
    mutationFn: ({ name }: { name: string }) => triggerJob(info.name, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const missingCount = isOn ? countMissing(loaded) : 0;

  /* --- partition files into docs (.md) and scripts (.py) --- */
  const docFiles = isOn ? loaded.files.filter((f) => !f.endsWith(".py")) : [];
  const scriptFiles = isOn ? loaded.files.filter((f) => f.endsWith(".py")) : [];

  const okSecretCount = isOn
    ? Object.values(loaded.secrets).filter((v) => v !== null).length
    : 0;
  const totalSecretCount = isOn ? Object.keys(loaded.secrets).length : 0;
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

  const headerMiddle = (
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
        {!expanded && missingCount > 0 && (
          <span className="text-[10px] font-semibold text-red-400">
            {missingCount} missing
          </span>
        )}
        {expanded
          ? <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
          : <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
      </span>
    </button>
  );

  const headerRight = onToggle ? (
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
  ) : undefined;

  return (
    <ModuleCardShell
      tone={tone}
      headerMiddle={headerMiddle}
      headerRight={headerRight}
    >
      {expanded && (
        <div className="border-t border-border bg-bg-raised px-3 py-2.5">
          {isOn && (
            <>
              <Section
                title={<><FileText className="w-3.5 h-3.5 shrink-0" /> FILES</>}
                count={`${docFiles.length}`}
                defaultOpen={false}
              >
                {docFiles.length === 0 ? (
                  <Empty>no files</Empty>
                ) : (
                  docFiles.map((f) => (
                    <Item
                      key={f}
                      name={f}
                      bullet="text-accent/60"
                      onClick={() => setPreviewFile(f)}
                    />
                  ))
                )}
              </Section>

              {scriptFiles.length > 0 && (
                <Section
                  title={<><Zap className="w-3.5 h-3.5 text-accent shrink-0" /> SCRIPTS</>}
                  count={`${scriptFiles.length}`}
                  defaultOpen={false}
                >
                  {scriptFiles.map((f) => (
                    <Item
                      key={f}
                      name={f}
                      bullet="text-accent/60"
                      onClick={() => setPreviewFile(f)}
                    />
                  ))}
                </Section>
              )}

              <Section
                title={<><Key className="w-3.5 h-3.5 text-accent shrink-0" /> SECRETS</>}
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
                title={<><Package className="w-3.5 h-3.5 text-accent shrink-0" /> PACKAGES</>}
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

              {jobs.length > 0 && (
                <Section
                  title={<><Clock className="w-3.5 h-3.5 text-accent shrink-0" /> JOBS</>}
                  count={`${jobs.length}`}
                  defaultOpen={false}
                >
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onOpen={() => setSelectedJob(job)}
                      onRun={() =>
                        !job.running &&
                        triggerMutation.mutate({ name: job.name })
                      }
                    />
                  ))}
                </Section>
              )}

              <div className="mt-3 pt-1.5 border-t border-border/50 flex items-center justify-end gap-3">
                {loaded.packages.some((p) => !p.installed) && (
                  <button
                    type="button"
                    disabled={installMutation.isPending}
                    onClick={() => {
                      setInstallError(null);
                      installMutation.mutate();
                    }}
                    className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1 disabled:opacity-50"
                  >
                    <Package className="w-3 h-3" />
                    {installMutation.isPending ? "Installing..." : "Install packages"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEdit}
                  className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-[10px] text-text-muted hover:text-red-400 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            </>
          )}

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
                    title={<><Key className="w-3.5 h-3.5 text-accent shrink-0" /> SECRETS</>}
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
                    title={<><Package className="w-3.5 h-3.5 text-accent shrink-0" /> PACKAGES</>}
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

              <div className="mt-3 pt-1.5 border-t border-border/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleEdit}
                  className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-[10px] text-text-muted hover:text-red-400 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            </>
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

      {selectedJob && (
        <JobRunsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </ModuleCardShell>
  );
}

function relativeTime(epochSec: number): string {
  const diff = Date.now() / 1000 - epochSec;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function jobDotClass(job: Job): string {
  if (job.running) return "bg-accent animate-pulse";
  if (!job.last_run) return "bg-text-muted";
  return job.last_run.succeeded ? "bg-success" : "bg-red-400";
}

function JobRow({
  job,
  onOpen,
  onRun,
}: {
  job: Job;
  onOpen: () => void;
  onRun: () => void;
}) {
  return (
    <div className="group flex w-full items-center gap-2 rounded px-1.5 py-1 text-[11px] font-mono hover:bg-accent/10">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-center gap-2 text-left min-w-0"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${jobDotClass(job)}`} />
        <span className="flex-1 truncate text-text font-medium">{job.name}</span>
        <span className="shrink-0 text-[9px] text-text-muted">every {job.every}</span>
        <span className="shrink-0 text-[9px] text-text-muted">
          {job.last_run ? relativeTime(job.last_run.started_at) : "never"}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
        disabled={job.running}
        className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
      >
        Run
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Section({
  title,
  count,
  warn,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
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
          {open
            ? <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
            : <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
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
