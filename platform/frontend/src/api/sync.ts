import { apiFetch } from "./client";

export type SyncStatus = {
  dirty: boolean;
  ahead: number;
  behind: number;
  can_pull: boolean;
  can_push: boolean;
  // Present when the backend reports the repo is not initialized
  initialized?: boolean;
  error?: string;
};

export const fetchSyncStatus = (): Promise<SyncStatus> =>
  apiFetch<SyncStatus>("/sync/status");

export const pullSync = (): Promise<{ status: "ok" }> =>
  apiFetch<{ status: "ok" }>("/sync/pull", { method: "POST" });

export const pushSync = (
  message: string,
): Promise<{ status: "ok"; commit: string }> =>
  apiFetch<{ status: "ok"; commit: string }>("/sync/push", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
