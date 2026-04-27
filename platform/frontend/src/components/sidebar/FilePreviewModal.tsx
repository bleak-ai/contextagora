import { useState } from "react";
import { X, Check } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Modal } from "../Modal";
import { runModuleFile, type RunResult } from "../../api/modules";
import { MarkdownEditor } from "./MarkdownEditor";

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
  imageSrc?: string;
  downloadHref?: string;
  onClose: () => void;
}

const REMARK_PLUGINS = [remarkGfm];

function titleEndsWith(title: React.ReactNode, suffix: string): boolean {
  if (typeof title === "string") return title.endsWith(suffix);
  if (title && typeof title === "object" && "props" in title) {
    const children = (title as React.ReactElement<{ children?: React.ReactNode }>).props.children;
    if (Array.isArray(children)) {
      const last = children[children.length - 1];
      if (typeof last === "string") return last.endsWith(suffix);
    }
    if (typeof children === "string") return children.endsWith(suffix);
  }
  return false;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line, idx, arr) => line.length > 0 || idx < arr.length - 1)
    .map((line) => line.split(","));
}

export function FilePreviewModal({
  title,
  content,
  isLoading,
  error,
  runnable,
  imageSrc,
  downloadHref,
  onClose,
}: Props) {
  const renderAsMarkdown = titleEndsWith(title, ".md");
  const renderAsCsv = titleEndsWith(title, ".csv");
  const canRun = !!runnable && runnable.path.endsWith(".py");
  const isEditableMarkdown = renderAsMarkdown && !!runnable;
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  return (
    <Modal onClose={onClose} backdropClass="bg-black/90 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <span className="font-mono text-xs text-text truncate">{title}</span>
          <div className="flex items-center gap-3">
            {isEditableMarkdown && <div ref={setToolbarSlot} />}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="overflow-auto bg-black/40 px-4 py-3">
          {imageSrc ? (
            <div className="flex justify-center">
              <img
                src={imageSrc}
                alt=""
                className="max-h-[75vh] max-w-full rounded border border-border bg-black/30"
              />
            </div>
          ) : (
            <>
              {isLoading && <p className="text-xs text-text-muted">loading…</p>}
              {error && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-red-400">failed to load file</p>
                  {downloadHref && (
                    <a
                      href={downloadHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      Open in new tab
                    </a>
                  )}
                </div>
              )}
              {content !== null && !isLoading && !error && (
                renderAsMarkdown ? (
                  runnable ? (
                    <div className="text-sm text-text">
                      <MarkdownEditor
                        moduleName={runnable.moduleName}
                        path={runnable.path}
                        initialContent={content}
                        toolbarTarget={toolbarSlot}
                      />
                    </div>
                  ) : (
                    <div className="aui-md text-sm text-text">
                      <Markdown remarkPlugins={REMARK_PLUGINS}>{content}</Markdown>
                    </div>
                  )
                ) : renderAsCsv ? (
                  <CsvTable rows={parseCsv(content)} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text">
                    {content}
                  </pre>
                )
              )}
            </>
          )}
        </div>
        {canRun && runnable && (
          <RunPanel moduleName={runnable.moduleName} path={runnable.path} />
        )}
      </div>
    </Modal>
  );
}

function CsvTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-text-muted">empty file</p>;
  }
  const [header, ...body] = rows;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse font-mono text-[11px] text-text">
        <thead className="sticky top-0 bg-bg-raised">
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border border-border px-2 py-1 text-left font-semibold text-text-secondary whitespace-nowrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="hover:bg-bg-hover">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="border border-border px-2 py-1 align-top whitespace-pre-wrap break-words"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
            {ok
              ? <Check className="w-3.5 h-3.5 text-accent" />
              : <X className="w-3.5 h-3.5 text-red-400" />}
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
