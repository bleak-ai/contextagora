import { createFileRoute } from "@tanstack/react-router";
import { BenchmarkDashboard } from "../components/BenchmarkDashboard";

export const Route = createFileRoute("/benchmarks/")({
  component: BenchmarkDashboard,
});
