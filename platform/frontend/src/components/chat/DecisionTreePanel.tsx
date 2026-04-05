import { useQuery } from "@tanstack/react-query";
import { fetchModules } from "../../api/modules";
import { useChatStore } from "../../hooks/useChatStore";

export function DecisionTreePanel() {
  const treeState = useChatStore((s) => s.treeState);
  const { data: modulesData } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const modules = modulesData?.modules || [];

  // Show empty state for new sessions
  if (!treeState || treeState.active_path.length === 0) {
    return (
      <div className="text-xs text-text-muted px-1 py-2">
        No navigation yet
      </div>
    );
  }

  return (
    <div className="space-y-2 px-1 py-2">
      {/* Breadcrumb navigation */}
      <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
        <span>📍</span>
        <span className="truncate">
          {treeState.active_path.join(" → ")}
        </span>
      </div>

      {/* Simple module tree */}
      <div className="text-xs space-y-1">
        {modules.map((module) => {
          const isActive = treeState.active_path[0] === module;
          const count = treeState.module_counts[module] || 0;

          return (
            <div
              key={module}
              className={`flex items-center gap-1 ${
                isActive
                  ? "text-accent font-bold"
                  : "text-text-secondary"
              }`}
            >
              <span>📁</span>
              <span className="truncate">{module}</span>
              {count > 0 && (
                <span className="text-[10px] text-text-muted">
                  ({count})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
