import type { FC } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

/** Extract h2 headings from markdown content to show section outline. */
function extractSections(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim());
}

export const ModulePreviewCard: FC<ToolCallMessagePartProps> = ({
  toolName,
  args,
  status,
}) => {
  const argsObj = (args ?? {}) as Record<string, unknown>;
  const name = (argsObj.name as string) ?? "";
  const summary = (argsObj.summary as string) ?? "";
  const content = (argsObj.content as string) ?? "";
  const secrets = (argsObj.secrets as string[]) ?? [];
  const sections = extractSections(content);

  const isRunning = status?.type === "running";
  const isUpdate = toolName.includes("update_module");
  const verb = isUpdate ? "Updated" : "Created";

  return (
    <div className="rounded-lg border border-accent/20 bg-accent-dim overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-accent/10">
        {isRunning ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="flex-shrink-0 text-accent animate-[spin_1.5s_linear_infinite]"
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="flex-shrink-0"
          >
            <circle cx="7" cy="7" r="5.5" stroke="#5cb87a" strokeWidth="1.2" />
            <path
              d="M4.5 7l2 2 3.5-3.5"
              stroke="#5cb87a"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span className="text-xs text-text-secondary">
          {isRunning ? (isUpdate ? "Updating" : "Creating") : verb} module{" "}
          <span className="text-accent font-semibold">{name}</span>
        </span>
      </div>

      {/* Body */}
      <div className="px-3.5 py-2.5 space-y-2">
        {summary && (
          <p className="text-xs text-text-secondary">{summary}</p>
        )}

        {sections.length > 0 && (
          <div>
            <span className="text-[10px] text-text-muted tracking-wider">
              SECTIONS
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {sections.map((s) => (
                <span
                  key={s}
                  className="text-[10px] bg-bg text-text-secondary px-1.5 py-0.5 rounded border border-border-light"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {secrets.length > 0 && (
          <div>
            <span className="text-[10px] text-text-muted tracking-wider">
              SECRETS
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {secrets.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-mono bg-bg text-text-secondary px-1.5 py-0.5 rounded border border-border-light"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
