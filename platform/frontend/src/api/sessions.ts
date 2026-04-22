import { apiFetch } from "./client";
import type { ChatMessage } from "../hooks/useChatStore";

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
