import { apiFetch } from "./client";

export type JobRun = {
  job_id: string;
  started_at: number;
  ended_at: number;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  succeeded: boolean;
};

export type Job = {
  id: string;          // "module/name"
  module: string;
  name: string;
  script: string;
  every: string;       // "1h"
  every_seconds: number;
  running: boolean;
  last_run: JobRun | null;
};

export async function fetchJobs(): Promise<Job[]> {
  return apiFetch("/jobs");
}

export async function fetchJobRuns(module: string, name: string): Promise<JobRun[]> {
  return apiFetch(`/jobs/${encodeURIComponent(module)}/${encodeURIComponent(name)}/runs`);
}

export async function triggerJob(module: string, name: string): Promise<{ fired: boolean }> {
  return apiFetch(`/jobs/${encodeURIComponent(module)}/${encodeURIComponent(name)}/run`, {
    method: "POST",
  });
}
