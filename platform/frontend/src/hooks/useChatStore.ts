import { create } from "zustand";
import { persist } from "zustand/middleware";
import { streamChat, type ChatEvent } from "../api/chat";
import { useSessionStore } from "./useSessionStore";

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
  messagesBySession: Record<string, ChatMessage[]>;
  streamingSessionId: string | null;
  abortController: AbortController | null;
  moduleToolCompletedCount: number;
  treeState: {
    active_path: string[];
    accessed_files: string[];
    module_counts: Record<string, number>;
  } | null;

  sendMessage: (sessionId: string, prompt: string) => void;
  cancelStream: () => void;
  clearMessages: (sessionId: string) => void;
  deleteSessionMessages: (sessionId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      streamingSessionId: null,
      abortController: null,
      moduleToolCompletedCount: 0,
      treeState: null,

      sendMessage: (sessionId: string, prompt: string) => {
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

        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [
              ...(state.messagesBySession[sessionId] || []),
              userMsg,
              assistantMsg,
            ],
          },
          streamingSessionId: sessionId,
          abortController: controller,
        }));

        const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
          set((state) => {
            const msgs = state.messagesBySession[sessionId] || [];
            return {
              messagesBySession: {
                ...state.messagesBySession,
                [sessionId]: msgs.map((m) =>
                  m.id === assistantId ? updater(m) : m,
                ),
              },
            };
          });
        };

        streamChat(
          prompt,
          sessionId,
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
                  if (last && last.type === "text") {
                    parts[parts.length - 1] = {
                      type: "text",
                      text: last.text + event.text,
                    };
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
                updateAssistant((m) => {
                  let isModuleTool = false;
                  const parts = m.parts.map((p) => {
                    if (p.type === "tool_call" && p.toolCall.id === event.tool_id) {
                      if (p.toolCall.name.startsWith("mcp__modules__")) {
                        isModuleTool = true;
                      }
                      return {
                        ...p,
                        toolCall: {
                          ...p.toolCall,
                          output: event.output,
                          completedAt: Date.now(),
                        },
                      };
                    }
                    return p;
                  });
                  if (isModuleTool) {
                    setTimeout(() => {
                      set((s) => ({ moduleToolCompletedCount: s.moduleToolCompletedCount + 1 }));
                    }, 0);
                  }
                  return { ...m, parts };
                });
                break;
              case "tool_input":
                break;
              case "session":
                // Claude session_id is now tracked server-side per session
                break;
              case "session_name":
                // Auto-rename session from first prompt
                useSessionStore.getState().renameSession(sessionId, event.name);
                break;
              case "error":
                updateAssistant((m) => ({
                  ...m,
                  error: event.message,
                }));
                break;
              case "done":
                updateAssistant((m) => ({ ...m, streaming: false }));
                set({ streamingSessionId: null, abortController: null });
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
          set({ streamingSessionId: null, abortController: null });
        });
      },

      cancelStream: () => {
        const { abortController } = get();
        abortController?.abort();
        set({ streamingSessionId: null, abortController: null });
      },

      clearMessages: (sessionId: string) => {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [],
          },
        }));
      },

      deleteSessionMessages: (sessionId: string) => {
        set((state) => {
          const { [sessionId]: _, ...rest } = state.messagesBySession;
          return { messagesBySession: rest };
        });
      },
    }),
    {
      name: "context-chat-store",
      partialize: (state) => ({
        messagesBySession: Object.fromEntries(
          Object.entries(state.messagesBySession).map(([sid, msgs]) => [
            sid,
            msgs.map((m) => ({ ...m, streaming: false })),
          ]),
        ),
      }),
    },
  ),
);
