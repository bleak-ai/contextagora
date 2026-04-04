import { createFileRoute } from "@tanstack/react-router";
import { ModuleRegistry } from "../components/ModuleRegistry";

export const Route = createFileRoute("/modules")({
  component: ModuleRegistry,
});
