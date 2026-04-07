import { apiFetch } from "./client";

export interface SessionInfo {
  id: string;
  name: string;
  created_at: number;
}

export async function fetchSessions(): Promise<{ sessions: SessionInfo[] }> {
  return apiFetch("/sessions");
}
