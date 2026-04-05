import { useState, type FC } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkspace } from "../../api/workspace";
import { humanizeToolCall } from "../../utils/humanizeToolCall";

export const ToolCallDisplay: FC<ToolCallMessagePartProps> = ({
  toolName,
  args,
  result,
  status,
}) => {
  const [open, setOpen] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const modules = workspace?.modules ?? [];
  const argsObj = (args ?? {}) as Record<string, unknown>;
  const { verb, moduleName, fileName, fallbackLabel } = humanizeToolCall(
    toolName,
    argsObj,
    modules,
  );

  const isRunning = status?.type === "running";

  // Timing data injected by convertMessage
  const startedAt = argsObj.__startedAt as number | undefined;
  const completedAt = argsObj.__completedAt as number | undefined;
  const duration =
    startedAt && completedAt
      ? `${((completedAt - startedAt) / 1000).toFixed(1)}s`
      : null;

  // Clean args for display (remove internal fields)
  const displayArgs = Object.fromEntries(
    Object.entries(argsObj).filter(([k]) => !k.startsWith("__")),
  );

  return (
    <div>
      {/* Clickable summary row */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 py-1.5 px-2.5 rounded-md transition-colors ${
          isRunning
            ? "bg-[rgba(168,176,224,0.04)] border-l-2 border-l-accent"
            : "bg-[rgba(255,255,255,0.02)] border-l-2 border-l-[#333] hover:bg-[rgba(255,255,255,0.04)]"
        }`}
      >
        {/* Status icon */}
        {isRunning ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className="flex-shrink-0 animate-[spin_1.5s_linear_infinite]"
          >
            <circle
              cx="6.5"
              cy="6.5"
              r="5"
              stroke="#a8b0e0"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className="flex-shrink-0"
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="#5cb87a" strokeWidth="1.2" />
            <path
              d="M4.5 6.5l1.5 1.5 3-3"
              stroke="#5cb87a"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Description */}
        <span className="text-xs text-text-secondary text-left">
          {verb}{" "}
          {moduleName ? (
            <>
              <span className="text-accent font-medium">{moduleName}</span>
              {" module"}
              {fileName && (
                <span className="text-text-muted ml-1">— {fileName}</span>
              )}
            </>
          ) : fallbackLabel ? (
            <span className="text-text-secondary">{fallbackLabel}</span>
          ) : null}
          {isRunning && "..."}
        </span>

        {/* Duration + chevron */}
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {duration && (
            <span className="text-[10px] text-[#444]">{duration}</span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className={`text-text-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M3 1.5l4 3.5-4 3.5V1.5z" />
          </svg>
        </span>
      </button>

      {/* Expandable details */}
      {open && (
        <div className="ml-[21px] pl-2.5 border-l border-border-light mt-1 mb-1 space-y-1.5">
          <div className="text-xs">
            <span className="text-text-muted">Tool:</span>{" "}
            <span className="font-mono text-text-secondary">{toolName}</span>
          </div>
          {Object.keys(displayArgs).length > 0 && (
            <div className="text-xs">
              <span className="text-text-muted">Input:</span>
              <pre className="mt-0.5 text-text-secondary bg-bg p-2 rounded overflow-x-auto text-[11px] max-h-32 overflow-y-auto">
                {JSON.stringify(displayArgs, null, 2)}
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
      )}
    </div>
  );
};
