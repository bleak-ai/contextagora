import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { IconRail } from "../components/IconRail";
import { ModuleEditorModal } from "../components/ModuleEditorModal";
import { useModuleEditorStore } from "../hooks/useModuleEditorStore";

interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const editingModule = useModuleEditorStore((s) => s.editingModule);

  return (
    <div className="flex h-full">
      <IconRail />
      <main className="flex-1 flex flex-col h-full min-w-0">
        <Outlet />
      </main>
      {editingModule && <ModuleEditorModal />}
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
