import { createLazyFileRoute } from "@tanstack/react-router";
import { ModuleEditor } from "../components/ModuleEditor";

export const Route = createLazyFileRoute("/modules/$name")({
  component: ModuleEditor,
});
