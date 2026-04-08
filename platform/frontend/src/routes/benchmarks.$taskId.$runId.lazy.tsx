import { createLazyFileRoute } from "@tanstack/react-router";
import { BenchmarkRunView } from "../components/BenchmarkRunView";

export const Route = createLazyFileRoute("/benchmarks/$taskId/$runId")({
  component: BenchmarkRunView,
});
