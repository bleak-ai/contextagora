import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCall } from "./ToolCall";

export interface ContentBlock {
  type: "thinking" | "text" | "tool_use" | "tool_result" | "error";
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
  message?: string;
  isStreaming?: boolean;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="ml-auto max-w-[70%] bg-accent-dim border border-accent/20 rounded-lg px-4 py-2.5 text-sm text-text">
        {content as string}
      </div>
    );
  }

  const blocks = content as ContentBlock[];

  return (
    <div className="mr-auto max-w-[70%] bg-bg-raised border border-border rounded-lg px-4 py-2.5 text-sm space-y-2">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "thinking":
            return (
              <ThinkingBlock
                key={i}
                text={block.text || ""}
                isStreaming={block.isStreaming}
              />
            );
          case "tool_use":
            return (
              <ToolCall
                key={i}
                tool={block.tool || ""}
                input={block.input || {}}
                output={block.output}
                isStreaming={block.isStreaming}
              />
            );
          case "text":
            return (
              <div key={i} className="whitespace-pre-wrap">
                {block.text}
              </div>
            );
          case "error":
            return (
              <div key={i} className="text-danger text-xs">
                {block.message}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
