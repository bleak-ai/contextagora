import { create } from "zustand";
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
  isStreaming: boolean;
  abortController: AbortController | null;

  sendMessage: (prompt: string) => void;
  cancelStream: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
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
    set({ messages: [], isStreaming: false, abortController: null });
  },
}));
