import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  activeClaudeSessionId: string | null;
  setActiveClaudeSessionId: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeClaudeSessionId: null,
      setActiveClaudeSessionId: (id) => set({ activeClaudeSessionId: id }),
    }),
    { name: "context-session-store" },
  ),
);
