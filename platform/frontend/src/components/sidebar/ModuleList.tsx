import type { LoadedModule } from "../../api/workspace";
import { IdleModuleCard } from "./IdleModuleCard";
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
          className="flex items-center gap-1 rounded border border-border bg-bg-raised px-1.5 py-0.5 text-[9px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
          title="Re-fetch secrets from Infisical for all loaded modules"
        >
          <span className={isRefreshingSecrets ? "animate-spin" : ""}>↻</span>
          <span>{isRefreshingSecrets ? "checking…" : "Re-check secrets"}</span>
        </button>
      </div>

      {loaded.map((m) => {
        const isSelected = selected.has(m.name);
        return (
          <ModuleCard
            key={m.name}
            module={m}
            expanded={isSelected}
            selected={isSelected}
            onToggleExpand={() => onToggleSelect(m.name)}
            onToggleSelect={() => onToggleSelect(m.name)}
          />
        );
      })}

      {idleModules.map((name) => (
        <IdleModuleCard
          key={name}
          name={name}
          selected={selected.has(name)}
          onToggleSelect={() => onToggleSelect(name)}
        />
      ))}

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
            : selected.size === 0 && loaded.length > 0
              ? "Unload All"
              : "Load Selected"}
      </button>
    </div>
  );
}
