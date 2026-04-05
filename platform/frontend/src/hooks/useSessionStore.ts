import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LocalSession {
  id: string;
  name: string;
  createdAt: number;
}

interface SessionState {
  sessions: LocalSession[];
  activeSessionId: string | null;

  setActiveSession: (id: string) => void;
  addSession: (session: LocalSession) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, _get) => ({
      sessions: [],
      activeSessionId: null,

      setActiveSession: (id: string) => {
        set({ activeSessionId: id });
      },

      addSession: (session: LocalSession) => {
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        }));
      },

      removeSession: (id: string) => {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id);
          const newActive =
            state.activeSessionId === id
              ? remaining[0]?.id ?? null
              : state.activeSessionId;
          return { sessions: remaining, activeSessionId: newActive };
        });
      },

      renameSession: (id: string, name: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, name } : s,
          ),
        }));
      },
    }),
    {
      name: "context-session-store",
    },
  ),
);
