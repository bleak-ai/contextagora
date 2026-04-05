import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { IconRail } from "../components/IconRail";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="flex h-full">
      <IconRail />
      <main className="flex-1 flex flex-col h-full min-w-0">
        <Outlet />
      </main>
    </div>
  ),
});
