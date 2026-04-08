import { createFileRoute } from "@tanstack/react-router";
import { BenchmarkTaskDetail } from "../components/BenchmarkTaskDetail";

export const Route = createFileRoute("/benchmarks/$taskId/")({
  component: BenchmarkTaskDetail,
});
