import { useMemo } from "react";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { IntegrationCard } from "./cards/IntegrationCard";
import { ZONE_WRAPPER_CLASS } from "./zoneStyles";

interface ConnectorsZoneProps {
  modules: ModuleInfo[];        // integrations only, both loaded and unloaded
  loaded: LoadedModule[];
  onToggleModule: (name: string, enabled: boolean) => void;
  onEditModule: (name: string) => void;
  onDeleteModule: (name: string, kind: "integration") => void;
}

export function ConnectorsZone({
  modules,
  loaded,
  onToggleModule,
  onEditModule,
  onDeleteModule,
}: ConnectorsZoneProps) {
  const sorted = useMemo(() => {
    const loadedNames = new Set(loaded.map((l) => l.name));
    return [...modules].sort((a, b) => {
      const aOn = loadedNames.has(a.name) ? 0 : 1;
      const bOn = loadedNames.has(b.name) ? 0 : 1;
      return aOn - bOn;
    });
  }, [modules, loaded]);

  if (modules.length === 0) {
    return (
      <div className={ZONE_WRAPPER_CLASS.connectors}>
        <SectionHeader count={0} />
        <p className="px-1 py-2 text-[11px] italic text-text-muted">
          No connectors yet. Create one from Library below.
        </p>
      </div>
    );
  }

  return (
    <div className={ZONE_WRAPPER_CLASS.connectors}>
      <SectionHeader count={modules.length} />
      <div className="space-y-0">
        {sorted.map((m) => {
          const loadedRecord = loaded.find((l) => l.name === m.name) ?? null;
          return (
            <IntegrationCard
              key={m.name}
              info={m}
              loaded={loadedRecord}
              onToggle={(enabled) => onToggleModule(m.name, enabled)}
              onEdit={() => onEditModule(m.name)}
              onDelete={() => onDeleteModule(m.name, "integration")}
            />
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text">
        Connectors
      </span>
      <span className="text-[9px] text-text-muted">{count}</span>
    </div>
  );
}
