import { apiFetch } from "./client";

export type Workflow = {
  name: string;
  summary: string;
  entry_step: string | null;
  steps: string[];
  in_flight_runs: number;
};

export async function fetchWorkflows(): Promise<Workflow[]> {
  const data: { workflows: Workflow[] } = await apiFetch("/workflows");
  return data.workflows;
}
