import { useState } from "react";
import {
  X,
  Check,
  AlertCircle,
  Play,
  Download,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCode,
  File as FileIconBase,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
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

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

const CODE_EXTS = new Set([
  "py", "ts", "tsx", "js", "jsx", "json", "yaml", "yml", "sh", "toml", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "css", "html", "xml", "sql",
]);

function flattenTitle(title: React.ReactNode): string {
  if (typeof title === "string") return title;
  if (typeof title === "number") return String(title);
  if (Array.isArray(title)) return title.map(flattenTitle).join("");
  if (title && typeof title === "object" && "props" in title) {
    const children = (title as React.ReactElement<{ children?: React.ReactNode }>).props.children;
    return flattenTitle(children ?? "");
  }
  return "";
}

function getExtension(title: React.ReactNode): string {
  const s = flattenTitle(title);
  const last = s.split("/").pop() ?? s;
  if (!last.includes(".")) return "";
  return last.split(".").pop()?.toLowerCase() ?? "";
}

function FileTypeIcon({ ext, isImage }: { ext: string; isImage?: boolean }) {
  const cls = "w-3.5 h-3.5 text-accent shrink-0";
  if (isImage) return <FileImage className={cls} />;
  if (ext === "md") return <FileText className={cls} />;
  if (ext === "csv") return <FileSpreadsheet className={cls} />;
  if (CODE_EXTS.has(ext)) return <FileCode className={cls} />;
  return <FileIconBase className={cls} />;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line, idx, arr) => line.length > 0 || idx < arr.length - 1)
    .map((line) => line.split(","));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
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
  const ext = getExtension(title);
  const renderAsMarkdown = ext === "md";
  const renderAsCsv = ext === "csv";
  const canRun = !!runnable && runnable.path.endsWith(".py");
  const isEditableMarkdown = renderAsMarkdown && !!runnable;
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  const showMeta = !isLoading && !error && content !== null && !imageSrc;
  const lineCount = showMeta ? content!.split("\n").length : 0;
  const byteSize = showMeta ? new Blob([content!]).size : 0;

  return (
    <Modal onClose={onClose} backdropClass="bg-black/85 backdrop-blur-sm p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-enter flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border-light bg-bg-raised shadow-2xl ring-1 ring-black/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border-light bg-bg px-4 py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileTypeIcon ext={ext} isImage={!!imageSrc} />
            <span className="font-mono text-xs font-medium text-text truncate">{title}</span>
            {ext && (
              <span className="hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider text-accent bg-accent-dim border border-accent/40">
                {ext}
              </span>
            )}
            {showMeta && (
              <span className="hidden md:inline-flex shrink-0 items-center gap-1.5 text-[10px] font-mono text-text-secondary ml-1 tabular-nums">
                <span>{lineCount.toLocaleString()} lines</span>
                <span className="text-border-light">·</span>
                <span>{formatBytes(byteSize)}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditableMarkdown && <div ref={setToolbarSlot} />}
            {downloadHref && !isEditableMarkdown && !error && (
              <a
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in new tab"
                title="Open in new tab"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border-light bg-bg-raised text-[10px] font-mono font-medium text-text-secondary">
              esc
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto bg-bg-raised">
          {imageSrc ? (
            <div className="flex justify-center px-4 py-6">
              <img
                src={imageSrc}
                alt=""
                className="max-h-[75vh] max-w-full rounded-md border border-border bg-[repeating-conic-gradient(#1a1816_0_25%,#222220_0_50%)] bg-[length:16px_16px]"
              />
            </div>
          ) : isLoading ? (
            <SkeletonPreview />
          ) : error ? (
            <ErrorState downloadHref={downloadHref} />
          ) : content === null ? null : content.length === 0 ? (
            <EmptyFile />
          ) : (
            <div className="px-4 py-3">
              {renderAsMarkdown ? (
                runnable ? (
                  <div className="text-sm text-text mx-auto max-w-3xl py-2">
                    <MarkdownEditor
                      moduleName={runnable.moduleName}
                      path={runnable.path}
                      initialContent={content}
                      toolbarTarget={toolbarSlot}
                    />
                  </div>
                ) : (
                  <div className="aui-md text-sm text-text mx-auto max-w-3xl py-2">
                    <Markdown remarkPlugins={REMARK_PLUGINS}>{content}</Markdown>
                  </div>
                )
              ) : renderAsCsv ? (
                <CsvTable rows={parseCsv(content)} />
              ) : (
                <CodeView content={content} />
              )}
            </div>
          )}
        </div>

        {canRun && runnable && (
          <RunPanel moduleName={runnable.moduleName} path={runnable.path} />
        )}
      </div>
    </Modal>
  );
}

function SkeletonPreview() {
  const widths = ["w-3/4", "w-5/6", "w-2/3", "w-4/5", "w-1/2", "w-11/12", "w-3/5", "w-3/4"];
  return (
    <div className="px-4 py-5 space-y-2.5 animate-pulse" aria-hidden="true">
      {widths.map((w, i) => (
        <div key={i} className={`h-3 rounded bg-border ${w}`} />
      ))}
    </div>
  );
}

function EmptyFile() {
  return (
    <div className="px-4 py-12 flex flex-col items-center gap-1.5 text-center">
      <p className="text-sm font-medium text-text">This file is empty.</p>
      <p className="text-xs text-text-secondary">No content to preview yet.</p>
    </div>
  );
}

function ErrorState({ downloadHref }: { downloadHref?: string }) {
  return (
    <div className="px-4 py-10 flex flex-col items-center gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/50 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 text-red-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm text-text font-semibold">Could not load file</p>
        <p className="text-xs text-text-secondary">It may be too large or unavailable in this view.</p>
      </div>
      {downloadHref && (
        <a
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded border border-border-light bg-bg text-text hover:bg-bg-hover hover:border-accent/50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Open in new tab
        </a>
      )}
    </div>
  );
}

function CodeView({ content }: { content: string }) {
  const lines = content.split("\n");
  const gutterWidth = `${String(lines.length).length + 1}ch`;
  return (
    <pre
      className="grid font-mono text-[11px] leading-relaxed"
      style={{ gridTemplateColumns: `${gutterWidth} 1fr` }}
    >
      <div
        aria-hidden="true"
        className="select-none text-right text-text-secondary pr-3 border-r border-border-light"
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <code className="pl-3 text-text whitespace-pre-wrap break-words">
        {content}
      </code>
    </pre>
  );
}

function CsvTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return <EmptyFile />;
  }
  const [header, ...body] = rows;
  return (
    <div className="-mx-4">
      <div className="overflow-auto">
        <table className="w-full border-collapse font-mono text-[11px] text-text">
          <thead className="sticky top-0 z-10 bg-bg">
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="border-b border-border-light px-3 py-2 text-left font-semibold uppercase tracking-wider text-[10px] text-text whitespace-nowrap"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr
                key={r}
                className={`transition-colors hover:bg-bg-hover ${r % 2 === 1 ? "bg-bg" : "bg-bg-raised"}`}
              >
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="border-b border-border px-3 py-1.5 align-top whitespace-pre-wrap break-words"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10px] font-mono text-text-secondary border-t border-border-light tabular-nums bg-bg">
        {body.length.toLocaleString()} {body.length === 1 ? "row" : "rows"}
        <span className="text-border-light mx-1.5">·</span>
        {header.length} {header.length === 1 ? "column" : "columns"}
      </div>
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
      setDetailsOpen(false);
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
  const firstLine = result
    ? (ok ? result.stdout : result.stderr || result.stdout).split("\n")[0] ||
      (ok ? "OK" : "Failed")
    : "";

  return (
    <div className="flex flex-col gap-2 border-t border-border-light bg-bg px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded border border-accent bg-accent text-accent-text transition-colors hover:bg-accent-hover hover:border-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/60"
        >
          {running ? (
            <>
              <span
                className="inline-block w-3 h-3 rounded-full border-2 border-accent-text/40 border-t-accent-text"
                style={{ animation: "spin 0.7s linear infinite" }}
                aria-hidden="true"
              />
              <span>Running…</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>Run</span>
            </>
          )}
        </button>
        <code
          className="flex-1 min-w-0 truncate text-[10px] text-text-secondary font-mono px-2 py-1 rounded bg-bg-raised border border-border-light"
          title={`varlock run -- uv run python ${path}`}
        >
          varlock run -- uv run python {path}
        </code>
      </div>

      {result && (
        <div
          className={`text-xs rounded-md border px-2.5 py-2 transition-colors ${
            ok
              ? "border-success/70 bg-success/[0.15]"
              : "border-red-500/70 bg-red-500/[0.15]"
          }`}
        >
          <div className="flex items-center gap-2">
            {ok ? (
              <span
                className="inline-flex w-4 h-4 shrink-0 rounded-full bg-success/40 items-center justify-center"
                aria-label="Succeeded"
              >
                <Check className="w-2.5 h-2.5 text-success" />
              </span>
            ) : (
              <span
                className="inline-flex w-4 h-4 shrink-0 rounded-full bg-red-500/40 items-center justify-center"
                aria-label="Failed"
              >
                <X className="w-2.5 h-2.5 text-red-400" />
              </span>
            )}
            <span className="flex-1 truncate text-text font-medium" title={firstLine}>
              {firstLine}
            </span>
            <span className="shrink-0 text-[10px] font-mono font-semibold text-text-secondary tabular-nums">
              {result.duration_ms}ms
            </span>
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors focus:outline-none focus:ring-1 focus:ring-accent/60"
              aria-expanded={detailsOpen}
            >
              {detailsOpen ? (
                <>Hide <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Details <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          </div>
          {detailsOpen && (
            <div className="mt-2 flex flex-col gap-2 max-h-64 overflow-auto">
              <div className="text-[11px] font-mono">
                <span className="text-text-secondary">exit_code:</span>{" "}
                <span className={`font-semibold ${ok ? "text-success" : "text-red-400"}`}>
                  {result.exit_code}
                </span>
              </div>
              {result.stdout && (
                <OutputBlock label="stdout" content={result.stdout} />
              )}
              {result.stderr && (
                <OutputBlock label="stderr" content={result.stderr} variant="error" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OutputBlock({
  label,
  content,
  variant,
}: {
  label: string;
  content: string;
  variant?: "error";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable, swallow
    }
  };
  const isError = variant === "error";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            isError ? "text-red-400" : "text-text"
          }`}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary hover:text-text px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors focus:outline-none focus:ring-1 focus:ring-accent/60"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              copy
            </>
          )}
        </button>
      </div>
      <pre
        className={`text-[11px] font-mono whitespace-pre-wrap break-words text-text bg-black/60 rounded px-2 py-1.5 border ${
          isError ? "border-red-500/60" : "border-border-light"
        }`}
      >
        {content}
      </pre>
    </div>
  );
}
