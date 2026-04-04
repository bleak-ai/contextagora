import { create } from "zustand";
import { persist } from "zustand/middleware";
import { streamChat, type ChatEvent } from "../api/chat";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking: string;
  toolCalls: ToolCall[];
  streaming: boolean;
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
      content: prompt,
      thinking: "",
      toolCalls: [],
      streaming: false,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      thinking: "",
      toolCalls: [],
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
            updateAssistant((m) => ({
              ...m,
              content: m.content + event.text,
            }));
            break;
          case "tool_use":
            updateAssistant((m) => ({
              ...m,
              toolCalls: [
                ...m.toolCalls,
                {
                  id: event.tool_id,
                  name: event.tool,
                  input: event.input,
                },
              ],
            }));
            break;
          case "tool_result":
            updateAssistant((m) => ({
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === event.tool_id
                  ? { ...tc, output: event.output }
                  : tc,
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
              content: m.content + `\n\nError: ${event.message}`,
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
          content: m.content + `\n\nError: ${errorText}`,
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
        // Backend has no session — clear any stale persisted messages
        if (messages.length > 0) {
          set({ messages: [], sessionId: null });
        }
      } else if (backendSessionId !== sessionId) {
        // Session mismatch — backend restarted with a different session
        set({ messages: [], sessionId: null });
        fetch("/api/chat/reset", { method: "POST" });
      }
      // If sessions match, persisted messages are still valid
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
