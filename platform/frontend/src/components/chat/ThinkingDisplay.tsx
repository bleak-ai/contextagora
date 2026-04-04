import { useState, type FC } from "react";
import type { ReasoningMessagePartProps } from "@assistant-ui/react";

export const ThinkingDisplay: FC<ReasoningMessagePartProps> = ({
  text,
  status,
}) => {
  const [open, setOpen] = useState(false);
  const isRunning = status?.type === "running";

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 select-none">
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l5 4-5 4V2z" />
        </svg>
        Thinking{isRunning ? "..." : ""}
      </summary>
      <div className="mt-1 pl-4 text-xs text-text-muted italic whitespace-pre-wrap border-l border-border-light">
        {text}
      </div>
    </details>
  );
};
