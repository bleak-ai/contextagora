import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import { fetchSessionMessages, getSessionMode } from "../api/sessions";
import { useChatStore, NEW_CHAT_KEY, type ChatMessage } from "./useChatStore";

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

  const parts = msg.parts ?? [];
  for (const part of parts) {
    if (part.type === "text") {
      content.push({ type: "text", text: part.text });
    } else if (part.type === "tool_call") {
      const tc = part.toolCall;
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

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useContextChatRuntime(opts: {
  isDisabled: boolean;
  sessionId: string | null;
}) {
  // IMPORTANT: Use direct selector on messagesBySession, NOT a getMessages() method.
  // A function call inside a selector won't trigger re-renders.
  // Use a stable empty array reference to avoid infinite re-render loops.
  const messagesKey = opts.sessionId ?? NEW_CHAT_KEY;
  const messages = useChatStore(
    (s) => s.messagesBySession[messagesKey] ?? EMPTY_MESSAGES,
  );
  const streamingSessionId = useChatStore((s) => s.streamingSessionId);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const hydrateSession = useChatStore((s) => s.hydrateSession);

  const isRunning =
    streamingSessionId !== null && streamingSessionId === messagesKey;

  // Pull the full transcript from the server whenever a persisted session is
  // opened. This is how a second browser/computer sees history that was
  // created elsewhere — the JSONL on disk is the source of truth.
  const shouldHydrate =
    opts.sessionId !== null && streamingSessionId !== opts.sessionId;
  const { data: hydrated } = useQuery({
    queryKey: ["session-messages", opts.sessionId],
    queryFn: () => fetchSessionMessages(opts.sessionId!),
    enabled: shouldHydrate,
    staleTime: 0,
  });

  useEffect(() => {
    if (!opts.sessionId || !hydrated) return;
    hydrateSession(opts.sessionId, hydrated.messages);
    // Fetch this session's persisted mode and reflect it in the chat store.
    // A failure here must NOT block message loading — the user can still
    // use the session at the default mode.
    const sid = opts.sessionId;
    void (async () => {
      try {
        const mode = await getSessionMode(sid);
        useChatStore.setState({ mode });
      } catch (e) {
        console.error("failed to load session mode", e);
      }
    })();
  }, [opts.sessionId, hydrated, hydrateSession]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    isDisabled: opts.isDisabled,
    convertMessage,
    onNew: async (message) => {
      const textParts = message.content.filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const text = textParts.map((p) => p.text).join("");
      if (text.trim()) {
        sendMessage(opts.sessionId, text);
      }
    },
    onCancel: async () => {
      cancelStream();
    },
  });

  return {
    runtime,
    clearMessages: () => clearMessages(messagesKey),
    hasMessages: messages.length > 0,
  };
}
