import type { FC } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkspace } from "../../api/workspace";
import { humanizeToolCall } from "../../utils/humanizeToolCall";

export const ToolCallDisplay: FC<ToolCallMessagePartProps> = ({
  toolName,
  args,
  status,
}) => {
  const { data: workspace } = useQuery({
    queryKey: ["workspace"],
    queryFn: fetchWorkspace,
  });

  const modules = workspace?.modules ?? [];
  const argsObj = (args ?? {}) as Record<string, unknown>;
  const { verb, moduleName, fallbackLabel } = humanizeToolCall(
    toolName,
    argsObj,
    modules,
  );

  const isRunning = status?.type === "running";

  // Timing data injected by convertMessage in useContextChatRuntime
  const startedAt = argsObj.__startedAt as number | undefined;
  const completedAt = argsObj.__completedAt as number | undefined;
  const duration =
    startedAt && completedAt
      ? `${((completedAt - startedAt) / 1000).toFixed(1)}s`
      : null;

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-md ${
        isRunning
          ? "bg-[rgba(196,163,90,0.04)] border-l-2 border-l-accent"
          : "bg-[rgba(255,255,255,0.02)] border-l-2 border-l-[#333]"
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
            stroke="#c4a35a"
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
      <span className="text-xs text-text-secondary">
        {verb}{" "}
        {moduleName ? (
          <>
            <span className="text-accent font-medium">{moduleName}</span>
            {" module"}
          </>
        ) : fallbackLabel ? (
          <span className="text-text-secondary">{fallbackLabel}</span>
        ) : null}
        {isRunning && "..."}
      </span>

      {/* Duration */}
      {duration && (
        <span className="text-[10px] text-[#444] ml-auto flex-shrink-0">
          {duration}
        </span>
      )}
    </div>
  );
};
