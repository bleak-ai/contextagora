import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Sidebar } from "../components/Sidebar";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full min-w-0">
        <Outlet />
      </main>
    </div>
  ),
});
