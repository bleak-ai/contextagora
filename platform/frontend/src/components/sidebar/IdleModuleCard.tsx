import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchModule } from "../../api/modules";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";

interface Props {
  name: string;
  selected: boolean;
  onToggleSelect: () => void;
}

/** A module that is NOT yet loaded. When selected, expands and previews
 * what it WILL bring (from /api/modules/{name}: secrets schema + requirements).
 * No package install status here — that only exists post-load. */
export function IdleModuleCard({ name, selected, onToggleSelect }: Props) {
  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["module", name],
    queryFn: () => fetchModule(name),
    enabled: expanded,
    staleTime: 60_000,
  });

  const borderClass = selected
    ? "border-accent/50"
    : "border-dashed border-border opacity-55 hover:opacity-100";

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border bg-bg-hover transition-colors ${selected ? borderClass : "border-border opacity-100"}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 accent-accent"
        />
        <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-1 items-center justify-between gap-2 text-left hover:opacity-80"
        >
          <span className="text-xs font-semibold text-text-secondary">
            {name}
          </span>
          <span className="text-[10px] text-text-muted">
            {expanded ? "▾" : "▸"}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openModuleEditor(name);
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
        <div className="border-t border-dashed border-border bg-bg-raised px-3 py-2">
          {isLoading && (
            <p className="py-1 font-mono text-[10px] text-text-muted">
              loading preview…
            </p>
          )}

          {!isLoading && data && (
            <>
              {data.secrets.length > 0 && (
                <Section title="🔑 SECRETS" count={`${data.secrets.length}`}>
                  {data.secrets.map((key) => (
                    <Item key={key} name={key} />
                  ))}
                </Section>
              )}
              {data.requirements.length > 0 && (
                <Section
                  title="📦 PACKAGES"
                  count={`${data.requirements.length}`}
                >
                  {data.requirements.map((p) => (
                    <Item key={p} name={p} />
                  ))}
                </Section>
              )}
              {data.secrets.length === 0 && data.requirements.length === 0 && (
                <p className="py-1 font-mono text-[10px] text-text-muted">
                  no secrets or packages declared
                </p>
              )}
              <p className="mt-2 border-t border-dashed border-border pt-1.5 text-[9px] italic text-text-muted">
                click Load Selected to wire
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 flex items-center justify-between text-[9px] font-semibold tracking-wider text-text-muted">
        <span>{title}</span>
        <span className="font-mono">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Item({ name }: { name: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 font-mono text-[11px]">
      <span className="flex-1 truncate text-text-secondary">{name}</span>
    </div>
  );
}
