import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchModuleFile } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { installModuleDeps } from "../../api/workspace";
import { FilePreviewModal } from "./FilePreviewModal";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";

interface Props {
  module: LoadedModule;
  expanded: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}

function statusOf(m: LoadedModule): "ok" | "warn" {
  const missingSecret = Object.values(m.secrets).some((v) => v === null);
  const failedPackage = m.packages.some((p) => !p.installed);
  return missingSecret || failedPackage ? "warn" : "ok";
}

export function ModuleCard({
  module,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
}: Props) {
  const status = statusOf(module);
  const borderClass = !selected
    ? "border-border opacity-60"
    : status === "warn"
      ? "border-red-500/60"
      : "border-accent/70";
  const cardBgClass = !selected
    ? "bg-bg-hover"
    : status === "warn"
      ? "bg-red-500/[0.08]"
      : "bg-accent/[0.10]";
  const dotClass = !selected
    ? "bg-text-muted"
    : status === "warn"
      ? "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
      : "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const [installError, setInstallError] = useState<string | null>(null);

  const installMutation = useMutation({
    mutationFn: () => installModuleDeps(module.name),
    onSuccess: (data) => {
      if (!data.success) {
        setInstallError(data.error ?? "Unknown error");
      } else {
        setInstallError(null);
      }
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const okSecretCount = Object.values(module.secrets).filter(
    (v) => v !== null,
  ).length;
  const totalSecretCount = Object.keys(module.secrets).length;
  const secretCountLabel =
    okSecretCount === totalSecretCount
      ? `${totalSecretCount}`
      : `${okSecretCount} / ${totalSecretCount}`;
  const secretCountWarn = okSecretCount !== totalSecretCount;

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border ${cardBgClass} ${borderClass}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 accent-accent"
          title={selected ? "Uncheck and click Load to unload" : "Check and click Load to re-load"}
        />
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-center justify-between gap-2 text-left hover:opacity-80"
        >
          <span className="text-xs font-semibold text-text">
            {module.name}
          </span>
          <span className="text-[10px] text-text-muted">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openModuleEditor(module.name);
          }}
          className="p-1 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
          title="Edit module"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border bg-bg-raised px-3 py-2.5">
          <Section
            title="📄 FILES"
            count={`${module.files.length}`}
            defaultOpen={false}
          >
            {module.files.length === 0 ? (
              <Empty>no files</Empty>
            ) : (
              module.files.map((f) => (
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
              Object.entries(module.secrets).map(([key, val]) => (
                <Item
                  key={key}
                  name={key}
                  bullet={val === null ? "text-red-400/70" : "text-accent/60"}
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
            count={`${module.packages.length}`}
            warn={module.packages.some((p) => !p.installed)}
            defaultOpen={module.packages.some((p) => !p.installed)}
          >
            {module.packages.length === 0 ? (
              <Empty>none declared</Empty>
            ) : (
              <>
                {module.packages.map((p) => (
                  <Item
                    key={p.name}
                    name={p.name}
                    bullet={p.installed ? "text-accent/60" : "text-red-400/70"}
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
                {module.packages.some((p) => !p.installed) && (
                  <button
                    type="button"
                    disabled={installMutation.isPending}
                    onClick={() => {
                      setInstallError(null);
                      installMutation.mutate();
                    }}
                    className="mt-1.5 w-full rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                  >
                    {installMutation.isPending ? "Installing…" : "Install packages"}
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
        </div>
      )}

      {previewFile && (
        <ModuleFilePreview
          moduleName={module.name}
          path={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

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
