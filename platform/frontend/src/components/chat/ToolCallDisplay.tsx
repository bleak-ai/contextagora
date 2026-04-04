import { useState, type FC } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

export const ToolCallDisplay: FC<ToolCallMessagePartProps> = ({
  toolName,
  args,
  result,
  status,
}) => {
  const [open, setOpen] = useState(false);
  const isRunning = status?.type === "running";

  const inputSummary = args
    ? Object.entries(args as Record<string, unknown>)
        .map(([k, v]) =>
          `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
        )
        .join(", ")
    : "";

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-text-secondary hover:text-text flex items-center gap-1.5 select-none">
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l5 4-5 4V2z" />
        </svg>
        <span className="font-mono text-accent">{toolName}</span>
        <span className="text-text-muted truncate">
          {inputSummary}
        </span>
        {isRunning && (
          <span className="text-text-muted animate-pulse">...</span>
        )}
      </summary>
      <div className="mt-1 pl-4 space-y-1 border-l border-border-light">
        {args && (
          <div className="text-xs">
            <span className="text-text-muted">Input:</span>
            <pre className="mt-0.5 text-text-secondary bg-bg p-2 rounded overflow-x-auto text-[11px]">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}
        {result !== undefined && (
          <div className="text-xs">
            <span className="text-text-muted">Output:</span>
            <pre className="mt-0.5 text-text-secondary bg-bg p-2 rounded overflow-x-auto text-[11px] max-h-48 overflow-y-auto">
              {typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
};
