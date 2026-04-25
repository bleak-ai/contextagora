import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchJobRuns, type Job, type JobRun } from "../../api/jobs";
import { Modal } from "../Modal";

function fmtTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString();
}

function RunRow({ run }: { run: JobRun }) {
  const [open, setOpen] = useState(false);
  const dot = run.succeeded ? "bg-success" : "bg-red-400";
  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-xs text-text">{fmtTime(run.started_at)}</span>
        <span className="text-[10px] text-text-muted">{run.duration_ms}ms</span>
        <span className="ml-auto text-[10px] text-text-muted">
          exit {run.exit_code}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 pb-3 text-[10px] font-mono">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-input p-2">
            {run.stdout || (
              <span className="italic text-text-muted">(no stdout)</span>
            )}
          </pre>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-input p-2 text-red-300">
            {run.stderr || (
              <span className="italic text-text-muted">(no stderr)</span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

export function JobRunsModal({
  job,
  onClose,
}: {
  job: Job;
  onClose: () => void;
}) {
  const { data: runs = [] } = useQuery({
    queryKey: ["job-runs", job.id],
    queryFn: () => fetchJobRuns(job.module, job.name),
    refetchInterval: 5000,
  });
  const newestFirst = [...runs].reverse();

  return (
    <Modal onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-md border border-border bg-bg-hover p-4"
      >
        <div className="mb-1 font-mono text-sm text-text">{job.id}</div>
        <div className="mb-3 text-xs text-text-muted">
          every {job.every} · {job.script}
        </div>
        {newestFirst.length === 0 ? (
          <p className="text-xs italic text-text-muted">No runs yet.</p>
        ) : (
          newestFirst.map((r, i) => <RunRow key={`${r.started_at}-${i}`} run={r} />)
        )}
      </div>
    </Modal>
  );
}
