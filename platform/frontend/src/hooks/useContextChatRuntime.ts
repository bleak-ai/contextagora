import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import { useChatStore, type ChatMessage } from "./useChatStore";

function convertMessage(msg: ChatMessage): ThreadMessageLike {
  const content: Array<
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "reasoning"; readonly text: string }
    | {
        readonly type: "tool-call";
        readonly toolCallId: string;
        readonly toolName: string;
        readonly args: ReadonlyJSONObject;
        readonly result?: string;
      }
  > = [];

  if (msg.thinking) {
    content.push({ type: "reasoning", text: msg.thinking });
  }

  // Tool calls come before the final text (they happen first)
  for (const tc of msg.toolCalls) {
    content.push({
      type: "tool-call",
      toolCallId: tc.id,
      toolName: tc.name,
      args: {
        ...(tc.input ?? {}),
        __startedAt: tc.startedAt,
        __completedAt: tc.completedAt,
      } as ReadonlyJSONObject,
      result: tc.output,
    });
  }

  if (msg.content) {
    content.push({ type: "text", text: msg.content });
  }

  if (msg.error) {
    content.push({ type: "text", text: `\n\n__ERROR__:${msg.error}` });
  }

  return {
    role: msg.role,
    content,
    id: msg.id,
    ...(msg.role === "assistant"
      ? {
          status: msg.streaming
            ? { type: "running" as const }
            : msg.error
              ? { type: "incomplete" as const, reason: "error" as const }
              : { type: "complete" as const, reason: "stop" as const },
        }
      : {}),
  };
}

export function useContextChatRuntime(opts: { isDisabled: boolean }) {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: isStreaming,
    isDisabled: opts.isDisabled,
    convertMessage,
    onNew: async (message) => {
      const textParts = message.content.filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const text = textParts.map((p) => p.text).join("");
      if (text.trim()) {
        sendMessage(text);
      }
    },
    onCancel: async () => {
      cancelStream();
    },
  });

  return { runtime, clearMessages, hasMessages: messages.length > 0 };
}
