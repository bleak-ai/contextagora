import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Modal } from "../Modal";
import { runModuleFile, type RunResult } from "../../api/modules";

interface Runnable {
  moduleName: string;
  path: string;
}

interface Props {
  title: React.ReactNode;
  content: string | null;
  isLoading?: boolean;
  error?: boolean;
  runnable?: Runnable;
  onClose: () => void;
}

const REMARK_PLUGINS = [remarkGfm];

function isMarkdownTitle(title: React.ReactNode): boolean {
  if (typeof title === "string") return title.endsWith(".md");
  if (title && typeof title === "object" && "props" in title) {
    const children = (title as React.ReactElement<{ children?: React.ReactNode }>).props.children;
    if (Array.isArray(children)) {
      const last = children[children.length - 1];
      if (typeof last === "string") return last.endsWith(".md");
    }
    if (typeof children === "string") return children.endsWith(".md");
  }
  return false;
}

export function FilePreviewModal({
  title,
  content,
  isLoading,
  error,
  runnable,
  onClose,
}: Props) {
  const renderAsMarkdown = isMarkdownTitle(title);
  const canRun = !!runnable && runnable.path.endsWith(".py");

  return (
    <Modal onClose={onClose} backdropClass="bg-black/90 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs text-text">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto bg-black/40 px-4 py-3">
          {isLoading && <p className="text-xs text-text-muted">loading…</p>}
          {error && <p className="text-xs text-red-400">failed to load file</p>}
          {content !== null && !isLoading && !error && (
            renderAsMarkdown ? (
              <div className="aui-md text-sm text-text">
                <Markdown remarkPlugins={REMARK_PLUGINS}>{content}</Markdown>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text">
                {content}
              </pre>
            )
          )}
        </div>
        {canRun && runnable && (
          <RunPanel moduleName={runnable.moduleName} path={runnable.path} />
        )}
      </div>
    </Modal>
  );
}

function RunPanel({ moduleName, path }: { moduleName: string; path: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runModuleFile(moduleName, path);
      setResult(r);
    } catch (e) {
      setResult({
        exit_code: -2,
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
        duration_ms: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  const ok = result?.exit_code === 0;
  const firstLine =
    result
      ? (ok ? result.stdout : result.stderr || result.stdout).split("\n")[0] ||
        (ok ? "OK" : "Failed")
      : "";

  return (
    <div className="border-t border-border px-4 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="text-xs font-medium px-3 py-1 rounded border border-border hover:bg-bg-hover disabled:opacity-60"
        >
          {running ? "Running…" : "Run"}
        </button>
        <span className="text-[10px] text-text-muted font-mono">
          varlock run -- uv run python {path}
        </span>
      </div>
      {result && (
        <div
          className={`text-xs rounded border px-2.5 py-1.5 ${
            ok
              ? "border-accent/40 bg-accent/[0.08] text-text"
              : "border-red-500/50 bg-red-500/[0.08] text-text"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={ok ? "text-accent" : "text-red-400"}>
              {ok ? "✓" : "✗"}
            </span>
            <span className="flex-1 truncate">{firstLine}</span>
            <span className="text-[10px] text-text-muted">
              {result.duration_ms}ms
            </span>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="text-text-muted hover:text-text text-[10px] uppercase tracking-wide"
            >
              {detailsOpen ? "Hide" : "Details"}
            </button>
          </div>
          {detailsOpen && (
            <div className="mt-2 flex flex-col gap-2 max-h-64 overflow-auto">
              <div className="text-[11px] font-mono text-text">
                <span className="text-text-muted">exit_code:</span>{" "}
                <span className={ok ? "text-accent" : "text-red-400"}>
                  {result.exit_code}
                </span>
              </div>
              {result.stdout && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary mb-1">
                    stdout
                  </div>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-text bg-black/30 rounded px-2 py-1.5 border border-border">
                    {result.stdout}
                  </pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-red-400 mb-1">
                    stderr
                  </div>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-text bg-black/30 rounded px-2 py-1.5 border border-red-500/40">
                    {result.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
