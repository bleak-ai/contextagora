import { apiFetch } from "./client";
import type { ChatMessage } from "../hooks/useChatStore";
import type { ChatMode } from "./chat";

export interface SessionInfo {
  id: string;
  name: string;
  created_at: number;
}

export async function fetchSessions(): Promise<{ sessions: SessionInfo[] }> {
  return apiFetch("/sessions");
}

export async function fetchSessionMessages(
  sessionId: string,
): Promise<{ messages: ChatMessage[] }> {
  return apiFetch(`/sessions/${encodeURIComponent(sessionId)}/messages`);
}

export async function getSessionMode(sessionId: string): Promise<ChatMode> {
  const res = await apiFetch<{ mode: ChatMode }>(
    `/sessions/${encodeURIComponent(sessionId)}/mode`,
  );
  return res.mode;
}

export async function setSessionMode(
  sessionId: string,
  mode: ChatMode,
): Promise<void> {
  await apiFetch<{ mode: ChatMode }>(
    `/sessions/${encodeURIComponent(sessionId)}/mode`,
    {
      method: "PUT",
      body: JSON.stringify({ mode }),
    },
  );
}
