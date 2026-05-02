import { create } from "zustand";
import { persist } from "zustand/middleware";
import { streamChat, type ChatEvent, type ChatMode } from "../api/chat";
import { setSessionMode } from "../api/sessions";
import { queryClient, invalidateModuleQueries } from "../lib/queryClient";
import type {
  ChatMessage,
  ContentPart,
  ToolCall,
  TreeState,
  ValidationErrorEntry,
} from "./chatTypes";

export type {
  ChatMessage,
  ContentPart,
  ToolCall,
  TreeState,
  ValidationErrorEntry,
};

export const NEW_CHAT_KEY = "__new_chat__";

interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>;
  streamingSessionId: string | null;
  abortController: AbortController | null;
  model: string | null;
  mode: ChatMode;
  // Live, ephemeral. Belongs to whatever stream is currently running (or
  // whatever just finished). Never persisted, never keyed by session — when
  // the user clicks a past session, they get the *current* live tree, not a
  // reconstruction of that session's history.
  currentTreeState: TreeState | null;

  sendMessage: (sessionId: string | null, prompt: string) => void;
  cancelStream: () => void;
  clearMessages: (sessionId: string) => void;
  deleteSessionMessages: (sessionId: string) => void;
  hydrateSession: (sessionId: string, messages: ChatMessage[]) => void;
  resetTreeState: () => void;
  setMode: (mode: ChatMode, sessionId?: string | null) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      streamingSessionId: null,
      abortController: null,
      model: null,
      mode: "quick",
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

        // Turn-scoped flag: only refresh module/workspace queries if a
        // state-changing tool ran. Pure Q&A / read-only exploration doesn't
        // need to invalidate the sidebar caches.
        const MUTATING_TOOLS = new Set([
          "Write",
          "Edit",
          "MultiEdit",
          "NotebookEdit",
          "Bash",
        ]);
        let turnMutatedState = false;

        streamChat(
          prompt,
          claudeSessionIdToSend,
          get().mode,
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
                if (MUTATING_TOOLS.has(event.tool)) {
                  turnMutatedState = true;
                }
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
                          toolCall: {
                            ...p.toolCall,
                            output: event.output,
                            completedAt: Date.now(),
                          },
                        }
                      : p,
                  ),
                }));
                break;
              case "tool_input":
                break;
              case "session": {
                const newId = event.session_id;
                if (event.model) {
                  set({ model: event.model });
                }
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
              case "validation_error":
                updateAssistant((m) => ({
                  ...m,
                  validationErrors: [
                    ...(m.validationErrors ?? []),
                    { module: event.module, errors: event.errors },
                  ],
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
                if (turnMutatedState) invalidateModuleQueries(queryClient);
                break;
              case "done":
                updateAssistant((m) => ({ ...m, streaming: false }));
                set({ streamingSessionId: null, abortController: null });
                queryClient.invalidateQueries({ queryKey: ["sessions"] });
                if (turnMutatedState) invalidateModuleQueries(queryClient);
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

      hydrateSession: (sessionId: string, messages: ChatMessage[]) => {
        set((state) => {
          if (state.streamingSessionId === sessionId) return state;
          return {
            messagesBySession: {
              ...state.messagesBySession,
              [sessionId]: messages.map((m) => ({
                ...m,
                streaming: false,
                thinking: m.thinking ?? "",
                parts: m.parts ?? [],
              })),
            },
          };
        });
      },

      resetTreeState: () => {
        set({ currentTreeState: null });
      },

      setMode: async (mode: ChatMode, sessionId?: string | null) => {
        // Update local state immediately so the UI reflects the new mode
        // even if the persistence call is in flight or fails.
        set({ mode });
        if (sessionId) {
          try {
            await setSessionMode(sessionId, mode);
          } catch (e) {
            console.error("failed to persist session mode", e);
          }
        }
      },
    }),
    {
      name: "context-chat-store",
      // Messages are NOT persisted. They live on the server (parsed from
      // Claude's JSONL transcripts) and are hydrated on session open, so
      // multiple devices see the same history.
      partialize: () => ({}),
    },
  ),
);
