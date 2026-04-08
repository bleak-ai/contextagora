import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/benchmarks/$taskId")({
  component: () => <Outlet />,
});
