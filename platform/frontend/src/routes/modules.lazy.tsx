import { createLazyFileRoute } from "@tanstack/react-router";
import { ModuleRegistry } from "../components/ModuleRegistry";

export const Route = createLazyFileRoute("/modules")({
  component: ModuleRegistry,
});
