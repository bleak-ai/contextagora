import { useState } from "react";

import type { LoadedModule } from "../../api/workspace";
import { ModuleCard } from "./ModuleCard";

interface Props {
  loaded: LoadedModule[];
  available: string[]; // all module names from /api/modules
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onLoad: () => void;
  isLoading: boolean;
  selectionMatchesLoaded: boolean;
  onRefreshSecrets: () => void;
  isRefreshingSecrets: boolean;
}

export function ModuleList({
  loaded,
  available,
  selected,
  onToggleSelect,
  onLoad,
  isLoading,
  selectionMatchesLoaded,
  onRefreshSecrets,
  isRefreshingSecrets,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const loadedNames = new Set(loaded.map((m) => m.name));
  const idleModules = available.filter((n) => !loadedNames.has(n));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">
          MODULES
        </span>
        <button
          type="button"
          onClick={onRefreshSecrets}
          disabled={isRefreshingSecrets}
          className="text-[10px] text-text-secondary hover:text-text"
          title="Re-check Infisical secrets"
        >
          {isRefreshingSecrets ? "…" : "↻"}
        </button>
      </div>

      {loaded.map((m) => (
        <ModuleCard
          key={m.name}
          module={m}
          expanded={expanded.has(m.name)}
          selected={selected.has(m.name)}
          onToggleExpand={() => toggleExpand(m.name)}
          onToggleSelect={() => onToggleSelect(m.name)}
        />
      ))}

      {idleModules.map((name) => {
        const isSelected = selected.has(name);
        return (
          <label
            key={name}
            className={`mb-1.5 flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
              isSelected
                ? "border-accent/60 bg-accent/10"
                : "border-dashed border-border opacity-55 hover:opacity-100"
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(name)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
            <span className="flex-1 text-xs text-text-secondary">{name}</span>
          </label>
        );
      })}

      <button
        type="button"
        onClick={onLoad}
        disabled={
          isLoading ||
          (selectionMatchesLoaded && loaded.length > 0) ||
          (selected.size === 0 && loaded.length === 0)
        }
        className={`mt-2 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
          isLoading
            ? "animate-pulse bg-accent/20 text-accent"
            : selectionMatchesLoaded && loaded.length > 0
              ? "cursor-default border border-accent/20 bg-accent/10 text-accent/70"
              : "bg-accent text-accent-text hover:bg-accent-hover"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        {isLoading
          ? "Loading..."
          : selectionMatchesLoaded && loaded.length > 0
            ? `${loaded.length} Module${loaded.length !== 1 ? "s" : ""} Loaded`
            : "Load Selected"}
      </button>
    </div>
  );
}
