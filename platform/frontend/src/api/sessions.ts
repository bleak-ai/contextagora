import { apiFetch } from "./client";

export interface SessionInfo {
  id: string;
  name: string;
  created_at: number;
}

export async function fetchSessions(): Promise<{ sessions: SessionInfo[] }> {
  return apiFetch("/sessions");
}

export async function createSession(name?: string): Promise<SessionInfo> {
  return apiFetch("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "New chat" }),
  });
}

export async function renameSession(id: string, name: string): Promise<SessionInfo> {
  return apiFetch(`/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/sessions/${id}`, { method: "DELETE" });
}
