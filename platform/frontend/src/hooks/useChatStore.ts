import { create } from "zustand";
import { persist } from "zustand/middleware";
import { streamChat, type ChatEvent } from "../api/chat";
import { useSessionStore } from "./useSessionStore";
import { queryClient } from "../lib/queryClient";

export const NEW_CHAT_KEY = "__new_chat__";

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
  suggestions?: string[]; // ephemeral, never persisted
}

export interface TreeState {
  active_path: string[];
  accessed_files: string[];
  module_counts: Record<string, number>;
}

interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>;
  streamingSessionId: string | null;
  abortController: AbortController | null;
  moduleToolCompletedCount: number;
  model: string | null;
  // Live, ephemeral. Belongs to whatever stream is currently running (or
  // whatever just finished). Never persisted, never keyed by session — when
  // the user clicks a past session, they get the *current* live tree, not a
  // reconstruction of that session's history.
  currentTreeState: TreeState | null;

  sendMessage: (sessionId: string | null, prompt: string) => void;
  cancelStream: () => void;
  clearMessages: (sessionId: string) => void;
  deleteSessionMessages: (sessionId: string) => void;
  resetTreeState: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      streamingSessionId: null,
      abortController: null,
      moduleToolCompletedCount: 0,
      model: null,
      currentTreeState: null,

      sendMessage: (inputSessionId: string | null, prompt: string) => {
        // Use a placeholder key when starting a brand-new chat; migrate to the
        // real Claude session id as soon as the `session` SSE event arrives.
        let sessionId: string = inputSessionId ?? NEW_CHAT_KEY;
        const claudeSessionIdToSend: string | null = inputSessionId;
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
          // Fresh tree for this turn — we don't carry over what the previous
          // stream visited.
          currentTreeState: null,
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
          claudeSessionIdToSend,
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
              case "session": {
                const newId = event.session_id;
                if (event.model) {
                  set({ model: event.model });
                }
                useSessionStore.getState().setActiveClaudeSessionId(newId);
                if (newId && newId !== sessionId) {
                  const oldId = sessionId;
                  set((state) => {
                    const oldMsgs = state.messagesBySession[oldId];
                    const {
                      [oldId]: _drop,
                      ...restMsgs
                    } = state.messagesBySession;
                    return {
                      messagesBySession: {
                        ...restMsgs,
                        [newId]: oldMsgs ?? [],
                      },
                      streamingSessionId:
                        state.streamingSessionId === oldId
                          ? newId
                          : state.streamingSessionId,
                    };
                  });
                  sessionId = newId;
                }
                break;
              }
              case "suggestion":
                updateAssistant((m) => ({
                  ...m,
                  suggestions: [...(m.suggestions ?? []), event.prompt],
                }));
                break;
              case "tree_navigation":
                set({
                  currentTreeState: {
                    active_path: event.active_path,
                    accessed_files: event.accessed_files,
                    module_counts: event.module_counts,
                  },
                });
                break;
              case "error":
                updateAssistant((m) => ({
                  ...m,
                  error: event.message,
                  streaming: false,
                }));
                set({ streamingSessionId: null, abortController: null });
                queryClient.invalidateQueries({ queryKey: ["sessions"] });
                break;
              case "done":
                updateAssistant((m) => ({ ...m, streaming: false }));
                set({ streamingSessionId: null, abortController: null });
                queryClient.invalidateQueries({ queryKey: ["sessions"] });
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

      resetTreeState: () => {
        set({ currentTreeState: null });
      },
    }),
    {
      name: "context-chat-store",
      partialize: (state) => ({
        messagesBySession: Object.fromEntries(
          Object.entries(state.messagesBySession).map(([sid, msgs]) => [
            sid,
            msgs.map((m) => {
              const { suggestions: _drop, ...rest } = m;
              return { ...rest, streaming: false };
            }),
          ]),
        ),
      }),
    },
  ),
);
