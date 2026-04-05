import { create } from "zustand";
import { persist } from "zustand/middleware";
import { streamChat, type ChatEvent } from "../api/chat";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  startedAt: number;
  completedAt?: number;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  thinking: string;
  parts: ContentPart[];
  streaming: boolean;
  error?: string;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  abortController: AbortController | null;

  sendMessage: (prompt: string) => void;
  cancelStream: () => void;
  clearMessages: () => void;
  syncSession: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  abortController: null,

  sendMessage: (prompt: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      thinking: "",
      parts: [{ type: "text", text: prompt }],
      streaming: false,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      thinking: "",
      parts: [],
      streaming: true,
    };

    const controller = new AbortController();

    set({
      messages: [...get().messages, userMsg, assistantMsg],
      isStreaming: true,
      abortController: controller,
    });

    const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
      const state = get();
      set({
        messages: state.messages.map((m) =>
          m.id === assistantId ? updater(m) : m,
        ),
      });
    };

    streamChat(
      prompt,
      (event: ChatEvent) => {
        switch (event.type) {
          case "thinking":
            updateAssistant((m) => ({
              ...m,
              thinking: m.thinking + event.text,
            }));
            break;
          case "text":
            updateAssistant((m) => {
              const parts = [...m.parts];
              const last = parts[parts.length - 1];
              // Append to the last text part if it exists, otherwise create a new one
              if (last && last.type === "text") {
                parts[parts.length - 1] = { type: "text", text: last.text + event.text };
              } else {
                parts.push({ type: "text", text: event.text });
              }
              return { ...m, parts };
            });
            break;
          case "tool_use":
            updateAssistant((m) => ({
              ...m,
              parts: [
                ...m.parts,
                {
                  type: "tool_call",
                  toolCall: {
                    id: event.tool_id,
                    name: event.tool,
                    input: event.input,
                    startedAt: Date.now(),
                  },
                },
              ],
            }));
            break;
          case "tool_result":
            updateAssistant((m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.type === "tool_call" && p.toolCall.id === event.tool_id
                  ? {
                      ...p,
                      toolCall: { ...p.toolCall, output: event.output, completedAt: Date.now() },
                    }
                  : p,
              ),
            }));
            break;
          case "tool_input":
            break;
          case "session":
            set({ sessionId: event.session_id });
            break;
          case "error":
            updateAssistant((m) => ({
              ...m,
              error: event.message,
            }));
            break;
          case "done":
            updateAssistant((m) => ({ ...m, streaming: false }));
            set({ isStreaming: false, abortController: null });
            break;
        }
      },
      controller.signal,
    ).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        updateAssistant((m) => ({ ...m, streaming: false }));
      } else {
        const errorText =
          err instanceof Error ? err.message : "Unknown error";
        updateAssistant((m) => ({
          ...m,
          error: errorText,
          streaming: false,
        }));
      }
      set({ isStreaming: false, abortController: null });
    });
  },

  cancelStream: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  clearMessages: () => {
    set({ messages: [], sessionId: null, isStreaming: false, abortController: null });
    fetch("/api/chat/reset", { method: "POST" });
  },

  syncSession: async () => {
    try {
      const res = await fetch("/api/chat/session");
      const data = await res.json();
      const backendSessionId = data.session_id as string | null;
      const { sessionId, messages } = get();

      if (!backendSessionId) {
        if (messages.length > 0) {
          set({ messages: [], sessionId: null });
        }
      } else if (backendSessionId !== sessionId) {
        set({ messages: [], sessionId: null });
        fetch("/api/chat/reset", { method: "POST" });
      }
    } catch {
      // Can't reach backend — keep persisted state
    }
  },
    }),
    {
      name: "context-chat-store",
      partialize: (state) => ({
        messages: state.messages.map((m) => ({ ...m, streaming: false })),
        sessionId: state.sessionId,
      }),
    },
  ),
);
