import { Modal } from "../Modal";

interface Props {
  title: React.ReactNode;
  content: string | null;
  isLoading?: boolean;
  error?: boolean;
  onClose: () => void;
}

export function FilePreviewModal({
  title,
  content,
  isLoading,
  error,
  onClose,
}: Props) {
  return (
    <Modal onClose={onClose} backdropClass="bg-black/70 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-bg-raised shadow-2xl"
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
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text">
              {content}
            </pre>
          )}
        </div>
      </div>
    </Modal>
  );
}
