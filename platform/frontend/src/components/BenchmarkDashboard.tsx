import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  createBenchmarkTask,
  deleteBenchmarkTask,
  downloadBenchmarkTaskUrl,
  listBenchmarkTasks,
  updateBenchmarkTask,
  uploadBenchmarkTask,
  type TaskBody,
} from "../api/benchmarks";
import { BenchmarkTaskForm } from "./BenchmarkTaskForm";

type FormState =
  | { mode: "create" }
  | { mode: "edit"; task: TaskBody }
  | null;

export function BenchmarkDashboard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["benchmark-tasks"],
    queryFn: listBenchmarkTasks,
  });
  const tasks = data?.tasks || [];

  const [formState, setFormState] = useState<FormState>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (body: TaskBody) => {
    if (formState?.mode === "edit") {
      await updateBenchmarkTask(body.id, {
        description: body.description,
        prompt: body.prompt,
        judge_prompt: body.judge_prompt,
      });
    } else {
      await createBenchmarkTask(body);
    }
    setFormState(null);
    qc.invalidateQueries({ queryKey: ["benchmark-tasks"] });
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteBenchmarkTask(taskId);
      qc.invalidateQueries({ queryKey: ["benchmark-tasks"] });
    } catch (e) {
      setStatusMsg((e as Error).message || "Delete failed");
    }
  };

  const handleUpload = async (file: File) => {
    setStatusMsg(null);
    try {
      const res = await uploadBenchmarkTask(file);
      setStatusMsg(`Imported ${res.id}`);
      qc.invalidateQueries({ queryKey: ["benchmark-tasks"] });
    } catch (e) {
      setStatusMsg((e as Error).message || "Upload failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-sm font-semibold text-text">Benchmarks</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
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
            Import .yaml
          </button>
          <button
            onClick={() => setFormState({ mode: "create" })}
            className="px-3 py-1.5 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover"
          >
            New task
          </button>
        </div>
      </div>

      <div className="p-6">
        {statusMsg && (
          <p className="text-xs text-text-muted mb-3">{statusMsg}</p>
        )}

        {isLoading && (
          <p className="text-sm text-text-muted">Loading benchmarks...</p>
        )}

        {!isLoading && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-text-muted text-sm">No benchmark tasks</span>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-bg-raised border border-border rounded-lg p-4 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-text">
                    {task.id}
                  </span>
                  <div className="flex items-center gap-1">
                    <a
                      href={downloadBenchmarkTaskUrl(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover text-text-muted"
                      title="Download yaml"
                    >
                      ↓
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormState({
                          mode: "edit",
                          task: {
                            id: task.id,
                            description: task.description,
                            prompt: task.prompt,
                            judge_prompt: task.judge_prompt,
                          },
                        });
                      }}
                      className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover text-text-muted"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(task.id);
                      }}
                      className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover hover:text-danger text-text-muted"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                  {task.description}
                </p>
                <Link
                  to="/benchmarks/$taskId"
                  params={{ taskId: task.id }}
                  className="text-xs text-accent hover:underline"
                >
                  Open &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {formState && (
        <BenchmarkTaskForm
          initial={formState.mode === "edit" ? formState.task : undefined}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}
    </div>
  );
}
