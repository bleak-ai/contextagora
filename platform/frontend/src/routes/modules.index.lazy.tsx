import { createLazyFileRoute } from "@tanstack/react-router";
import { ModuleDashboard } from "../components/ModuleDashboard";

export const Route = createLazyFileRoute("/modules/")({
  component: ModuleDashboard,
});
