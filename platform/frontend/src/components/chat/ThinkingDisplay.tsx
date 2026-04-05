import type { FC } from "react";
import type { ReasoningMessagePartProps } from "@assistant-ui/react";

export const ThinkingDisplay: FC<ReasoningMessagePartProps> = ({
  text,
  status,
}) => {
  const isRunning = status?.type === "running";

  return (
    <div className="flex items-center gap-[7px] mb-3.5">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className={`flex-shrink-0 ${isRunning ? "text-accent animate-[spin_2s_linear_infinite]" : "text-text-muted opacity-50"}`}
      >
        <circle
          cx="7"
          cy="7"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="3 2.5"
        />
      </svg>
      <span
        className={`text-xs italic truncate ${
          isRunning ? "text-accent opacity-80" : "text-text-muted"
        }`}
        title={text}
      >
        {text}
      </span>
    </div>
  );
};
