interface ToolCallProps {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  isStreaming?: boolean;
}

export function ToolCall({ tool, input, output, isStreaming }: ToolCallProps) {
  const inputSummary = Object.entries(input)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-text-secondary hover:text-text flex items-center gap-1.5">
        <svg
          className="w-3 h-3 transition-transform group-open:rotate-90"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l5 4-5 4V2z" />
        </svg>
        <span className="font-mono text-accent">{tool}</span>
        <span className="text-text-muted">{inputSummary}</span>
        {isStreaming && <span className="text-text-muted animate-pulse">...</span>}
      </summary>
      <div className="mt-1 pl-4 space-y-1 border-l border-border-light">
        <div className="text-xs">
          <span className="text-text-muted">Input:</span>
          <pre className="mt-0.5 text-text-secondary bg-bg p-2 rounded overflow-x-auto text-[11px]">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
        {output !== undefined && (
          <div className="text-xs">
            <span className="text-text-muted">Output:</span>
            <pre className="mt-0.5 text-text-secondary bg-bg p-2 rounded overflow-x-auto text-[11px] max-h-48 overflow-y-auto">
              {output}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}
