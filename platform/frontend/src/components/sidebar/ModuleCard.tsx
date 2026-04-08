import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchModuleFile } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";

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
      ? "border-amber-500/60"
      : "border-accent/70";
  const cardBgClass = !selected
    ? "bg-bg-hover"
    : status === "warn"
      ? "bg-amber-500/[0.08]"
      : "bg-accent/[0.10]";
  const dotClass = !selected
    ? "bg-text-muted"
    : status === "warn"
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]";

  const [previewFile, setPreviewFile] = useState<string | null>(null);

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
              module.packages.map((p) => (
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
              ))
            )}
          </Section>
        </div>
      )}

      {previewFile && (
        <FilePreview
          moduleName={module.name}
          path={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

function FilePreview({
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
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs text-text">
            <span className="text-text-muted">{moduleName}/</span>
            {path}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto bg-black/40 px-4 py-3">
          {isLoading && <p className="text-xs text-text-muted">loading…</p>}
          {error && (
            <p className="text-xs text-red-400">failed to load file</p>
          )}
          {data && (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text">
              {data.content}
            </pre>
          )}
        </div>
      </div>
    </div>
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
