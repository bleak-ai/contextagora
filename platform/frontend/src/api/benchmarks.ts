import { apiFetch } from "./client";

export interface BenchmarkTask {
  id: string;
  description: string;
  prompt: string;
  judge_prompt: string;
}

export interface BenchmarkRunSummary {
  id: string;
  mtime: number;
}

export interface RunBenchmarkResult {
  ok: boolean;
  task_id: string;
  run_id: string;
  path: string;
}

export function listBenchmarkTasks(): Promise<{ tasks: BenchmarkTask[] }> {
  return apiFetch("/benchmarks/tasks");
}

export function listBenchmarkRuns(
  taskId: string,
): Promise<{ runs: BenchmarkRunSummary[] }> {
  return apiFetch(`/benchmarks/tasks/${taskId}/runs`);
}

export function getBenchmarkRun(
  taskId: string,
  runId: string,
): Promise<{ markdown: string }> {
  return apiFetch(`/benchmarks/tasks/${taskId}/runs/${runId}`);
}

export function downloadBenchmarkRunUrl(taskId: string, runId: string): string {
  return `/api/benchmarks/tasks/${taskId}/runs/${runId}/download`;
}

export function deleteBenchmarkRun(
  taskId: string,
  runId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/benchmarks/tasks/${taskId}/runs/${runId}`, {
    method: "DELETE",
  });
}

export async function uploadBenchmarkRun(
  taskId: string,
  file: File,
): Promise<{ ok: boolean; task_id: string; run_id: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/benchmarks/tasks/${taskId}/runs/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || body.error || res.statusText);
  }
  return res.json();
}

export interface BenchmarkProgress {
  phase?: string;
  tool?: string;
  tool_count?: number;
  session_id?: string;
  elapsed_s?: number;
}

export interface BenchmarkRunHandlers {
  onStarted?: (e: { task_id: string; timestamp: string }) => void;
  onProgress?: (e: BenchmarkProgress) => void;
  onJudging?: (e: BenchmarkProgress) => void;
  onDone?: (e: RunBenchmarkResult & { verdict: string; elapsed_s: number }) => void;
  onError?: (msg: string) => void;
}

/** Stream a benchmark run via SSE. Returns a cancel fn. */
export function runBenchmarkTaskStream(
  taskId: string,
  handlers: BenchmarkRunHandlers,
): () => void {
  // EventSource doesn't support POST, so use fetch + ReadableStream parsing.
  const ctrl = new AbortController();
  (async () => {
    try {
      const resp = await fetch(`/api/benchmarks/tasks/${taskId}/run`, {
        method: "POST",
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        handlers.onError?.(`HTTP ${resp.status}`);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          let evType = "message";
          let dataLine = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) evType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let data: any;
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }
          if (evType === "started") handlers.onStarted?.(data);
          else if (evType === "progress") handlers.onProgress?.(data);
          else if (evType === "judging") handlers.onJudging?.(data);
          else if (evType === "done") handlers.onDone?.(data);
          else if (evType === "error") handlers.onError?.(data.error || "error");
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") handlers.onError?.(e.message || String(e));
    }
  })();
  return () => ctrl.abort();
}

export interface TaskBody {
  id: string;
  description: string;
  prompt: string;
  judge_prompt: string;
}

export function createBenchmarkTask(
  body: TaskBody,
): Promise<{ ok: boolean; id: string }> {
  return apiFetch(`/benchmarks/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateBenchmarkTask(
  taskId: string,
  body: Omit<TaskBody, "id">,
): Promise<{ ok: boolean; id: string }> {
  return apiFetch(`/benchmarks/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteBenchmarkTask(
  taskId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/benchmarks/tasks/${taskId}`, { method: "DELETE" });
}

export function downloadBenchmarkTaskUrl(taskId: string): string {
  return `/api/benchmarks/tasks/${taskId}/download`;
}

export async function uploadBenchmarkTask(
  file: File,
): Promise<{ ok: boolean; id: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/benchmarks/tasks/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || body.error || res.statusText);
  }
  return res.json();
}
