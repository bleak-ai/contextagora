import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-full">
      <div className="w-72 border-r border-border bg-bg-raised p-4">
        <span className="text-accent font-semibold text-sm">CONTEXT LOADER</span>
      </div>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  ),
});
