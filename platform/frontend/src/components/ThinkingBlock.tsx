interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ text, isStreaming }: ThinkingBlockProps) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary flex items-center gap-1">
        <svg
          className="w-3 h-3 transition-transform group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l5 4-5 4V2z" />
        </svg>
        Thinking{isStreaming ? "..." : ""}
      </summary>
      <div className="mt-1 pl-4 text-xs text-text-muted italic whitespace-pre-wrap border-l border-border-light">
        {text}
      </div>
    </details>
  );
}
