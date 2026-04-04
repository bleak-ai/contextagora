import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="flex items-center justify-center h-full text-text-muted">
      Chat will go here
    </div>
  ),
});
