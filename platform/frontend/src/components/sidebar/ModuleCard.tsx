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
      ? "border-amber-500/40"
      : "border-accent/50";
  const dotClass = !selected
    ? "bg-text-muted"
    : status === "warn"
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]";

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
      className={`mb-1.5 overflow-hidden rounded-md border bg-bg-raised ${borderClass}`}
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
        <div className="border-t border-dashed border-border bg-black/25 px-3 py-2">
          {module.files.length > 0 && (
            <Section title="📄 FILES" count={`${module.files.length}`}>
              {module.files.map((f) => (
                <Item key={f} name={f} />
              ))}
            </Section>
          )}

          {totalSecretCount > 0 && (
            <Section
              title="🔑 SECRETS"
              count={secretCountLabel}
              warn={secretCountWarn}
            >
              {Object.entries(module.secrets).map(([key, val]) => (
                <Item
                  key={key}
                  name={key}
                  trailing={
                    val === null ? (
                      <span className="rounded border border-red-500/35 bg-red-500/10 px-1.5 py-px text-[9px] text-red-400">
                        missing
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-text-secondary">
                        {val}
                      </span>
                    )
                  }
                />
              ))}
            </Section>
          )}

          {module.packages.length > 0 && (
            <Section title="📦 PACKAGES" count={`${module.packages.length}`}>
              {module.packages.map((p) => (
                <Item
                  key={p.name}
                  name={p.name}
                  trailing={
                    p.installed ? (
                      <span className="font-mono text-[10px] text-text-secondary">
                        {p.version}
                      </span>
                    ) : (
                      <span className="rounded border border-red-500/35 bg-red-500/10 px-1.5 py-px text-[9px] text-red-400">
                        not installed
                      </span>
                    )
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  warn,
  children,
}: {
  title: string;
  count: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 flex items-center justify-between text-[9px] font-semibold tracking-wider text-text-muted">
        <span>{title}</span>
        <span className={`font-mono ${warn ? "text-amber-400" : ""}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Item({
  name,
  trailing,
}: {
  name: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[11px] font-mono">
      <span className="flex-1 truncate text-text">{name}</span>
      {trailing}
    </div>
  );
}
