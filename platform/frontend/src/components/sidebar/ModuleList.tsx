import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { IdleModuleCard } from "./IdleModuleCard";
import { ModuleCard } from "./ModuleCard";

interface Props {
  loaded: LoadedModule[];
  available: ModuleInfo[]; // all module infos from /api/modules
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onLoad: () => void;
  isLoading: boolean;
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
  onRefreshSecrets,
  isRefreshingSecrets,
}: Props) {
  // Only show integration modules in this zone
  const integrations = available.filter((m) => m.kind === "integration" && !m.archived);
  const integrationNames = new Set(integrations.map((m) => m.name));
  const loadedIntegrations = loaded.filter((m) => integrationNames.has(m.name));
  const loadedNames = new Set(loadedIntegrations.map((m) => m.name));
  const idleModules = integrations.filter((m) => !loadedNames.has(m.name));

  // Integration-scoped selection check (independent of task selections)
  const integrationSelectionMatchesLoaded = integrations.every(
    (m) => selected.has(m.name) === loadedNames.has(m.name),
  );
  const selectedIntegrationCount = integrations.filter((m) => selected.has(m.name)).length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">
          INTEGRATIONS
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

      {loadedIntegrations.map((m) => {
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

      {idleModules.map((m) => (
        <IdleModuleCard
          key={m.name}
          name={m.name}
          selected={selected.has(m.name)}
          onToggleSelect={() => onToggleSelect(m.name)}
        />
      ))}

      <button
        type="button"
        onClick={onLoad}
        disabled={
          isLoading ||
          (integrationSelectionMatchesLoaded && loadedIntegrations.length > 0) ||
          (selectedIntegrationCount === 0 && loadedIntegrations.length === 0)
        }
        className={`mt-2 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
          isLoading
            ? "animate-pulse bg-accent/20 text-accent"
            : integrationSelectionMatchesLoaded && loadedIntegrations.length > 0
              ? "cursor-default border border-accent/20 bg-accent/10 text-accent/70"
              : "bg-accent text-accent-text hover:bg-accent-hover"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        {isLoading
          ? "Loading..."
          : integrationSelectionMatchesLoaded && loadedIntegrations.length > 0
            ? `${loadedIntegrations.length} Module${loadedIntegrations.length !== 1 ? "s" : ""} Loaded`
            : selectedIntegrationCount === 0 && loadedIntegrations.length > 0
              ? "Unload All"
              : "Load Selected"}
      </button>
    </div>
  );
}
