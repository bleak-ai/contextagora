import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  deleteBenchmarkRun,
  downloadBenchmarkRunUrl,
  listBenchmarkRuns,
  listBenchmarkTasks,
  runBenchmarkTaskStream,
  uploadBenchmarkRun,
} from "../api/benchmarks";

interface RunState {
  status: "idle" | "running" | "judging" | "done" | "error";
  phase?: string;
  tool?: string;
  toolCount?: number;
  elapsed?: number;
  runId?: string;
  verdict?: string;
  error?: string;
}

export function BenchmarkTaskDetail() {
  const { taskId } = useParams({ from: "/benchmarks/$taskId" });
  const queryClient = useQueryClient();
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const { data: tasksData } = useQuery({
    queryKey: ["benchmark-tasks"],
    queryFn: listBenchmarkTasks,
  });
  const task = tasksData?.tasks.find((t) => t.id === taskId);

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["benchmark-runs", taskId],
    queryFn: () => listBenchmarkRuns(taskId),
  });
  const runs = runsData?.runs || [];

  const startRun = () => {
    setRun({ status: "running" });
    cancelRef.current = runBenchmarkTaskStream(taskId, {
      onProgress: (e) =>
        setRun((s) => ({
          ...s,
          status: "running",
          phase: e.phase,
          tool: e.tool,
          toolCount: e.tool_count ?? s.toolCount,
          elapsed: e.elapsed_s,
        })),
      onJudging: (e) =>
        setRun((s) => ({ ...s, status: "judging", elapsed: e.elapsed_s })),
      onDone: (e) => {
        setRun({
          status: "done",
          runId: e.run_id,
          verdict: e.verdict,
          elapsed: e.elapsed_s,
        });
        queryClient.invalidateQueries({ queryKey: ["benchmark-runs", taskId] });
      },
      onError: (msg) => setRun({ status: "error", error: msg }),
    });
  };

  const isRunning = run.status === "running" || run.status === "judging";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setImportMsg(null);
    try {
      const res = await uploadBenchmarkRun(taskId, file);
      setImportMsg(`Imported ${res.run_id}`);
      queryClient.invalidateQueries({ queryKey: ["benchmark-runs", taskId] });
    } catch (e) {
      setImportMsg((e as Error).message || "Upload failed");
    }
  };

  const handleDelete = async (runId: string) => {
    try {
      await deleteBenchmarkRun(taskId, runId);
      queryClient.invalidateQueries({ queryKey: ["benchmark-runs", taskId] });
    } catch (e) {
      setImportMsg((e as Error).message || "Delete failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link
            to="/benchmarks"
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            &larr; Benchmarks
          </Link>
          <h1 className="text-sm font-semibold text-text">{taskId}</h1>
        </div>
        <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 text-xs border border-border rounded hover:bg-bg-hover"
        >
          Import run
        </button>
        <button
          onClick={startRun}
          disabled={isRunning}
          className="px-3 py-1.5 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover disabled:opacity-50 flex items-center gap-2"
        >
          {isRunning && (
            <span className="inline-block w-3 h-3 border-2 border-accent-text/40 border-t-accent-text rounded-full animate-spin" />
          )}
          {run.status === "judging"
            ? "Judging..."
            : run.status === "running"
              ? "Running..."
              : "Run benchmark"}
        </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {task && (
          <>
            <div>
              <h2 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
                Description
              </h2>
              <p className="text-sm text-text">{task.description}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
                Prompt
              </h2>
              <pre className="bg-bg-input border border-border rounded p-3 text-xs text-text font-mono whitespace-pre-wrap">
                {task.prompt}
              </pre>
            </div>
          </>
        )}

        {isRunning && (
          <div className="text-xs text-text-muted bg-bg-raised border border-border rounded p-3 space-y-1">
            <div>
              {run.status === "judging" ? "Judging output..." : "Running agent..."}
              {run.elapsed != null && ` (${run.elapsed}s)`}
            </div>
            {run.toolCount != null && (
              <div className="font-mono">
                tool calls: {run.toolCount}
                {run.tool && ` — last: ${run.tool}`}
              </div>
            )}
          </div>
        )}
        {run.status === "done" && run.runId && (
          <p className="text-xs text-accent">
            Run {run.runId} completed — verdict: {run.verdict} ({run.elapsed}s).{" "}
            <Link
              to="/benchmarks/$taskId/$runId"
              params={{ taskId, runId: run.runId }}
              className="underline"
            >
              View
            </Link>
          </p>
        )}
        {run.status === "error" && (
          <p className="text-xs text-danger">{run.error || "Run failed"}</p>
        )}
        {importMsg && (
          <p className="text-xs text-text-muted">{importMsg}</p>
        )}

        <div>
          <h2 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
            Past runs
          </h2>
          {runsLoading && (
            <p className="text-sm text-text-muted">Loading runs...</p>
          )}
          {!runsLoading && runs.length === 0 && (
            <p className="text-sm text-text-muted">No runs yet.</p>
          )}
          {runs.length > 0 && (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Link
                    to="/benchmarks/$taskId/$runId"
                    params={{ taskId, runId: r.id }}
                    className="flex-1 block bg-bg-raised border border-border rounded p-3 hover:border-accent/40 hover:bg-bg-hover transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-text">
                        {r.id}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(r.mtime * 1000).toLocaleString()}
                      </span>
                    </div>
                  </Link>
                  <a
                    href={downloadBenchmarkRunUrl(taskId, r.id)}
                    className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover text-text-muted"
                    title="Download"
                  >
                    ↓
                  </a>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover hover:text-danger text-text-muted"
                    title="Delete"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
