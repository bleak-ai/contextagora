import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchJobs, triggerJob, type Job } from "../../api/jobs";
import { JobRunsModal } from "./JobRunsModal";

function relativeTime(epochSec: number): string {
  const diff = Date.now() / 1000 - epochSec;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusDotClass(job: Job): string {
  if (job.running) return "bg-accent animate-pulse";
  if (!job.last_run) return "bg-text-muted";
  return job.last_run.succeeded
    ? "bg-success shadow-[0_0_6px_rgba(92,184,122,0.4)]"
    : "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]";
}

export function JobsPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Job | null>(null);

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
    refetchInterval: 5000,
  });

  const trigger = useMutation({
    mutationFn: ({ module, name }: { module: string; name: string }) =>
      triggerJob(module, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  if (jobs.length === 0) {
    return (
      <p className="px-2 py-2 text-[10px] italic text-text-muted">
        No jobs declared in any loaded module.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-0.5 px-1 py-1">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => setSelected(job)}
            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-bg-hover text-left"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(job)}`}
            />
            <span className="flex-1 truncate font-mono text-[11px] text-text">
              {job.id}
            </span>
            <span className="whitespace-nowrap text-[9px] text-text-muted">
              every {job.every}
            </span>
            <span className="min-w-[50px] whitespace-nowrap text-right text-[9px] text-text-muted">
              {job.last_run ? relativeTime(job.last_run.started_at) : "never"}
            </span>
            <span
              role="button"
              aria-label={`Run ${job.id} now`}
              onClick={(e) => {
                e.stopPropagation();
                if (!job.running) trigger.mutate({ module: job.module, name: job.name });
              }}
              className={`rounded border border-border px-1.5 py-0.5 text-[9px] ${
                job.running
                  ? "opacity-50 cursor-not-allowed"
                  : "text-accent hover:border-border-light"
              }`}
            >
              Run
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <JobRunsModal job={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
