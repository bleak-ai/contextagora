import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TaskBody } from "../api/benchmarks";

const SUGGESTION_PROMPT = `I want to define a benchmark task for a coding agent. Generate three things in YAML format:

1. description: a one-line summary of what the task tests
2. prompt: the exact instruction the agent will receive (clear, specific, single goal, no ambiguity)
3. judge_prompt: instructions for a second LLM to grade the agent's output. It MUST tell the judge to reply with the literal string "pass: <reason>" or "fail: <reason>" on the first line.

Topic / what I want to test: <DESCRIBE HERE>

Output exactly this YAML, nothing else:

description: ...
prompt: |
  ...
judge_prompt: |
  ...`;

interface Props {
  initial?: TaskBody;
  onSubmit: (body: TaskBody) => Promise<void>;
  onCancel: () => void;
}

export function BenchmarkTaskForm({ initial, onSubmit, onCancel }: Props) {
  const isEdit = initial != null;
  const [id, setId] = useState(initial?.id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [judgePrompt, setJudgePrompt] = useState(initial?.judge_prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHelper, setShowHelper] = useState(false);

  const copyHelper = async () => {
    try {
      await navigator.clipboard.writeText(SUGGESTION_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ id, description, prompt, judge_prompt: judgePrompt });
    } catch (err) {
      setError((err as Error).message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={submit}
        className="bg-bg border border-border rounded shadow-lg w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-sm font-semibold text-text">
          {isEdit ? `Edit task: ${initial?.id}` : "New task"}
        </h2>

        <label className="block">
          <span className="text-xs text-text-secondary">id</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={isEdit}
            placeholder="lowercase-slug"
            required
            className="mt-1 w-full bg-bg-input border border-border rounded px-2 py-1 text-xs font-mono disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-secondary">description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full bg-bg-input border border-border rounded px-2 py-1 text-xs"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-secondary">prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            rows={6}
            className="mt-1 w-full bg-bg-input border border-border rounded px-2 py-1 text-xs font-mono"
          />
        </label>

        <label className="block">
          <span className="text-xs text-text-secondary">judge_prompt</span>
          <textarea
            value={judgePrompt}
            onChange={(e) => setJudgePrompt(e.target.value)}
            required
            rows={4}
            className="mt-1 w-full bg-bg-input border border-border rounded px-2 py-1 text-xs font-mono"
          />
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        {!isEdit && (
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowHelper((s) => !s)}
                className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1"
              >
                {showHelper
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />}
                Need help writing this? Copy a prompt to paste in any chat
              </button>
              {showHelper && (
                <button
                  type="button"
                  onClick={copyHelper}
                  className="text-[10px] px-2 py-1 border border-border rounded hover:bg-bg-hover text-text-muted"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
            {showHelper && (
              <pre className="mt-2 bg-bg-input border border-border rounded p-2 text-[11px] font-mono whitespace-pre-wrap text-text-secondary max-h-48 overflow-y-auto">
                {SUGGESTION_PROMPT}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-border rounded hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1.5 text-xs bg-accent text-accent-text rounded hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Saving..." : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
