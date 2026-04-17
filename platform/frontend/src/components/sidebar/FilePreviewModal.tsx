import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Modal } from "../Modal";

interface Props {
  title: React.ReactNode;
  content: string | null;
  isLoading?: boolean;
  error?: boolean;
  onClose: () => void;
}

const REMARK_PLUGINS = [remarkGfm];

function isMarkdownTitle(title: React.ReactNode): boolean {
  if (typeof title === "string") return title.endsWith(".md");
  // ReactElement — extract text from children
  if (title && typeof title === "object" && "props" in title) {
    const children = (title as React.ReactElement).props.children;
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
  onClose,
}: Props) {
  const renderAsMarkdown = isMarkdownTitle(title);

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
      </div>
    </Modal>
  );
}
